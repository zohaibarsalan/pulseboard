import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

type Params = { instanceId: string };
type Query = { days?: string; queue?: string };

const DAY_MS = 86_400_000;

type Row = { bucket: number; type: string; n: number };

export async function activityRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: Params; Querystring: Query }>(
    "/api/instances/:instanceId/activity",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
      const since = Date.now() - days * DAY_MS;
      const queueFilter = req.query.queue;

      const bucketSize = DAY_MS;
      const queueClause = queueFilter ? "and queue_name = @queue" : "";
      const stmt = ctx.db.$client.prepare(`
        select
          (created_at / @bucketSize) * @bucketSize as bucket,
          event_type as type,
          count(*) as n
        from job_events
        where instance_id = @instanceId
          and created_at >= @since
          ${queueClause}
          and event_type in ('completed', 'failed')
        group by bucket, type
        order by bucket asc
      `);

      const rows = stmt.all({
        instanceId: ctx.instanceId,
        since,
        bucketSize,
        ...(queueFilter ? { queue: queueFilter } : {}),
      }) as Row[];

      const byBucket = new Map<number, { completed: number; failed: number }>();
      const start = Math.floor(since / bucketSize) * bucketSize;
      const end = Math.floor(Date.now() / bucketSize) * bucketSize;
      for (let b = start; b <= end; b += bucketSize) {
        byBucket.set(b, { completed: 0, failed: 0 });
      }
      for (const row of rows) {
        const bucket = byBucket.get(row.bucket);
        if (!bucket) continue;
        if (row.type === "completed") bucket.completed = row.n;
        if (row.type === "failed") bucket.failed = row.n;
      }

      const buckets = Array.from(byBucket.entries())
        .map(([ts, counts]) => ({ ts, ...counts }))
        .sort((a, b) => a.ts - b.ts);

      const totals = buckets.reduce(
        (acc, b) => ({ completed: acc.completed + b.completed, failed: acc.failed + b.failed }),
        { completed: 0, failed: 0 },
      );

      return {
        instanceId: ctx.instanceId,
        bucketSizeSeconds: bucketSize / 1000,
        rangeDays: days,
        buckets,
        totals,
      };
    },
  );
}
