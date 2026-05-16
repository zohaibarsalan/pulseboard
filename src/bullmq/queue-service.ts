import type { Queue } from "bullmq";
import type { QueueRegistry, RegisteredQueue } from "./queue-registry.js";

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

async function readCounts(queue: Queue): Promise<QueueCounts> {
  const counts = await queue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused",
    "waiting-children",
  );

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
    "waiting-children": counts["waiting-children"] ?? 0,
  };
}

export async function summarizeQueue({ name, queue }: RegisteredQueue): Promise<QueueSummary> {
  const [counts, isPaused] = await Promise.all([readCounts(queue), queue.isPaused()]);
  return { name, counts, isPaused };
}

export async function summarizeAll(registry: QueueRegistry): Promise<QueueSummary[]> {
  return Promise.all(registry.list().map(summarizeQueue));
}
