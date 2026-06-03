import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { webhookSecrets } from "../../db/schema.js";
import { SUPPORTED_SOURCES } from "../../capture/signature.js";

// Mask the secret for display — show only the last 4 chars. The full secret is
// never returned via the API (it's a local-file secret but no need to render it).
function mask(secret: string): string {
  if (secret.length <= 4) return "•".repeat(secret.length);
  return `${"•".repeat(Math.min(12, secret.length - 4))}${secret.slice(-4)}`;
}

export async function secretsRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // List every supported source, with whether a secret is configured + a masked
  // preview if so. UI uses this to render the secrets manager.
  app.get("/api/secrets", async () => {
    const rows = ctx.db.$client
      .prepare("SELECT source, secret, updated_at FROM webhook_secrets")
      .all() as { source: string; secret: string; updated_at: number }[];

    const byKey = new Map(rows.map((r) => [r.source, r] as const));

    const items = SUPPORTED_SOURCES.map((source) => {
      const row = byKey.get(source);
      return {
        source,
        configured: !!row,
        masked: row ? mask(row.secret) : null,
        updatedAt: row?.updated_at ?? null,
      };
    });

    return { secrets: items };
  });

  // Upsert a secret for a source. Body is the raw secret string (parsed manually
  // because the global content-type parser delivers raw strings).
  app.post<{ Params: { source: string } }>(
    "/api/secrets/:source",
    async (req, reply) => {
      if (ctx.config.readonly) return reply.code(403).send({ error: "readonly" });
      if (!SUPPORTED_SOURCES.includes(req.params.source)) {
        return reply.code(400).send({ error: "unsupported_source" });
      }

      let secret: string | undefined;
      if (typeof req.body === "string" && req.body.length > 0) {
        try {
          secret = (JSON.parse(req.body) as { secret?: string }).secret;
        } catch {
          // ignore — secret stays undefined
        }
      }
      if (!secret || typeof secret !== "string") {
        return reply.code(400).send({ error: "missing_secret" });
      }

      const now = Date.now();
      ctx.db
        .insert(webhookSecrets)
        .values({ source: req.params.source, secret, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: webhookSecrets.source,
          set: { secret, updatedAt: now },
        })
        .run();

      return { ok: true, source: req.params.source };
    },
  );

  app.delete<{ Params: { source: string } }>(
    "/api/secrets/:source",
    async (req, reply) => {
      if (ctx.config.readonly) return reply.code(403).send({ error: "readonly" });
      ctx.db.$client.prepare("DELETE FROM webhook_secrets WHERE source = ?").run(req.params.source);
      return { ok: true };
    },
  );
}
