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
  sqlite: "open" | "closed";
  instanceId: string;
  uptimeSeconds: number;
  lastIndexedAt: number | null;
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

export const api = {
  health: () => get<Health>("/api/health"),
  queues: (instanceId: string) =>
    get<{ instanceId: string; queues: QueueSummary[] }>(`/api/instances/${instanceId}/queues`),
  events: (instanceId: string, queueName: string, limit = 50) =>
    get<{ events: JobEvent[]; nextBefore: number | null }>(
      `/api/instances/${instanceId}/queues/${queueName}/events?limit=${limit}`,
    ),
};
