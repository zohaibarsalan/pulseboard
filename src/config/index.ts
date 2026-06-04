import { homedir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";

const RawConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.coerce.number().int().positive().default(4500),

  // Where to forward captured webhooks. If unset, Pulseboard runs in
  // capture-only mode (stores + displays, returns 200 without proxying).
  forwardTo: z.string().url().optional(),

  // Timeout for the forward request before recording a failure.
  forwardTimeoutMs: z.coerce.number().int().positive().default(30_000),

  readonly: z.boolean().default(false),
  dbPath: z.string().default(resolve(homedir(), ".pulseboard", "pulseboard.db")),
  authPassword: z.string().optional(),

  // Mask header values whose name contains any of these tokens (case-insensitive)
  // when displaying in the UI. Raw bytes are still stored for replay/forwarding.
  redactHeaders: z
    .array(z.string())
    .default(["authorization", "cookie", "x-api-key", "secret", "token"]),

  retentionDays: z.coerce.number().int().positive().default(30),
  maxDbSizeMb: z.coerce.number().int().positive().default(1024),
});

export type Config = z.infer<typeof RawConfigSchema>;

export type ConfigOverrides = {
  host?: string;
  port?: number | string;
  forward?: string;
  forwardTimeout?: number | string;
  readonly?: boolean;
  db?: string;
};

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  return raw === "true" || raw === "1" || raw === "yes";
}

function parseList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const env = process.env;

  const merged = {
    host: overrides.host ?? env.PULSEBOARD_HOST ?? env.WEBHOOK_STUDIO_HOST,
    port: overrides.port ?? env.PULSEBOARD_PORT ?? env.WEBHOOK_STUDIO_PORT,
    forwardTo: overrides.forward ?? env.PULSEBOARD_FORWARD ?? env.WEBHOOK_STUDIO_FORWARD,
    forwardTimeoutMs:
      overrides.forwardTimeout ?? env.PULSEBOARD_FORWARD_TIMEOUT_MS ?? env.WEBHOOK_STUDIO_FORWARD_TIMEOUT_MS,
    readonly: overrides.readonly ?? parseBool(env.PULSEBOARD_READONLY) ?? parseBool(env.WEBHOOK_STUDIO_READONLY),
    dbPath: overrides.db ?? env.PULSEBOARD_DB_PATH ?? env.WEBHOOK_STUDIO_DB_PATH,
    authPassword: env.PULSEBOARD_AUTH_PASSWORD ?? env.WEBHOOK_STUDIO_AUTH_PASSWORD,
    redactHeaders: parseList(env.PULSEBOARD_REDACT_HEADERS) ?? parseList(env.WEBHOOK_STUDIO_REDACT_HEADERS),
    retentionDays: env.PULSEBOARD_RETENTION_DAYS ?? env.WEBHOOK_STUDIO_RETENTION_DAYS,
    maxDbSizeMb: env.PULSEBOARD_MAX_DB_SIZE_MB ?? env.WEBHOOK_STUDIO_MAX_DB_SIZE_MB,
  };

  const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));

  return RawConfigSchema.parse(cleaned);
}
