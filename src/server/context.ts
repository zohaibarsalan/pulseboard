import type { Config } from "../config/index.js";
import type { Db } from "../db/client.js";
import type { RedisConnection } from "../bullmq/connection.js";
import type { QueueRegistry } from "../bullmq/queue-registry.js";
import type { EventIndexer } from "../indexer/event-indexer.js";
import type { LiveEventBus } from "../indexer/event-bus.js";

export const DEFAULT_INSTANCE_ID = "default";

export type AppContext = {
  config: Config;
  db: Db;
  redis: RedisConnection;
  registry: QueueRegistry;
  indexer: EventIndexer | null;
  bus: LiveEventBus;
  instanceId: string;
  startedAt: number;
};
