#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, type ConfigOverrides } from "./config/index.js";
import { openDb, closeDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { LiveEventBus } from "./capture/event-bus.js";
import { buildApp } from "./server/app.js";
import type { AppContext } from "./server/context.js";

const program = new Command();

program
  .name("pulseboard")
  .description("Pulseboard is a local-first webhook dashboard for capturing, inspecting, replaying, and forwarding webhooks")
  .version("0.1.0")
  .option("--forward <url>", "Forward captured webhooks to this URL (e.g. http://localhost:3000)")
  .option("--port <port>", "Bind port (default 4500)")
  .option("--host <host>", "Bind host (default 127.0.0.1)")
  .option("--forward-timeout <ms>", "Forward request timeout in ms (default 30000)")
  .option("--readonly", "Disable replay and clear actions")
  .option("--db <path>", "SQLite DB path")
  .action(async (opts) => {
    try {
      await start(opts);
    } catch (err) {
      console.error(pc.red("Failed to start Pulseboard:"), err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  });

async function start(opts: ConfigOverrides): Promise<void> {
  const config = loadConfig(opts);

  console.log(pc.dim(`Pulseboard starting...`));
  console.log(pc.dim(`  DB:      ${config.dbPath}`));
  console.log(pc.dim(`  Forward: ${config.forwardTo ?? "(capture-only mode)"}`));

  const db = openDb(config.dbPath);
  runMigrations(db);

  const bus = new LiveEventBus();

  const ctx: AppContext = {
    config,
    db,
    bus,
    startedAt: Date.now(),
    lastCapturedAt: { value: null },
  };

  const app = await buildApp(ctx);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      closeDb(db);
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.host, port: config.port });

  const displayHost =
    config.host === "127.0.0.1" || config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;

  console.log(pc.green(`\n  Pulseboard is running at http://${displayHost}:${config.port}\n`));
  console.log(pc.dim(`  Dashboard:   http://${displayHost}:${config.port}`));
  console.log(pc.bold(`  Capture URL: http://${displayHost}:${config.port}/hook/...`));
  console.log(
    pc.dim(
      `\n  Point your webhook provider (or tunnel) at the capture URL.\n` +
        `  Example: https://your-tunnel.ngrok.io/hook/stripe\n`,
    ),
  );
}

program.parseAsync(process.argv).catch((err) => {
  console.error(pc.red("Fatal:"), err);
  process.exit(1);
});
