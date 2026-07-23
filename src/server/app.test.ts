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
import { webhooks } from "../db/schema.js";
import { buildApp } from "./app.js";

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
  let secondReceived = Buffer.alloc(0);
  const target = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received = Buffer.concat(chunks);
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
