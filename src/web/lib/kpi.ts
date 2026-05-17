import type { Activity, ActivityBucket, QueueSummary } from "./api.js";

export type KpiRollup = {
  throughputPerHour: number;
  completedTotal: number;
  failedTotal: number;
  errorRate: number;
  completedSpark: number[];
  failedSpark: number[];
  completedTrendPct: number | null;
  failedTrendPct: number | null;
};

export function computeKpis(activity: Activity | undefined): KpiRollup {
  const buckets = activity?.buckets ?? [];
  const totals = activity?.totals ?? { completed: 0, failed: 0 };
  const days = Math.max(1, buckets.length || 1);

  const throughputPerHour = Math.round((totals.completed + totals.failed) / (days * 24));
  const total = totals.completed + totals.failed;
  const errorRate = total === 0 ? 0 : (totals.failed / total) * 100;

  return {
    throughputPerHour,
    completedTotal: totals.completed,
    failedTotal: totals.failed,
    errorRate,
    completedSpark: buckets.map((b) => b.completed),
    failedSpark: buckets.map((b) => b.failed),
    completedTrendPct: deltaPct(buckets, (b) => b.completed),
    failedTrendPct: deltaPct(buckets, (b) => b.failed),
  };
}

function deltaPct(buckets: ActivityBucket[], pick: (b: ActivityBucket) => number): number | null {
  if (buckets.length < 2) return null;
  const half = Math.floor(buckets.length / 2);
  const earlier = sum(buckets.slice(0, half).map(pick));
  const later = sum(buckets.slice(half).map(pick));
  if (earlier === 0 && later === 0) return null;
  if (earlier === 0) return 100;
  return ((later - earlier) / earlier) * 100;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function totalsByQueue(queues: QueueSummary[]): {
  active: number;
  waiting: number;
  failed: number;
  completed: number;
  delayed: number;
} {
  return queues.reduce(
    (acc, q) => ({
      active: acc.active + q.counts.active,
      waiting: acc.waiting + q.counts.waiting,
      failed: acc.failed + q.counts.failed,
      completed: acc.completed + q.counts.completed,
      delayed: acc.delayed + q.counts.delayed,
    }),
    { active: 0, waiting: 0, failed: 0, completed: 0, delayed: 0 },
  );
}
