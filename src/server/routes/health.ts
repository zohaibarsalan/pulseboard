import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { databaseSizeBytes } from "../../db/maintenance.js";
import { redactUrl } from "../serialize.js";

export async function healthRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/health", async () => {
    const sqliteOk = ctx.db.$client.open;

    return {
      status: sqliteOk ? "ok" : "degraded",
      sqlite: sqliteOk ? "open" : "closed",
      forwardTo: redactUrl(ctx.config.forwardTo),
      forwardTargets: ctx.config.forwardTargets.map((target) => redactUrl(target)!),
      routingRules: ctx.config.routingRules.map((rule) => ({
        pathPrefix: rule.pathPrefix,
        source: rule.source,
        targets: rule.targets.map((target) => redactUrl(target)!),
      })),
      captureUrl: `http://${ctx.config.host}:${ctx.config.port}/hook`,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
      lastCapturedAt: ctx.lastCapturedAt.value,
      readonly: ctx.config.readonly,
      retentionDays: ctx.config.retentionDays,
      maxDbSizeMb: ctx.config.maxDbSizeMb,
      dbSizeBytes: databaseSizeBytes(ctx.db),
      authEnabled: Boolean(ctx.config.authPassword),
      version: "0.1.0",
    };
  });
}
