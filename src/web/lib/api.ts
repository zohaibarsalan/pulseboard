export type Health = {
  status: "ok" | "degraded";
  sqlite: "open" | "closed";
  forwardTo: string | null;
  captureUrl: string;
  uptimeSeconds: number;
  lastCapturedAt: number | null;
  readonly: boolean;
  version: string;
};

export type Webhook = {
  id: string;
  method: string;
  path: string;
  headersJson: string;
  body: string | null;
  queryParams: string | null;
  contentType: string | null;
  contentLength: number | null;
  sourceIp: string | null;
  receivedAt: number;
  source: string;
  eventType: string | null;
  forwardedTo: string | null;
  forwardStatus: number | null;
  forwardDurationMs: number | null;
  forwardError: string | null;
  replayCount: number;
  lastReplayedAt: number | null;
  replayOf: string | null;
};

export type WebhookStats = {
  total: number;
  succeeded: number;
  failed: number;
  lastReceived: number | null;
};

export type SourceCount = { source: string; count: number };

export type WebhookFilter = {
  source?: string;
  status?: "success" | "failed" | "pending";
  q?: string;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => get<Health>("/api/health"),

  webhooks: (filter: WebhookFilter = {}, limit = 50, before?: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (filter.source) params.set("source", filter.source);
    if (filter.status) params.set("status", filter.status);
    if (filter.q) params.set("q", filter.q);
    if (before) params.set("before", String(before));
    return get<{ webhooks: Webhook[]; nextBefore: number | null }>(`/api/webhooks?${params.toString()}`);
  },

  webhook: (id: string) => get<Webhook>(`/api/webhooks/${id}`),

  sources: () => get<{ sources: SourceCount[] }>("/api/webhooks/sources"),

  stats: () => get<WebhookStats>("/api/webhooks/stats"),

  replay: (id: string, forwardTo?: string) =>
    post<{ ok: true; replayId: string; result: { status: number | null; durationMs: number; error: string | null } }>(
      `/api/webhooks/${id}/replay`,
      forwardTo ? { forwardTo } : undefined,
    ),

  clear: () => post<{ ok: true }>("/api/webhooks/clear"),
};
