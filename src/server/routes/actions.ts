import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { auditLogs } from "../../db/schema.js";
import type { AppContext } from "../context.js";

type JobParams = { instanceId: string; queueName: string; jobId: string };
type QueueParams = { instanceId: string; queueName: string };

const LOCAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function audit(
  ctx: AppContext,
  req: FastifyRequest,
  action: string,
  queueName: string | null,
  jobId: string | null,
  extra: Record<string, unknown> = {},
): void {
  const source = LOCAL_IPS.has(req.ip) ? "localhost-trusted" : "password-auth";
  ctx.db
    .insert(auditLogs)
    .values({
      id: nanoid(),
      instanceId: ctx.instanceId,
      action,
      queueName,
      jobId,
      actor: "admin",
      actorSource: source,
      clientIp: req.ip ?? null,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      metadataJson: JSON.stringify(extra),
      createdAt: Date.now(),
    })
    .run();
}

function denyIfReadonly(ctx: AppContext, reply: FastifyReply): boolean {
  if (!ctx.config.readonly) return false;
  reply.code(403).send({ error: "readonly_mode", message: "Pulseboard is running in read-only mode." });
  return true;
}

export async function actionsRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post<{ Params: JobParams }>(
    "/api/instances/:instanceId/queues/:queueName/jobs/:jobId/retry",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) return reply.code(404).send({ error: "instance_not_found" });
      if (denyIfReadonly(ctx, reply)) return;
      const queue = ctx.registry.get(req.params.queueName);
      if (!queue) return reply.code(404).send({ error: "queue_not_found" });
      const job = await queue.getJob(req.params.jobId);
      if (!job) return reply.code(404).send({ error: "job_not_found" });
      await job.retry();
      audit(ctx, req, "retry", req.params.queueName, req.params.jobId);
      return { ok: true, action: "retry", jobId: req.params.jobId };
    },
  );

  app.post<{ Params: JobParams }>(
    "/api/instances/:instanceId/queues/:queueName/jobs/:jobId/remove",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) return reply.code(404).send({ error: "instance_not_found" });
      if (denyIfReadonly(ctx, reply)) return;
      const queue = ctx.registry.get(req.params.queueName);
      if (!queue) return reply.code(404).send({ error: "queue_not_found" });
      const job = await queue.getJob(req.params.jobId);
      if (!job) return reply.code(404).send({ error: "job_not_found" });
      await job.remove();
      audit(ctx, req, "remove", req.params.queueName, req.params.jobId);
      return { ok: true, action: "remove", jobId: req.params.jobId };
    },
  );

  app.post<{ Params: QueueParams }>(
    "/api/instances/:instanceId/queues/:queueName/pause",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) return reply.code(404).send({ error: "instance_not_found" });
      if (denyIfReadonly(ctx, reply)) return;
      const queue = ctx.registry.get(req.params.queueName);
      if (!queue) return reply.code(404).send({ error: "queue_not_found" });
      await queue.pause();
      audit(ctx, req, "pause", req.params.queueName, null);
      return { ok: true, action: "pause", queueName: req.params.queueName };
    },
  );

  app.post<{ Params: QueueParams }>(
    "/api/instances/:instanceId/queues/:queueName/resume",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) return reply.code(404).send({ error: "instance_not_found" });
      if (denyIfReadonly(ctx, reply)) return;
      const queue = ctx.registry.get(req.params.queueName);
      if (!queue) return reply.code(404).send({ error: "queue_not_found" });
      await queue.resume();
      audit(ctx, req, "resume", req.params.queueName, null);
      return { ok: true, action: "resume", queueName: req.params.queueName };
    },
  );
}
