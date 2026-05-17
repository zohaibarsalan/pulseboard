import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { jobs, jobEvents } from "../../db/schema.js";
import type { AppContext } from "../context.js";

type Params = { instanceId: string; queueName: string; jobId: string };

export async function jobRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: Params }>(
    "/api/instances/:instanceId/queues/:queueName/jobs/:jobId",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const queue = ctx.registry.get(req.params.queueName);
      const liveJob = queue ? await queue.getJob(req.params.jobId) : null;

      const indexedRow = ctx.db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.instanceId, ctx.instanceId),
            eq(jobs.queueName, req.params.queueName),
            eq(jobs.jobId, req.params.jobId),
          ),
        )
        .get();

      const timeline = ctx.db
        .select()
        .from(jobEvents)
        .where(
          and(
            eq(jobEvents.instanceId, ctx.instanceId),
            eq(jobEvents.queueName, req.params.queueName),
            eq(jobEvents.jobId, req.params.jobId),
          ),
        )
        .orderBy(desc(jobEvents.createdAt))
        .limit(50)
        .all();

      if (!liveJob && !indexedRow) {
        return reply.code(404).send({ error: "job_not_found" });
      }

      const storePayloads = ctx.config.storePayloads;
      const storeReturnValues = ctx.config.storeReturnValues;

      return {
        instanceId: ctx.instanceId,
        queueName: req.params.queueName,
        jobId: req.params.jobId,
        indexed: indexedRow ?? null,
        live: liveJob
          ? {
              name: liveJob.name,
              data: storePayloads ? liveJob.data : null,
              returnValue: storeReturnValues ? liveJob.returnvalue : null,
              opts: liveJob.opts,
              attemptsMade: liveJob.attemptsMade,
              progress: liveJob.progress,
              timestamp: liveJob.timestamp,
              processedOn: liveJob.processedOn,
              finishedOn: liveJob.finishedOn,
              failedReason: liveJob.failedReason,
              stacktrace: ctx.config.storeFullStacktraces
                ? liveJob.stacktrace
                : liveJob.stacktrace?.slice(0, 1) ?? null,
              parent: liveJob.parent,
            }
          : null,
        timeline,
        removedFromRedis: !liveJob && !!indexedRow,
      };
    },
  );
}
