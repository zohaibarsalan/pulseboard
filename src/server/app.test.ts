import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import { LiveEventBus } from "../capture/event-bus.js";
import { targetsForWebhook } from "../capture/routing.js";
import type { Config } from "../config/index.js";
import { closeDb, openDb } from "../db/client.js";
import { maintainDatabase } from "../db/maintenance.js";
import { runMigrations } from "../db/migrate.js";
import { deliveryAttempts, webhooks } from "../db/schema.js";
import { buildApp } from "./app.js";
import { updateRetryPolicy } from "../delivery/attempts.js";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanup.length > 0) await cleanup.pop()?.();
});

function createContext(configOverrides: Partial<Config> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "pulseboard-test-"));
  const db = openDb(join(directory, "pulseboard.db"));
  runMigrations(db);
  cleanup.push(() => {
    closeDb(db);
    rmSync(directory, { recursive: true, force: true });
  });
  const config: Config = {
    host: "127.0.0.1",
    port: 4500,
    forwardTargets: [],
    routingRules: [],
    allowedForwardHosts: [],
    forwardTimeoutMs: 2_000,
    readonly: false,
    dbPath: join(directory, "pulseboard.db"),
    redactHeaders: ["authorization", "token"],
    retentionDays: 30,
    maxDbSizeMb: 64,
    ...configOverrides,
  };
  if (config.forwardTo && config.forwardTargets.length === 0) config.forwardTargets = [config.forwardTo];
  return {
    config,
    db,
    bus: new LiveEventBus(),
    startedAt: Date.now(),
    lastCapturedAt: { value: null },
  };
}

test("capture preserves exact bytes, redacts client headers, and requires configured auth", async () => {
  let received = Buffer.alloc(0);
  let receivedHeaders: Record<string, string | string[] | undefined> = {};
  let secondReceived = Buffer.alloc(0);
  const target = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received = Buffer.concat(chunks);
      receivedHeaders = req.headers;
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
        res.end();
        return;
      }
      res.writeHead(201, { "content-type": "application/json", "x-token": "private-response" });
      res.end('{"accepted":true}');
    });
  });
  const secondTarget = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      secondReceived = Buffer.concat(chunks);
      res.writeHead(202, { "content-type": "text/plain" }).end("queued");
    });
  });
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => secondTarget.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => target.close((error) => error ? reject(error) : resolve())));
  cleanup.push(() => new Promise<void>((resolve, reject) => secondTarget.close((error) => error ? reject(error) : resolve())));
  const port = (target.address() as AddressInfo).port;
  const secondPort = (secondTarget.address() as AddressInfo).port;

  const ctx = createContext({
    forwardTargets: [`http://127.0.0.1:${port}`, `http://127.0.0.1:${secondPort}`],
    authPassword: "test-password",
  });
  const app = await buildApp(ctx);
  cleanup.push(() => app.close());

  const payload = Buffer.from([0xff, 0x00, 0x61, 0xc3, 0x28]);
  const capture = await app.inject({
    method: "POST",
    url: "/hook/binary",
    headers: {
      "content-type": "application/octet-stream",
      authorization: "Bearer private",
      "x-token": "secret-token",
    },
    payload,
  });
  assert.equal(capture.statusCode, 201);
  assert.deepEqual(received, payload);
  assert.deepEqual(secondReceived, payload);

  const stored = ctx.db.$client
    .prepare("SELECT body_base64, deliveries_json, response_body FROM webhooks ORDER BY received_at DESC LIMIT 1")
    .get() as { body_base64: string; deliveries_json: string; response_body: string };
  assert.deepEqual(Buffer.from(stored.body_base64, "base64"), payload);
  assert.equal(JSON.parse(stored.deliveries_json).length, 2);
  assert.equal(stored.response_body, '{"accepted":true}');

  const storedWebhook = ctx.db.$client
    .prepare("SELECT id FROM webhooks ORDER BY received_at DESC LIMIT 1")
    .get() as { id: string };
  const attemptRows = ctx.db.$client
    .prepare("SELECT target, attempt_number, state FROM delivery_attempts WHERE webhook_id = ? ORDER BY target")
    .all(storedWebhook.id) as Array<{ target: string; attempt_number: number; state: string }>;
  assert.equal(attemptRows.length, 2);
  assert.deepEqual(new Set(attemptRows.map((row) => row.state)), new Set(["delivered"]));

  const unauthorized = await app.inject({ method: "GET", url: "/api/webhooks" });
  assert.equal(unauthorized.statusCode, 401);

  const authorized = await app.inject({
    method: "GET",
    url: "/api/webhooks",
    headers: { authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}` },
  });
  assert.equal(authorized.statusCode, 200);
  const headers = JSON.parse(authorized.json().webhooks[0].headersJson) as Record<string, string>;
  assert.equal(headers.authorization, "••••••••");
  assert.equal(headers["x-token"], "••••••••");
  const responseHeaders = JSON.parse(authorized.json().webhooks[0].responseHeadersJson) as Record<string, string>;
  assert.equal(responseHeaders["x-token"], "••••••••");
  assert.equal(JSON.parse(authorized.json().webhooks[0].deliveriesJson).length, 2);
  assert.equal(authorized.json().webhooks[0].bodyBase64, undefined);

  const deliveries = await app.inject({
    method: "GET",
    url: `/api/webhooks/${storedWebhook.id}/deliveries`,
    headers: { authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}` },
  });
  assert.equal(deliveries.statusCode, 200);
  assert.equal(deliveries.json().targets.length, 2);
  assert.equal(deliveries.json().policy.automaticRetries, false);

  const retry = await app.inject({
    method: "POST",
    url: `/api/webhooks/${storedWebhook.id}/deliveries/retry`,
    headers: {
      authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ attemptId: deliveries.json().targets[0].attempts[0].id }),
  });
  assert.equal(retry.statusCode, 200);
  assert.equal(typeof retry.json().attemptId, "string");
  const retriedDeliveries = await app.inject({
    method: "GET",
    url: `/api/webhooks/${storedWebhook.id}/deliveries`,
    headers: { authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}` },
  });
  assert.equal(retriedDeliveries.json().targets[0].attempts[0].attemptNumber, 2);
  assert.equal(retriedDeliveries.json().targets[0].attempts[0].trigger, "manual");
  assert.equal(retriedDeliveries.json().targets[0].attempts[0].state, "delivered");

  const editedReplay = await app.inject({
    method: "POST",
    url: `/api/webhooks/${storedWebhook.id}/replay`,
    headers: {
      authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      headers: { "content-type": "application/octet-stream" },
    }),
  });
  assert.equal(editedReplay.statusCode, 200);
  assert.equal(receivedHeaders["content-type"], "application/octet-stream");
  assert.equal(receivedHeaders["x-token"], undefined);
  assert.equal(receivedHeaders.authorization, undefined);

  const policyUpdate = await app.inject({
    method: "PUT",
    url: "/api/delivery-policy",
    headers: {
      authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      automaticRetries: true,
      maxAttempts: 4,
      baseDelayMs: 5_000,
      maxDelayMs: 60_000,
    }),
  });
  assert.equal(policyUpdate.statusCode, 200);
  assert.equal(policyUpdate.json().automaticRetries, true);
  assert.equal(policyUpdate.json().maxAttempts, 4);

  const filterHeaders = { authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}` };
  const matchingFilters = await app.inject({
    method: "GET",
    url: "/api/webhooks?method=POST&signature=not_applicable",
    headers: filterHeaders,
  });
  assert.equal(matchingFilters.statusCode, 200);
  assert.equal(matchingFilters.json().webhooks.length, 2);
  const excludedMethod = await app.inject({
    method: "GET",
    url: "/api/webhooks?method=GET",
    headers: filterHeaders,
  });
  assert.equal(excludedMethod.statusCode, 200);
  assert.equal(excludedMethod.json().webhooks.length, 0);

  const blockedOverride = await app.inject({
    method: "POST",
    url: "/api/sender/send",
    headers: {
      authorization: `Basic ${Buffer.from("pulseboard:test-password").toString("base64")}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ target: "http://169.254.169.254/latest/meta-data", body: "{}" }),
  });
  assert.equal(blockedOverride.statusCode, 400);
  assert.equal(blockedOverride.json().error, "forward_target_not_allowed");

  const redirect = await app.inject({
    method: "POST",
    url: "/hook/redirect",
    payload: "{}",
  });
  assert.equal(redirect.statusCode, 302);
  const redirectedDelivery = ctx.db.$client
    .prepare("SELECT forward_status FROM webhooks WHERE path = '/redirect' LIMIT 1")
    .get() as { forward_status: number };
  assert.equal(redirectedDelivery.forward_status, 302);
});

test("database maintenance removes rows beyond retention", () => {
  const ctx = createContext({ retentionDays: 7 });
  const now = Date.now();
  const base = {
    method: "POST",
    path: "/test",
    headersJson: "{}",
    source: "unknown",
    replayCount: 0,
    signatureStatus: "not_applicable",
  };
  ctx.db.insert(webhooks).values([
    { ...base, id: "old", receivedAt: now - 8 * 86_400_000 },
    { ...base, id: "recent", receivedAt: now },
  ]).run();

  const result = maintainDatabase(ctx.db, ctx.config);
  assert.equal(result.deleted, 1);
  const ids = ctx.db.$client.prepare("SELECT id FROM webhooks").all() as Array<{ id: string }>;
  assert.deepEqual(ids.map((row) => row.id), ["recent"]);
});

test("routing rules override defaults and combine matching targets", () => {
  const config = {
    forwardTargets: ["http://default.test"],
    routingRules: [
      { source: "stripe", targets: ["http://billing.test"] },
      { pathPrefix: "/critical", targets: ["http://audit.test"] },
    ],
  };
  assert.deepEqual(
    targetsForWebhook(config, { source: "stripe", path: "/critical/payment" }),
    ["http://billing.test", "http://audit.test"],
  );
  assert.deepEqual(
    targetsForWebhook(config, { source: "github", path: "/push" }),
    ["http://default.test"],
  );
});

test("capture-only mode acknowledges and persists webhooks without delivery attempts", async () => {
  const ctx = createContext();
  const app = await buildApp(ctx);
  cleanup.push(() => app.close());

  const capture = await app.inject({
    method: "POST",
    url: "/hook/capture-only?mode=test",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ type: "capture.only" }),
  });
  assert.equal(capture.statusCode, 200);

  const stored = ctx.db.$client
    .prepare("SELECT path, query_params, forwarded_to, forward_status FROM webhooks LIMIT 1")
    .get() as {
      path: string;
      query_params: string;
      forwarded_to: string | null;
      forward_status: number | null;
    };
  assert.equal(stored.path, "/capture-only");
  assert.equal(stored.query_params, "mode=test");
  assert.equal(stored.forwarded_to, null);
  assert.equal(stored.forward_status, null);

  const attempts = ctx.db.$client
    .prepare("SELECT COUNT(*) AS count FROM delivery_attempts")
    .get() as { count: number };
  assert.equal(attempts.count, 0);

  const health = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(health.json().version, "0.1.0");
  assert.deepEqual(health.json().forwardTargets, []);
});

test("readonly mode still captures but blocks destructive and secret mutations", async () => {
  const ctx = createContext({ readonly: true });
  const app = await buildApp(ctx);
  cleanup.push(() => app.close());

  const capture = await app.inject({
    method: "POST",
    url: "/hook/readonly",
    payload: "{}",
  });
  assert.equal(capture.statusCode, 200);
  const webhookId = capture.json().captured as string;

  const clear = await app.inject({ method: "POST", url: "/api/webhooks/clear" });
  assert.equal(clear.statusCode, 403);
  const replay = await app.inject({
    method: "POST",
    url: `/api/webhooks/${webhookId}/replay`,
  });
  assert.equal(replay.statusCode, 403);
  const secret = await app.inject({
    method: "POST",
    url: "/api/secrets/stripe",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ secret: "whsec_test" }),
  });
  assert.equal(secret.statusCode, 403);

  const remaining = ctx.db.$client
    .prepare("SELECT COUNT(*) AS count FROM webhooks")
    .get() as { count: number };
  assert.equal(remaining.count, 1);
});

test("automatic delivery retries recover a transient target without duplicating the webhook", async () => {
  let requests = 0;
  const target = createServer((_req, res) => {
    requests += 1;
    if (requests === 1) {
      res.writeHead(503, { "content-type": "application/json" }).end('{"ready":false}');
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end('{"ready":true}');
  });
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => target.close((error) => error ? reject(error) : resolve())));
  const port = (target.address() as AddressInfo).port;
  const ctx = createContext({ forwardTargets: [`http://127.0.0.1:${port}`] });
  updateRetryPolicy(ctx.db, {
    automaticRetries: true,
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 20,
  });
  const app = await buildApp(ctx);
  cleanup.push(() => app.close());

  const capture = await app.inject({
    method: "POST",
    url: "/hook/recover",
    headers: { "content-type": "application/json" },
    payload: '{"type":"retry.test"}',
  });
  assert.equal(capture.statusCode, 503);
  const webhookId = capture.json().captured as string;

  await waitFor(() => {
    const row = ctx.db.$client
      .prepare(
        `SELECT state FROM delivery_attempts
         WHERE webhook_id = ? AND attempt_number = 2`,
      )
      .get(webhookId) as { state: string } | undefined;
    return row?.state === "delivered";
  }, 2_500);

  const attempts = ctx.db.$client
    .prepare("SELECT attempt_number, trigger, state FROM delivery_attempts WHERE webhook_id = ? ORDER BY attempt_number")
    .all(webhookId) as Array<{ attempt_number: number; trigger: string; state: string }>;
  assert.deepEqual(attempts, [
    { attempt_number: 1, trigger: "initial", state: "failed" },
    { attempt_number: 2, trigger: "automatic", state: "delivered" },
  ]);
  const webhookCount = ctx.db.$client
    .prepare("SELECT COUNT(*) AS count FROM webhooks WHERE id = ?")
    .get(webhookId) as { count: number };
  assert.equal(webhookCount.count, 1);
});

test("analytics exposes latency percentiles and actionable delivery diagnostics", async () => {
  const ctx = createContext();
  const now = Date.now();
  const base = {
    method: "POST",
    headersJson: "{}",
    receivedAt: now,
    source: "github",
    replayCount: 0,
    signatureStatus: "valid",
    forwardedTo: "http://target.test",
  };
  ctx.db.insert(webhooks).values([
    { ...base, id: "healthy", path: "/healthy", forwardStatus: 200, forwardDurationMs: 100 },
    { ...base, id: "missing", path: "/missing", forwardStatus: 404, forwardDurationMs: 20 },
    {
      ...base,
      id: "timeout",
      path: "/timeout",
      forwardDurationMs: 2_000,
      forwardError: "Timed out after 2000ms",
    },
    {
      ...base,
      id: "invalid-signature",
      path: "/signed",
      forwardStatus: 200,
      forwardDurationMs: 50,
      signatureStatus: "invalid",
    },
    { ...base, id: "slow", path: "/slow", forwardStatus: 200, forwardDurationMs: 7_000 },
  ]).run();
  ctx.db.insert(deliveryAttempts).values([
    {
      id: "healthy-attempt",
      webhookId: "healthy",
      target: "http://target.test",
      attemptNumber: 1,
      trigger: "initial",
      state: "delivered",
      scheduledAt: now,
      startedAt: now,
      completedAt: now + 100,
      statusCode: 200,
      durationMs: 100,
    },
    {
      id: "timeout-attempt-1",
      webhookId: "timeout",
      target: "http://target.test",
      attemptNumber: 1,
      trigger: "initial",
      state: "failed",
      scheduledAt: now,
      startedAt: now,
      completedAt: now + 2_000,
      durationMs: 2_000,
      error: "Timed out after 2000ms",
    },
    {
      id: "timeout-attempt-2",
      webhookId: "timeout",
      target: "http://target.test",
      attemptNumber: 2,
      trigger: "manual",
      state: "delivered",
      scheduledAt: now + 3_000,
      startedAt: now + 3_000,
      completedAt: now + 3_050,
      statusCode: 200,
      durationMs: 50,
    },
  ]).run();

  const app = await buildApp(ctx);
  cleanup.push(() => app.close());

  const summary = await app.inject({ method: "GET", url: "/api/analytics/summary?days=1" });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().current.total, 5);
  assert.equal(summary.json().current.failed, 2);
  assert.equal(summary.json().current.p95ForwardMs, 7_000);
  assert.equal(summary.json().current.slowDeliveries, 1);

  const diagnostics = await app.inject({ method: "GET", url: "/api/analytics/diagnostics?days=1" });
  assert.equal(diagnostics.statusCode, 200);
  const payload = diagnostics.json();
  assert.deepEqual(
    new Set(payload.failureReasons.map((row: { reason: string }) => row.reason)),
    new Set(["route_not_found", "timeout", "signature_invalid", "slow_handler"]),
  );
  assert.equal(payload.statusClasses.find((row: { key: string }) => row.key === "2xx")?.count, 3);
  assert.equal(payload.statusClasses.find((row: { key: string }) => row.key === "4xx")?.count, 1);
  assert.equal(payload.statusClasses.find((row: { key: string }) => row.key === "network_error")?.count, 1);
  assert.equal(payload.slowestEndpoints[0].path, "/slow");
  assert.equal(payload.recentIssues.length, 4);
  assert.equal(payload.deliveryLifecycle.targets, 2);
  assert.equal(payload.deliveryLifecycle.retriedTargets, 1);
  assert.equal(payload.deliveryLifecycle.recoveredTargets, 1);
  assert.equal(payload.deliveryLifecycle.firstAttemptSuccessRate, 50);
});

async function waitFor(check: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Condition was not met within ${timeoutMs}ms`);
}
