import type { FastifyInstance } from "fastify";
import { pingRedis } from "../../bullmq/connection.js";
import type { AppContext } from "../context.js";

export async function healthRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/health", async () => {
    const redisOk = await pingRedis(ctx.redis);
    const sqliteOk = ctx.db.$client.open;

    return {
      status: redisOk && sqliteOk ? "ok" : "degraded",
      redis: redisOk ? "connected" : "disconnected",
      sqlite: sqliteOk ? "open" : "closed",
      instanceId: ctx.instanceId,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
    };
  });
}
