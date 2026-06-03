import type { Webhook } from "../db/schema.js";

// Raw SQLite rows come back snake_cased. The UI expects camelCase. Drizzle's
// query builder would map this for us, but the routes use hand-written SQL for
// filtering/aggregation, so map explicitly here.
type Row = Record<string, unknown>;

export function rowToWebhook(row: Row): Webhook {
  return {
    id: row.id as string,
    method: row.method as string,
    path: row.path as string,
    headersJson: row.headers_json as string,
    body: (row.body as string | null) ?? null,
    queryParams: (row.query_params as string | null) ?? null,
    contentType: (row.content_type as string | null) ?? null,
    contentLength: (row.content_length as number | null) ?? null,
    sourceIp: (row.source_ip as string | null) ?? null,
    receivedAt: row.received_at as number,
    source: row.source as string,
    eventType: (row.event_type as string | null) ?? null,
    forwardedTo: (row.forwarded_to as string | null) ?? null,
    forwardStatus: (row.forward_status as number | null) ?? null,
    forwardDurationMs: (row.forward_duration_ms as number | null) ?? null,
    forwardError: (row.forward_error as string | null) ?? null,
    replayCount: row.replay_count as number,
    lastReplayedAt: (row.last_replayed_at as number | null) ?? null,
    replayOf: (row.replay_of as string | null) ?? null,
    signatureStatus: row.signature_status as string,
    signatureNotes: (row.signature_notes as string | null) ?? null,
  };
}
