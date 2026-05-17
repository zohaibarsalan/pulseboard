export type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  "waiting-children": number;
};

export type QueueSummary = {
  name: string;
  counts: QueueCounts;
  isPaused: boolean;
};

export type Health = {
  status: "ok" | "degraded";
  redis: "connected" | "disconnected";
  redisUrl: string;
  redisHost: string;
  sqlite: "open" | "closed";
  instanceId: string;
  uptimeSeconds: number;
  lastIndexedAt: number | null;
  readonly: boolean;
  version: string;
};

export type ActivityBucket = { ts: number; completed: number; failed: number };
export type Activity = {
  instanceId: string;
  bucketSizeSeconds: number;
  rangeDays: number;
  buckets: ActivityBucket[];
  totals: { completed: number; failed: number };
};

export type ErrorGroup = {
  id: string;
  instanceId: string;
  queueName: string;
  jobName: string | null;
  errorHash: string;
  failedReason: string | null;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
};

export type IndexedJob = {
  id: string;
  instanceId: string;
  queueName: string;
  jobId: string;
  jobName: string;
  status: string;
  attemptsMade: number | null;
  createdAt: number | null;
  processedOn: number | null;
  finishedOn: number | null;
  waitTimeMs: number | null;
  processingTimeMs: number | null;
  failedReason: string | null;
  errorHash: string | null;
  stacktracePreview: string | null;
  updatedAt: number;
};

export type JobDetail = {
  instanceId: string;
  queueName: string;
  jobId: string;
  live: {
    name: string;
    data: unknown;
    returnValue: unknown;
    opts: unknown;
    attemptsMade: number;
    progress: unknown;
    timestamp: number | null;
    processedOn: number | null;
    finishedOn: number | null;
    failedReason: string | null;
    stacktrace: string[] | null;
    parent: unknown;
  } | null;
  indexed: IndexedJob | null;
  timeline: JobEvent[];
  removedFromRedis: boolean;
};

export type JobEvent = {
  id: string;
  instanceId: string;
  queueName: string;
  jobId: string;
  eventType: "active" | "completed" | "failed" | "stalled";
  attemptsMade: number | null;
  workerId: string | null;
  processedOn: number | null;
  eventDataJson: string | null;
  createdAt: number;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return (await res.json()) as T;
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
}

async function getText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return res.text();
}

export const api = {
  health: () => get<Health>("/api/health"),
  queues: (instanceId: string) =>
    get<{ instanceId: string; queues: QueueSummary[] }>(`/api/instances/${instanceId}/queues`),
  events: (instanceId: string, queueName: string, limit = 50) =>
    get<{ events: JobEvent[]; nextBefore: number | null }>(
      `/api/instances/${instanceId}/queues/${queueName}/events?limit=${limit}`,
    ),
  activity: (instanceId: string, days = 7, queue?: string) =>
    get<Activity>(
      `/api/instances/${instanceId}/activity?days=${days}${queue ? `&queue=${encodeURIComponent(queue)}` : ""}`,
    ),
  job: (instanceId: string, queueName: string, jobId: string) =>
    get<JobDetail>(
      `/api/instances/${instanceId}/queues/${queueName}/jobs/${encodeURIComponent(jobId)}`,
    ),
  errorGroups: (instanceId: string) =>
    get<{ instanceId: string; groups: ErrorGroup[] }>(`/api/instances/${instanceId}/error-groups`),
  errorGroupJobs: (instanceId: string, errorHash: string) =>
    get<{ instanceId: string; errorHash: string; jobs: IndexedJob[] }>(
      `/api/instances/${instanceId}/error-groups/${errorHash}/jobs`,
    ),

  retryJob: (instanceId: string, queueName: string, jobId: string) =>
    post<{ ok: true; action: "retry"; jobId: string }>(
      `/api/instances/${instanceId}/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/retry`,
    ),
  removeJob: (instanceId: string, queueName: string, jobId: string) =>
    post<{ ok: true; action: "remove"; jobId: string }>(
      `/api/instances/${instanceId}/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/remove`,
    ),
  pauseQueue: (instanceId: string, queueName: string) =>
    post<{ ok: true; action: "pause"; queueName: string }>(
      `/api/instances/${instanceId}/queues/${encodeURIComponent(queueName)}/pause`,
    ),
  resumeQueue: (instanceId: string, queueName: string) =>
    post<{ ok: true; action: "resume"; queueName: string }>(
      `/api/instances/${instanceId}/queues/${encodeURIComponent(queueName)}/resume`,
    ),

  debugContext: (instanceId: string, queueName: string, jobId: string) =>
    getText(
      `/api/instances/${instanceId}/queues/${encodeURIComponent(queueName)}/jobs/${encodeURIComponent(jobId)}/debug-context`,
    ),
};
