import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  cancelQueuedAttempt,
  DeliveryAttemptConflictError,
  ensureLegacyDeliveryAttempts,
  getRetryPolicy,
  listDeliveryTargets,
  retryDeliveryTarget,
  updateRetryPolicy,
} from "../../delivery/attempts.js";
import type { AppContext } from "../context.js";
import { redactHeaderRecord, redactUrl } from "../serialize.js";

const PolicySchema = z.object({
  automaticRetries: z.boolean(),
  maxAttempts: z.number().int().min(1).max(10),
  baseDelayMs: z.number().int().min(1_000).max(3_600_000),
  maxDelayMs: z.number().int().min(1_000).max(86_400_000),
}).refine((policy) => policy.maxDelayMs >= policy.baseDelayMs, {
  message: "Maximum delay must be greater than or equal to the base delay.",
});

export async function deliveriesRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/webhooks/:id/deliveries", async (req, reply) => {
    const exists = ctx.db.$client
      .prepare("SELECT 1 FROM webhooks WHERE id = ?")
      .get(req.params.id);
    if (!exists) return reply.code(404).send({ error: "not_found" });
    ensureLegacyDeliveryAttempts(ctx, req.params.id);
    return {
      policy: getRetryPolicy(ctx.db),
      targets: listDeliveryTargets(ctx.db, req.params.id).map((target) => ({
        ...target,
        target: redactUrl(target.target) ?? target.target,
        attempts: target.attempts.map((attempt) => {
          const headers = attempt.responseHeadersJson
            ? JSON.parse(attempt.responseHeadersJson) as Record<string, string>
            : null;
          if (headers) redactHeaderRecord(headers, ctx.config.redactHeaders);
          return {
            ...attempt,
            target: redactUrl(attempt.target) ?? attempt.target,
            responseHeadersJson: headers ? JSON.stringify(headers) : null,
          };
        }),
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/api/webhooks/:id/deliveries/retry", async (req, reply) => {
    if (ctx.config.readonly) return reply.code(403).send({ error: "readonly" });
    const body = parseBody(req.body);
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : null;
    if (!attemptId) return reply.code(400).send({ error: "attempt_id_required" });
    const known = ctx.db.$client
      .prepare("SELECT target FROM delivery_attempts WHERE id = ? AND webhook_id = ?")
      .get(attemptId, req.params.id) as { target: string } | undefined;
    if (!known) return reply.code(404).send({ error: "delivery_attempt_not_found" });
    try {
      const attempt = await retryDeliveryTarget(ctx, req.params.id, known.target);
      return { ok: true, attempt };
    } catch (error) {
      if (error instanceof DeliveryAttemptConflictError) {
        return reply.code(409).send({ error: "delivery_attempt_active" });
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string; attemptId: string } }>(
    "/api/webhooks/:id/deliveries/:attemptId/cancel",
    async (req, reply) => {
      if (ctx.config.readonly) return reply.code(403).send({ error: "readonly" });
      const cancelled = cancelQueuedAttempt(ctx.db, req.params.id, req.params.attemptId);
      if (!cancelled) return reply.code(409).send({ error: "delivery_attempt_not_queued" });
      return { ok: true };
    },
  );

  app.get("/api/delivery-policy", async () => getRetryPolicy(ctx.db));

  app.put("/api/delivery-policy", async (req, reply) => {
    if (ctx.config.readonly) return reply.code(403).send({ error: "readonly" });
    const parsed = PolicySchema.safeParse(parseBody(req.body));
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_delivery_policy",
        message: parsed.error.issues[0]?.message,
      });
    }
    return updateRetryPolicy(ctx.db, parsed.data);
  });
}

function parseBody(body: unknown): Record<string, unknown> {
  if (!Buffer.isBuffer(body) || body.length === 0) return {};
  try {
    return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}
