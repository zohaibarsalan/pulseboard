import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

type Params = { instanceId: string };
type Query = { days?: string; queue?: string };

const DAY_MS = 86_400_000;

export async function analyticsRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: Params; Querystring: Query }>(
    "/api/instances/:instanceId/analytics/performance",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
      const since = Date.now() - days * DAY_MS;
      const queueFilter = req.query.queue;

      const params: (string | number)[] = [ctx.instanceId, since];
      const queueClause = queueFilter ? "and queue_name = ?" : "";
      if (queueFilter) params.push(queueFilter);

      const stmt = ctx.db.$client.prepare(`
        select
          count(*) as total,
          avg(processing_time_ms) as avg_processing,
          avg(wait_time_ms) as avg_wait
        from jobs
        where instance_id = ?
          and finished_on >= ?
          ${queueClause}
          and status in ('completed', 'failed')
          and processing_time_ms is not null
      `);

      const row = stmt.get(...params) as {
        total: number;
        avg_processing: number | null;
        avg_wait: number | null;
      };

      const p95Stmt = ctx.db.$client.prepare(`
        select processing_time_ms
        from jobs
        where instance_id = ?
          and finished_on >= ?
          ${queueClause}
          and status in ('completed', 'failed')
          and processing_time_ms is not null
        order by processing_time_ms asc
      `);

      const allTimes = p95Stmt.all(...params) as { processing_time_ms: number }[];
      const p95Processing =
        allTimes.length > 0
          ? allTimes[Math.floor(allTimes.length * 0.95)]?.processing_time_ms ?? null
          : null;

      return {
        instanceId: ctx.instanceId,
        rangeDays: days,
        totalJobs: row.total,
        avgProcessingTimeMs: row.avg_processing ? Math.round(row.avg_processing) : null,
        avgWaitTimeMs: row.avg_wait ? Math.round(row.avg_wait) : null,
        p95ProcessingTimeMs: p95Processing,
      };
    },
  );

  app.get<{ Params: Params; Querystring: Query }>(
    "/api/instances/:instanceId/analytics/slowest-jobs",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
      const since = Date.now() - days * DAY_MS;
      const queueFilter = req.query.queue;

      const params: (string | number)[] = [ctx.instanceId, since];
      const queueClause = queueFilter ? "and queue_name = ?" : "";
      if (queueFilter) params.push(queueFilter);

      const stmt = ctx.db.$client.prepare(`
        select
          job_id,
          queue_name,
          job_name,
          status,
          processing_time_ms,
          wait_time_ms,
          finished_on
        from jobs
        where instance_id = ?
          and finished_on >= ?
          ${queueClause}
          and status in ('completed', 'failed')
          and processing_time_ms is not null
        order by processing_time_ms desc
        limit 10
      `);

      const rows = stmt.all(...params) as {
        job_id: string;
        queue_name: string;
        job_name: string;
        status: string;
        processing_time_ms: number;
        wait_time_ms: number | null;
        finished_on: number;
      }[];

      return {
        instanceId: ctx.instanceId,
        rangeDays: days,
        jobs: rows.map((r) => ({
          jobId: r.job_id,
          queueName: r.queue_name,
          jobName: r.job_name,
          status: r.status,
          processingTimeMs: r.processing_time_ms,
          waitTimeMs: r.wait_time_ms,
          finishedOn: r.finished_on,
        })),
      };
    },
  );

  app.get<{ Params: Params; Querystring: Query }>(
    "/api/instances/:instanceId/analytics/top-failures",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
      const since = Date.now() - days * DAY_MS;
      const queueFilter = req.query.queue;

      const params: (string | number)[] = [ctx.instanceId, since];
      const queueClause = queueFilter ? "and queue_name = ?" : "";
      if (queueFilter) params.push(queueFilter);

      const stmt = ctx.db.$client.prepare(`
        select
          queue_name,
          job_name,
          count(*) as failure_count,
          max(finished_on) as last_failure
        from jobs
        where instance_id = ?
          and finished_on >= ?
          ${queueClause}
          and status = 'failed'
        group by queue_name, job_name
        order by failure_count desc
        limit 10
      `);

      const rows = stmt.all(...params) as {
        queue_name: string;
        job_name: string;
        failure_count: number;
        last_failure: number;
      }[];

      return {
        instanceId: ctx.instanceId,
        rangeDays: days,
        failures: rows.map((r) => ({
          queueName: r.queue_name,
          jobName: r.job_name,
          failureCount: r.failure_count,
          lastFailure: r.last_failure,
        })),
      };
    },
  );
}
