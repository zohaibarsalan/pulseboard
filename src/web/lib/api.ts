export type Health = {
  status: "ok" | "degraded";
  sqlite: "open" | "closed";
  forwardTo: string | null;
  forwardTargets: string[];
  routingRules: Array<{ pathPrefix?: string; source?: string; targets: string[] }>;
  captureUrl: string;
  uptimeSeconds: number;
  lastCapturedAt: number | null;
  readonly: boolean;
  retentionDays: number;
  maxDbSizeMb: number;
  dbSizeBytes: number;
  authEnabled: boolean;
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
  responseHeadersJson: string | null;
  responseBody: string | null;
  responseContentType: string | null;
  responseBodyTruncated: boolean;
  deliveriesJson: string | null;
  replayCount: number;
  lastReplayedAt: number | null;
  replayOf: string | null;
  signatureStatus: SignatureStatus;
  signatureNotes: string | null;
};

export type SignatureStatus = "valid" | "invalid" | "no_secret" | "unverifiable" | "not_applicable";

export type SecretInfo = {
  source: string;
  configured: boolean;
  masked: string | null;
  updatedAt: number | null;
};

export type AnalyticsFilter = {
  days?: number;
  source?: string;
  status?: "success" | "failed" | "pending";
  signature?: "valid" | "invalid" | "no_secret" | "unverifiable" | "not_applicable";
};

export type AnalyticsSummary = {
  rangeDays: number;
  current: {
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
    avgForwardMs: number | null;
    p95ForwardMs: number | null;
    slowDeliveries: number;
    validSignatures: number;
    verifiableTotal: number;
  };
  previous: AnalyticsSummary["current"];
  derived: {
    successRate: number;
    signatureValidRate: number;
    totalTrendPct: number | null;
    successRateTrendPct: number | null;
    avgForwardTrendPct: number | null;
    signatureValidTrendPct: number | null;
  };
};

export type AnalyticsTimeseries = {
  bucketSizeSeconds: number;
  rangeDays: number;
  buckets: {
    ts: number;
    succeeded: number;
    failed: number;
    pending: number;
    avgForwardMs: number | null;
  }[];
};

export type AnalyticsBreakdownItem = {
  key: string;
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
};

export type AnalyticsBreakdown = {
  rangeDays: number;
  by: "source" | "event_type" | "path";
  items: AnalyticsBreakdownItem[];
};

export type AnalyticsDiagnostics = {
  rangeDays: number;
  issueTotal: number;
  failureReasons: Array<{ reason: string; count: number; percentage: number }>;
  statusClasses: Array<{ key: string; count: number }>;
  slowestEndpoints: Array<{
    path: string;
    total: number;
    failed: number;
    avgForwardMs: number;
    maxForwardMs: number;
  }>;
  recentIssues: Array<{
    id: string;
    source: string;
    eventType: string | null;
    path: string;
    forwardStatus: number | null;
    forwardError: string | null;
    receivedAt: number;
    reason: string;
  }>;
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
  method?: string;
  signature?: SignatureStatus;
  q?: string;
};

function buildAnalyticsParams(filter: AnalyticsFilter): string {
  const params = new URLSearchParams();
  if (filter.days != null) params.set("days", String(filter.days));
  if (filter.source) params.set("source", filter.source);
  if (filter.status) params.set("status", filter.status);
  if (filter.signature) params.set("signature", filter.signature);
  return params.toString();
}

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

  testConnection: async (path: string) => {
    const normalizedPath = `/${path.trim().replace(/^\/+/, "") || "webhook"}`;
    const marker = `pulseboard-connection-${Date.now()}`;
    const res = await fetch(`/hook${normalizedPath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-pulseboard-connection-test": marker,
      },
      body: JSON.stringify({
        type: "pulseboard.connection_test",
        marker,
        sentAt: new Date().toISOString(),
      }),
    });
    const payload = (await res.json()) as { captured?: string };
    if (!payload.captured) {
      throw new Error(`Pulseboard returned ${res.status} without a captured request ID`);
    }
    return {
      responseStatus: res.status,
      webhook: await get<Webhook>(`/api/webhooks/${payload.captured}`),
    };
  },

  webhooks: (filter: WebhookFilter = {}, limit = 50, before?: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (filter.source) params.set("source", filter.source);
    if (filter.status) params.set("status", filter.status);
    if (filter.method) params.set("method", filter.method);
    if (filter.signature) params.set("signature", filter.signature);
    if (filter.q) params.set("q", filter.q);
    if (before) params.set("before", String(before));
    return get<{ webhooks: Webhook[]; nextBefore: number | null }>(`/api/webhooks?${params.toString()}`);
  },

  webhook: (id: string) => get<Webhook>(`/api/webhooks/${id}`),

  sources: () => get<{ sources: SourceCount[] }>("/api/webhooks/sources"),

  stats: () => get<WebhookStats>("/api/webhooks/stats"),

  replay: (
    id: string,
    overrides?: { forwardTo?: string; body?: string; headers?: Record<string, string> },
  ) =>
    post<{ ok: true; replayId: string; result: DeliveryResult; results: DeliveryResult[] }>(
      `/api/webhooks/${id}/replay`,
      overrides && Object.keys(overrides).length > 0 ? overrides : undefined,
    ),

  clear: () => post<{ ok: true }>("/api/webhooks/clear"),

  analyticsSummary: (filter: AnalyticsFilter = {}) =>
    get<AnalyticsSummary>(`/api/analytics/summary?${buildAnalyticsParams(filter)}`),
  analyticsTimeseries: (filter: AnalyticsFilter = {}, bucket?: "hour" | "day") => {
    const params = new URLSearchParams(buildAnalyticsParams(filter));
    if (bucket) params.set("bucket", bucket);
    return get<AnalyticsTimeseries>(`/api/analytics/timeseries?${params.toString()}`);
  },
  analyticsBreakdown: (by: "source" | "event_type" | "path", filter: AnalyticsFilter = {}, limit = 10) => {
    const params = new URLSearchParams(buildAnalyticsParams(filter));
    params.set("by", by);
    params.set("limit", String(limit));
    return get<AnalyticsBreakdown>(`/api/analytics/breakdown?${params.toString()}`);
  },
  analyticsDiagnostics: (filter: AnalyticsFilter = {}) =>
    get<AnalyticsDiagnostics>(`/api/analytics/diagnostics?${buildAnalyticsParams(filter)}`),

  send: (input: {
    method: string;
    path: string;
    target?: string;
    headers: Record<string, string>;
    body: string;
    source: string;
    autoSign: boolean;
  }) =>
    post<{
      ok: true;
      id: string;
      result: DeliveryResult;
      results: DeliveryResult[];
      signedWith: string | null;
    }>("/api/sender/send", input),

  secrets: () => get<{ secrets: SecretInfo[] }>("/api/secrets"),
  setSecret: (source: string, secret: string) =>
    post<{ ok: true; source: string }>(`/api/secrets/${source}`, { secret }),
  deleteSecret: async (source: string) => {
    const res = await fetch(`/api/secrets/${source}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as { ok: true };
  },
};

export type DeliveryResult = {
  target: string;
  status: number | null;
  durationMs: number;
  error: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseContentType: string | null;
  responseBodyTruncated: boolean;
};
