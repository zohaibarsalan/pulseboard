#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, isServerlessRedis, type ConfigOverrides } from "./config/index.js";
import { openDb, closeDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createRedisConnection, pingRedis } from "./bullmq/connection.js";
import { QueueRegistry, discoverQueues } from "./bullmq/queue-registry.js";
import { EventIndexer } from "./indexer/event-indexer.js";
import { LiveEventBus } from "./indexer/event-bus.js";
import { buildApp } from "./server/app.js";
import { DEFAULT_INSTANCE_ID, type AppContext } from "./server/context.js";

const program = new Command();

program
  .name("pulseboard")
  .description("Local-first BullMQ studio")
  .version("0.1.0-pre")
  .option("--redis <url>", "Redis connection URL (e.g. redis://localhost:6379)")
  .option("--host <host>", "Bind host (default 127.0.0.1)")
  .option("--port <port>", "Bind port (default 4545)")
  .option("--queues <list>", "Comma-separated queue names to monitor")
  .option("--auto-discover", "Auto-discover queues from Redis (off by default)")
  .option("--force-discover", "Allow auto-discovery on serverless Redis")
  .option("--readonly", "Disable destructive actions")
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

  console.log(pc.dim(`Pulseboard starting…`));
  console.log(pc.dim(`  Redis: ${redactRedisUrl(config.redisUrl)}`));
  console.log(pc.dim(`  DB:    ${config.dbPath}`));

  if (config.storePayloads && config.host !== "127.0.0.1" && config.host !== "localhost") {
    console.warn(
      pc.yellow(
        `\n  ⚠  Binding to ${config.host} with payload storage enabled.\n` +
          `     Job payloads may contain secrets. Set PULSEBOARD_STORE_PAYLOADS=false\n` +
          `     or bind to 127.0.0.1 if you do not want them stored on disk.\n`,
      ),
    );
  }

  const db = openDb(config.dbPath);
  runMigrations(db);

  const redis = createRedisConnection(config.redisUrl);
  const redisOk = await pingRedis(redis);
  if (!redisOk) {
    throw new Error(`Could not reach Redis at ${redactRedisUrl(config.redisUrl)}`);
  }

  const registry = new QueueRegistry(redis);
  await resolveQueues(config, registry, redis);

  const bus = new LiveEventBus();
  const indexer =
    registry.list().length > 0
      ? new EventIndexer(db, registry, redis, { instanceId: DEFAULT_INSTANCE_ID, bus })
      : null;

  if (indexer) {
    indexer.start();
    console.log(pc.dim(`  Indexer: watching ${registry.list().length} queue(s)`));
  }

  const ctx: AppContext = {
    config,
    db,
    redis,
    registry,
    indexer,
    bus,
    instanceId: DEFAULT_INSTANCE_ID,
    startedAt: Date.now(),
  };

  const app = await buildApp(ctx);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      if (indexer) await indexer.stop();
      await registry.closeAll();
      redis.disconnect();
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

  console.log(pc.green(`\n  Pulseboard is running at http://${config.host}:${config.port}\n`));
  console.log(pc.dim(`  Instance: ${ctx.instanceId}`));
  console.log(pc.dim(`  Queues:   ${registry.list().map((q) => q.name).join(", ") || "(none registered)"}`));
}

async function resolveQueues(
  config: ReturnType<typeof loadConfig>,
  registry: QueueRegistry,
  redis: ReturnType<typeof createRedisConnection>,
): Promise<void> {
  if (config.queues.length > 0) {
    registry.registerMany(config.queues);
    return;
  }

  if (!config.autoDiscover) {
    console.log(
      pc.yellow(
        "  No queues specified. Pass --queues <names> or --auto-discover to register queues.",
      ),
    );
    return;
  }

  if (isServerlessRedis(config.redisUrl) && !config.forceDiscover) {
    console.log(
      pc.yellow(
        "  Auto-discovery is disabled on serverless Redis (Upstash/Redis Cloud). Pass --force-discover to override.",
      ),
    );
    return;
  }

  const discovered = await discoverQueues(redis);
  if (discovered.length === 0) {
    console.log(pc.yellow("  Auto-discovery found no BullMQ queues."));
    return;
  }

  console.log(pc.dim(`  Discovered ${discovered.length} queues: ${discovered.join(", ")}`));
  registry.registerMany(discovered);
}

function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return url;
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(pc.red("Fatal:"), err);
  process.exit(1);
});
