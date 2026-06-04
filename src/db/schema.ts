import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const webhooks = sqliteTable(
  "webhooks",
  {
    id: text("id").primaryKey(),

    // Request
    method: text("method").notNull(),
    path: text("path").notNull(),
    headersJson: text("headers_json").notNull(),
    body: text("body"),
    queryParams: text("query_params"),
    contentType: text("content_type"),
    contentLength: integer("content_length"),
    sourceIp: text("source_ip"),
    receivedAt: integer("received_at").notNull(),

    // Auto-detection
    source: text("source").notNull().default("unknown"),
    eventType: text("event_type"),

    // Forwarding
    forwardedTo: text("forwarded_to"),
    forwardStatus: integer("forward_status"),
    forwardDurationMs: integer("forward_duration_ms"),
    forwardError: text("forward_error"),

    // Replay tracking
    replayCount: integer("replay_count").notNull().default(0),
    lastReplayedAt: integer("last_replayed_at"),
    replayOf: text("replay_of"),

    // Signature verification
    // Status values: 'valid' | 'invalid' | 'no_secret' | 'unverifiable' | 'not_applicable'
    signatureStatus: text("signature_status").notNull().default("not_applicable"),
    signatureNotes: text("signature_notes"),
  },
  (t) => ({
    webhooksReceivedIdx: index("webhooks_received_idx").on(sql`${t.receivedAt} DESC`),
    webhooksSourceIdx: index("webhooks_source_idx").on(t.source, sql`${t.receivedAt} DESC`),
    webhooksPathIdx: index("webhooks_path_idx").on(t.path),
  }),
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

// Per-provider signing secrets. Stored locally because Pulseboard is a local-first
// dev tool — the secrets are already on the user's machine. The API never
// returns the raw secret, only a masked preview.
export const webhookSecrets = sqliteTable("webhook_secrets", {
  source: text("source").primaryKey(),
  secret: text("secret").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type WebhookSecret = typeof webhookSecrets.$inferSelect;
export type NewWebhookSecret = typeof webhookSecrets.$inferInsert;
