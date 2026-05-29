import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export async function healthRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/health", async () => {
    const sqliteOk = ctx.db.$client.open;

    return {
      status: sqliteOk ? "ok" : "degraded",
      sqlite: sqliteOk ? "open" : "closed",
      forwardTo: ctx.config.forwardTo ?? null,
      captureUrl: `http://${ctx.config.host}:${ctx.config.port}/hook`,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
      lastCapturedAt: ctx.lastCapturedAt.value,
      readonly: ctx.config.readonly,
      version: "0.1.0-pre",
    };
  });
}
