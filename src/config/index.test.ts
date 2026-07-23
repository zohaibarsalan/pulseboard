import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadConfig } from "./index.js";

const CONFIG_ENV_KEYS = [
  "PULSEBOARD_HOST",
  "PULSEBOARD_PORT",
  "PULSEBOARD_FORWARD",
  "PULSEBOARD_FORWARD_TARGETS",
  "PULSEBOARD_ROUTING_RULES",
  "PULSEBOARD_ALLOWED_FORWARD_HOSTS",
  "PULSEBOARD_FORWARD_TIMEOUT_MS",
  "PULSEBOARD_READONLY",
  "PULSEBOARD_DB_PATH",
  "PULSEBOARD_AUTH_PASSWORD",
  "PULSEBOARD_REDACT_HEADERS",
  "PULSEBOARD_RETENTION_DAYS",
  "PULSEBOARD_MAX_DB_SIZE_MB",
  "WEBHOOK_STUDIO_HOST",
  "WEBHOOK_STUDIO_PORT",
  "WEBHOOK_STUDIO_FORWARD",
  "WEBHOOK_STUDIO_READONLY",
] as const;

const originalEnv = new Map(CONFIG_ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of CONFIG_ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

function clearConfigEnv(): void {
  for (const key of CONFIG_ENV_KEYS) delete process.env[key];
}

test("configuration defaults to a localhost, persistent, capture-only server", () => {
  clearConfigEnv();
  const config = loadConfig();

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4500);
  assert.equal(config.forwardTo, undefined);
  assert.deepEqual(config.forwardTargets, []);
  assert.match(config.dbPath, /\.pulseboard[/\\]pulseboard\.db$/);
  assert.equal(config.readonly, false);
  assert.equal(config.retentionDays, 30);
  assert.equal(config.maxDbSizeMb, 1024);
});

test("CLI overrides win over environment and forwarding targets are de-duplicated", () => {
  clearConfigEnv();
  process.env.PULSEBOARD_HOST = "0.0.0.0";
  process.env.PULSEBOARD_PORT = "4999";
  process.env.PULSEBOARD_FORWARD = "http://localhost:3000";
  process.env.PULSEBOARD_FORWARD_TARGETS =
    "http://localhost:3000, http://localhost:4000, http://localhost:4000";
  process.env.PULSEBOARD_ALLOWED_FORWARD_HOSTS = "example.com, api.example.com";
  process.env.PULSEBOARD_ROUTING_RULES = JSON.stringify([
    { source: "stripe", targets: ["http://localhost:3000"] },
  ]);
  process.env.PULSEBOARD_READONLY = "true";

  const config = loadConfig({
    host: "127.0.0.2",
    port: "4600",
    forward: "http://localhost:5000",
    readonly: false,
    db: "/tmp/pulseboard-test.db",
  });

  assert.equal(config.host, "127.0.0.2");
  assert.equal(config.port, 4600);
  assert.equal(config.forwardTo, "http://localhost:5000");
  assert.deepEqual(config.forwardTargets, [
    "http://localhost:5000",
    "http://localhost:3000",
    "http://localhost:4000",
  ]);
  assert.deepEqual(config.allowedForwardHosts, ["example.com", "api.example.com"]);
  assert.deepEqual(config.routingRules, [
    { source: "stripe", targets: ["http://localhost:3000"] },
  ]);
  assert.equal(config.readonly, false);
  assert.equal(config.dbPath, "/tmp/pulseboard-test.db");
});

test("invalid ports, forwarding URLs, and routing rules fail before the server starts", () => {
  clearConfigEnv();
  assert.throws(() => loadConfig({ port: "0" }));
  assert.throws(() => loadConfig({ forward: "not-a-url" }));

  process.env.PULSEBOARD_ROUTING_RULES = JSON.stringify([
    { targets: ["http://localhost:3000"] },
  ]);
  assert.throws(() => loadConfig(), /pathPrefix or source/);

  process.env.PULSEBOARD_ROUTING_RULES = "{}";
  assert.throws(() => loadConfig(), /must be a JSON array/);
});
