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
    bodyBase64: (row.body_base64 as string | null) ?? null,
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
    responseHeadersJson: (row.response_headers_json as string | null) ?? null,
    responseBody: (row.response_body as string | null) ?? null,
    responseContentType: (row.response_content_type as string | null) ?? null,
    responseBodyTruncated: Boolean(row.response_body_truncated),
    deliveriesJson: (row.deliveries_json as string | null) ?? null,
    replayCount: row.replay_count as number,
    lastReplayedAt: (row.last_replayed_at as number | null) ?? null,
    replayOf: (row.replay_of as string | null) ?? null,
    signatureStatus: row.signature_status as string,
    signatureNotes: (row.signature_notes as string | null) ?? null,
  };
}

export function webhookForClient(webhook: Webhook, redactedHeaderTokens: string[]): Omit<Webhook, "bodyBase64"> {
  const headers = JSON.parse(webhook.headersJson) as Record<string, string>;
  redactHeaderRecord(headers, redactedHeaderTokens);
  const responseHeaders = webhook.responseHeadersJson
    ? JSON.parse(webhook.responseHeadersJson) as Record<string, string>
    : null;
  if (responseHeaders) redactHeaderRecord(responseHeaders, redactedHeaderTokens);
  const deliveries = webhook.deliveriesJson
    ? JSON.parse(webhook.deliveriesJson) as Array<{
        target: string;
        responseHeaders: Record<string, string>;
        [key: string]: unknown;
      }>
    : null;
  if (deliveries) {
    for (const delivery of deliveries) {
      delivery.target = redactUrl(delivery.target) ?? delivery.target;
      redactHeaderRecord(delivery.responseHeaders, redactedHeaderTokens);
    }
  }
  const { bodyBase64: _bodyBase64, ...clientWebhook } = webhook;
  return {
    ...clientWebhook,
    headersJson: JSON.stringify(headers),
    forwardedTo: redactUrl(clientWebhook.forwardedTo),
    responseHeadersJson: responseHeaders ? JSON.stringify(responseHeaders) : null,
    deliveriesJson: deliveries ? JSON.stringify(deliveries) : null,
  };
}

function redactHeaderRecord(headers: Record<string, string>, tokens: string[]): void {
  const loweredTokens = tokens.map((token) => token.toLowerCase());
  for (const key of Object.keys(headers)) {
    const loweredKey = key.toLowerCase();
    if (loweredTokens.some((token) => loweredKey.includes(token))) headers[key] = "••••••••";
  }
}

export function redactUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username) url.username = "redacted";
    if (url.password) url.password = "redacted";
    for (const key of url.searchParams.keys()) url.searchParams.set(key, "redacted");
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}
