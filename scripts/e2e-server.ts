import { createServer, request } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LiveEventBus } from "../src/capture/event-bus.js";
import type { Config } from "../src/config/index.js";
import { closeDb, openDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { buildApp } from "../src/server/app.js";

const directory = mkdtempSync(join(tmpdir(), "pulseboard-e2e-"));

const echo = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    res.writeHead(200, {
      "content-type": "application/json",
      "x-e2e-response": "captured",
    });
    res.end(JSON.stringify({ received: true, body }));
  });
});
await new Promise<void>((resolve) => echo.listen(4599, "127.0.0.1", resolve));

function config(port: number, dbName: string, authPassword?: string): Config {
  return {
    host: "127.0.0.1",
    port,
    forwardTo: "http://127.0.0.1:4599",
    forwardTargets: ["http://127.0.0.1:4599"],
    routingRules: [],
    allowedForwardHosts: [],
    forwardTimeoutMs: 2_000,
    readonly: false,
    dbPath: join(directory, dbName),
    authPassword,
    redactHeaders: ["authorization", "cookie", "token"],
    retentionDays: 30,
    maxDbSizeMb: 64,
  };
}

async function startPulseboard(instanceConfig: Config) {
  const db = openDb(instanceConfig.dbPath);
  runMigrations(db);
  const app = await buildApp({
    config: instanceConfig,
    db,
    bus: new LiveEventBus(),
    startedAt: Date.now(),
    lastCapturedAt: { value: null },
  });
  await app.listen({ host: instanceConfig.host, port: instanceConfig.port });
  return { app, db };
}

const main = await startPulseboard(config(4510, "main.db"));
const authenticated = await startPulseboard(config(4511, "auth.db", "e2e-password"));

const proxy = createServer((incoming, outgoing) => {
  const upstream = request({
    hostname: "127.0.0.1",
    port: 4511,
    path: incoming.url,
    method: incoming.method,
    headers: incoming.headers,
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", (error) => {
    outgoing.writeHead(502, { "content-type": "text/plain" });
    outgoing.end(error.message);
  });
  incoming.pipe(upstream);
});
await new Promise<void>((resolve) => proxy.listen(4512, "127.0.0.1", resolve));

console.log("Pulseboard E2E servers ready");

let closing = false;
const shutdown = async (): Promise<void> => {
  if (closing) return;
  closing = true;
  await Promise.all([
    main.app.close(),
    authenticated.app.close(),
    new Promise<void>((resolve) => proxy.close(() => resolve())),
    new Promise<void>((resolve) => echo.close(() => resolve())),
  ]);
  closeDb(main.db);
  closeDb(authenticated.db);
  rmSync(directory, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
