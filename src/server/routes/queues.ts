import type { FastifyInstance } from "fastify";
import { summarizeAll } from "../../bullmq/queue-service.js";
import type { AppContext } from "../context.js";

type InstanceParams = { instanceId: string };

export async function queuesRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: InstanceParams }>("/api/instances/:instanceId/queues", async (req, reply) => {
    if (req.params.instanceId !== ctx.instanceId) {
      return reply.code(404).send({ error: "instance_not_found", instanceId: req.params.instanceId });
    }

    const summaries = await summarizeAll(ctx.registry);
    return { instanceId: ctx.instanceId, queues: summaries };
  });

  app.get("/api/instances", async () => {
    return { instances: [{ id: ctx.instanceId }] };
  });
}
