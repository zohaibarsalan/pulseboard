import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { errorGroups, jobs } from "../../db/schema.js";
import type { AppContext } from "../context.js";

type Params = { instanceId: string };
type GroupParams = { instanceId: string; errorHash: string };

export async function errorGroupsRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: Params }>("/api/instances/:instanceId/error-groups", async (req, reply) => {
    if (req.params.instanceId !== ctx.instanceId) {
      return reply.code(404).send({ error: "instance_not_found" });
    }
    const rows = ctx.db
      .select()
      .from(errorGroups)
      .where(eq(errorGroups.instanceId, ctx.instanceId))
      .orderBy(desc(errorGroups.lastSeenAt))
      .limit(200)
      .all();
    return { instanceId: ctx.instanceId, groups: rows };
  });

  app.get<{ Params: GroupParams }>(
    "/api/instances/:instanceId/error-groups/:errorHash/jobs",
    async (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        return reply.code(404).send({ error: "instance_not_found" });
      }
      const rows = ctx.db
        .select()
        .from(jobs)
        .where(and(eq(jobs.instanceId, ctx.instanceId), eq(jobs.errorHash, req.params.errorHash)))
        .orderBy(desc(jobs.updatedAt))
        .limit(200)
        .all();
      return { instanceId: ctx.instanceId, errorHash: req.params.errorHash, jobs: rows };
    },
  );
}
