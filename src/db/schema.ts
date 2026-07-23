import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const webhooks = sqliteTable(
  "webhooks",
  {
    id: text("id").primaryKey(),

    // Request
    method: text("method").notNull(),
    path: text("path").notNull(),
    headersJson: text("headers_json").notNull(),
    body: text("body"),
    // Exact request bytes, base64 encoded. `body` remains a UTF-8 preview for
    // display/search while forwarding and signature verification use this.
    bodyBase64: text("body_base64"),
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
    responseHeadersJson: text("response_headers_json"),
    responseBody: text("response_body"),
    responseContentType: text("response_content_type"),
    responseBodyTruncated: integer("response_body_truncated", { mode: "boolean" }).notNull().default(false),
    deliveriesJson: text("deliveries_json"),

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

export const deliveryAttempts = sqliteTable(
  "delivery_attempts",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    trigger: text("trigger").notNull(),
    state: text("state").notNull(),
    scheduledAt: integer("scheduled_at").notNull(),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    responseHeadersJson: text("response_headers_json"),
    responseBody: text("response_body"),
    responseContentType: text("response_content_type"),
    responseBodyTruncated: integer("response_body_truncated", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    deliveryAttemptsWebhookIdx: index("delivery_attempts_webhook_idx").on(t.webhookId, t.target, t.attemptNumber),
    deliveryAttemptsQueueIdx: index("delivery_attempts_queue_idx").on(t.state, t.scheduledAt),
    deliveryAttemptsUniqueIdx: uniqueIndex("delivery_attempts_unique_idx").on(t.webhookId, t.target, t.attemptNumber),
  }),
);

export type DeliveryAttempt = typeof deliveryAttempts.$inferSelect;
export type NewDeliveryAttempt = typeof deliveryAttempts.$inferInsert;

export const deliveryPolicy = sqliteTable("delivery_policy", {
  id: integer("id").primaryKey(),
  automaticRetries: integer("automatic_retries", { mode: "boolean" }).notNull().default(false),
  maxAttempts: integer("max_attempts").notNull().default(3),
  baseDelayMs: integer("base_delay_ms").notNull().default(5_000),
  maxDelayMs: integer("max_delay_ms").notNull().default(300_000),
  updatedAt: integer("updated_at").notNull(),
});

export type DeliveryPolicy = typeof deliveryPolicy.$inferSelect;

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
