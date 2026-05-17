import { homedir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";

const DurationOrAll = z.union([z.literal("all"), z.coerce.number().int().nonnegative()]);

const RawConfigSchema = z.object({
  redisUrl: z.string().url(),
  host: z.string().default("127.0.0.1"),
  port: z.coerce.number().int().positive().default(4545),
  queues: z.array(z.string()).default([]),
  autoDiscover: z.boolean().default(false),
  forceDiscover: z.boolean().default(false),
  readonly: z.boolean().default(false),
  dbPath: z.string().default(resolve(homedir(), ".pulseboard", "pulseboard.db")),
  authPassword: z.string().optional(),

  // Payload + return-value storage default to ON for developer ergonomics —
  // this is a local-first dev tool, the debug-context bundle and job drawer
  // are useless without them, and the redaction layer below masks common
  // secret-shaped keys. Use --readonly + the env flags below to opt out in
  // sensitive environments. A startup warning is printed if the server binds
  // to a non-localhost interface with payloads enabled (see cli.ts).
  storePayloads: z.boolean().default(true),
  storeReturnValues: z.boolean().default(true),
  storeFullStacktraces: z.boolean().default(true),
  redactKeys: z
    .array(z.string())
    .default([
      "password",
      "secret",
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "authorization",
      "cookie",
      "clientSecret",
      "privateKey",
    ]),

  reconcileIntervalSeconds: z.coerce.number().int().positive().default(60),
  bootstrapFailedLimit: DurationOrAll.default(1000),
  bootstrapCompletedLimit: DurationOrAll.default(500),
  bootstrapWaitingLimit: DurationOrAll.default(500),
  bootstrapDelayedLimit: DurationOrAll.default(500),
  bootstrapFailedSince: z.string().optional(),
  bootstrapCompletedSince: z.string().optional(),

  retentionEventsDays: z.coerce.number().int().positive().default(14),
  retentionCompletedDays: z.coerce.number().int().positive().default(7),
  retentionFailedDays: z.coerce.number().int().positive().default(30),
  retentionRollupsDays: z.coerce.number().int().positive().default(90),
  maxDbSizeMb: z.coerce.number().int().positive().default(2048),
});

export type Config = z.infer<typeof RawConfigSchema>;

export type ConfigOverrides = {
  redis?: string;
  host?: string;
  port?: number | string;
  queues?: string;
  autoDiscover?: boolean;
  forceDiscover?: boolean;
  readonly?: boolean;
  db?: string;
};

function parseQueueList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const env = process.env;

  const merged = {
    redisUrl: overrides.redis ?? env.REDIS_URL,
    host: overrides.host ?? env.PULSEBOARD_HOST,
    port: overrides.port ?? env.PULSEBOARD_PORT,
    queues: overrides.queues !== undefined ? parseQueueList(overrides.queues) : parseQueueList(env.PULSEBOARD_QUEUES),
    autoDiscover: overrides.autoDiscover ?? parseBool(env.PULSEBOARD_AUTO_DISCOVER),
    forceDiscover: overrides.forceDiscover ?? parseBool(env.PULSEBOARD_FORCE_DISCOVER),
    readonly: overrides.readonly ?? parseBool(env.PULSEBOARD_READONLY),
    dbPath: overrides.db ?? env.PULSEBOARD_DB_PATH,
    authPassword: env.PULSEBOARD_AUTH_PASSWORD,

    storePayloads: parseBool(env.PULSEBOARD_STORE_PAYLOADS),
    storeReturnValues: parseBool(env.PULSEBOARD_STORE_RETURN_VALUES),
    storeFullStacktraces: parseBool(env.PULSEBOARD_STORE_FULL_STACKTRACES),
    redactKeys: env.PULSEBOARD_REDACT_KEYS ? parseQueueList(env.PULSEBOARD_REDACT_KEYS) : undefined,

    reconcileIntervalSeconds: env.PULSEBOARD_RECONCILE_INTERVAL_SECONDS,
    bootstrapFailedLimit: env.PULSEBOARD_BOOTSTRAP_FAILED_LIMIT,
    bootstrapCompletedLimit: env.PULSEBOARD_BOOTSTRAP_COMPLETED_LIMIT,
    bootstrapWaitingLimit: env.PULSEBOARD_BOOTSTRAP_WAITING_LIMIT,
    bootstrapDelayedLimit: env.PULSEBOARD_BOOTSTRAP_DELAYED_LIMIT,
    bootstrapFailedSince: env.PULSEBOARD_BOOTSTRAP_FAILED_SINCE,
    bootstrapCompletedSince: env.PULSEBOARD_BOOTSTRAP_COMPLETED_SINCE,

    retentionEventsDays: env.PULSEBOARD_RETENTION_EVENTS_DAYS,
    retentionCompletedDays: env.PULSEBOARD_RETENTION_COMPLETED_DAYS,
    retentionFailedDays: env.PULSEBOARD_RETENTION_FAILED_DAYS,
    retentionRollupsDays: env.PULSEBOARD_RETENTION_ROLLUPS_DAYS,
    maxDbSizeMb: env.PULSEBOARD_MAX_DB_SIZE_MB,
  };

  const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));

  return RawConfigSchema.parse(cleaned);
}

const SERVERLESS_REDIS_HOSTS = ["upstash.io", "redis-cloud.com", "redislabs.com"];

export function isServerlessRedis(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SERVERLESS_REDIS_HOSTS.some((host) => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}
