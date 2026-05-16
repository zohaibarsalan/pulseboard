import type { FastifyInstance } from "fastify";
import { and, desc, eq, lt } from "drizzle-orm";
import { jobEvents } from "../../db/schema.js";
import type { AppContext } from "../context.js";

type EventsParams = { instanceId: string; queueName: string };
type EventsQuery = { limit?: string; before?: string };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function eventsRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: EventsParams; Querystring: EventsQuery }>(
    "/api/instances/:instanceId/queues/:queueName/events",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }

      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
      const before = req.query.before ? Number(req.query.before) : null;

      const whereClause = before
        ? and(
            eq(jobEvents.instanceId, ctx.instanceId),
            eq(jobEvents.queueName, req.params.queueName),
            lt(jobEvents.createdAt, before),
          )
        : and(
            eq(jobEvents.instanceId, ctx.instanceId),
            eq(jobEvents.queueName, req.params.queueName),
          );

      const rows = ctx.db
        .select()
        .from(jobEvents)
        .where(whereClause)
        .orderBy(desc(jobEvents.createdAt))
        .limit(limit)
        .all();

      return {
        instanceId: ctx.instanceId,
        queueName: req.params.queueName,
        events: rows,
        nextBefore: rows.length === limit ? rows[rows.length - 1]?.createdAt : null,
      };
    },
  );
}
