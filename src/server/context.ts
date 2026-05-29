import type { Config } from "../config/index.js";
import type { Db } from "../db/client.js";
import type { LiveEventBus } from "../capture/event-bus.js";

export type AppContext = {
  config: Config;
  db: Db;
  bus: LiveEventBus;
  startedAt: number;
  lastCapturedAt: { value: number | null };
};
