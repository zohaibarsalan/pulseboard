import type { FastifyInstance } from "fastify";
import { pingRedis } from "../../bullmq/connection.js";
import type { AppContext } from "../context.js";

function redactRedis(url: string): { display: string; host: string } {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return { display: parsed.toString(), host: parsed.host };
  } catch {
    return { display: url, host: url };
  }
}

export async function healthRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/health", async () => {
    const redisOk = await pingRedis(ctx.redis);
    const sqliteOk = ctx.db.$client.open;
    const redis = redactRedis(ctx.config.redisUrl);

    return {
      status: redisOk && sqliteOk ? "ok" : "degraded",
      redis: redisOk ? "connected" : "disconnected",
      redisUrl: redis.display,
      redisHost: redis.host,
      sqlite: sqliteOk ? "open" : "closed",
      instanceId: ctx.instanceId,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
      lastIndexedAt: ctx.indexer?.getLastIndexedAt() ?? null,
      readonly: ctx.config.readonly,
      version: "0.1.0-pre",
    };
  });
}
