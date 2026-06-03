import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { AppContext } from "../context.js";
import { webhooks, type NewWebhook, type Webhook } from "../../db/schema.js";
import { forwardWebhook } from "../../capture/forwarder.js";
import { rowToWebhook } from "../serialize.js";

type ListQuery = {
  source?: string;
  status?: "success" | "failed" | "pending";
  q?: string;
  before?: string;
  limit?: string;
};

export async function webhooksRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // List webhooks, newest first, with optional filters + cursor pagination.
  app.get<{ Querystring: ListQuery }>("/api/webhooks", async (req) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const before = req.query.before ? Number(req.query.before) : null;

    const clauses: string[] = [];
    const params: (string | number)[] = [];

    if (before) {
      clauses.push("received_at < ?");
      params.push(before);
    }
    if (req.query.source) {
      clauses.push("source = ?");
      params.push(req.query.source);
    }
    if (req.query.status === "success") {
      clauses.push("forward_status >= 200 AND forward_status < 300");
    } else if (req.query.status === "failed") {
      clauses.push("(forward_error IS NOT NULL OR forward_status >= 400)");
    } else if (req.query.status === "pending") {
      clauses.push("forwarded_to IS NULL");
    }
    if (req.query.q) {
      clauses.push("(body LIKE ? OR path LIKE ? OR event_type LIKE ?)");
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = ctx.db.$client
      .prepare(`SELECT * FROM webhooks ${where} ORDER BY received_at DESC LIMIT ?`)
      .all(...params, limit) as Record<string, unknown>[];

    const mapped = rows.map(rowToWebhook);
    const nextBefore = mapped.length === limit ? mapped[mapped.length - 1]?.receivedAt ?? null : null;

    return { webhooks: mapped, nextBefore };
  });

  // Distinct sources with counts, for the filter sidebar.
  app.get("/api/webhooks/sources", async () => {
    const rows = ctx.db.$client
      .prepare("SELECT source, COUNT(*) as count FROM webhooks GROUP BY source ORDER BY count DESC")
      .all() as { source: string; count: number }[];
    return { sources: rows };
  });

  // Aggregate stats for the header bar.
  app.get("/api/webhooks/stats", async () => {
    const row = ctx.db.$client
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN forward_status >= 200 AND forward_status < 300 THEN 1 ELSE 0 END) as succeeded,
          SUM(CASE WHEN forward_error IS NOT NULL OR forward_status >= 400 THEN 1 ELSE 0 END) as failed,
          MAX(received_at) as last_received
        FROM webhooks`,
      )
      .get() as { total: number; succeeded: number; failed: number; last_received: number | null };
    return {
      total: row.total,
      succeeded: row.succeeded ?? 0,
      failed: row.failed ?? 0,
      lastReceived: row.last_received,
    };
  });

  app.get<{ Params: { id: string } }>("/api/webhooks/:id", async (req, reply) => {
    const row = ctx.db.$client
      .prepare("SELECT * FROM webhooks WHERE id = ?")
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: "not_found" });
    return rowToWebhook(row);
  });

  // Replay: re-forward a stored webhook to the configured target (or an override).
  // Body is delivered as a raw string (global raw-body parser), so parse it here.
  app.post<{ Params: { id: string } }>(
    "/api/webhooks/:id/replay",
    async (req, reply) => {
      if (ctx.config.readonly) {
        return reply.code(403).send({ error: "readonly" });
      }

      const originalRow = ctx.db.$client
        .prepare("SELECT * FROM webhooks WHERE id = ?")
        .get(req.params.id) as Record<string, unknown> | undefined;
      if (!originalRow) return reply.code(404).send({ error: "not_found" });
      const original = rowToWebhook(originalRow);

      // Replay accepts three optional overrides: forwardTo, body, and headers.
      // headers is merged into the original (override matching keys, keep others)
      // so callers can tweak one header without resending all of them.
      let overrideTarget: string | undefined;
      let overrideBody: string | undefined;
      let overrideHeaders: Record<string, string> | undefined;
      if (typeof req.body === "string" && req.body.length > 0) {
        try {
          const parsed = JSON.parse(req.body) as {
            forwardTo?: string;
            body?: string;
            headers?: Record<string, string>;
          };
          overrideTarget = parsed.forwardTo;
          overrideBody = parsed.body;
          overrideHeaders = parsed.headers;
        } catch {
          // ignore malformed override
        }
      }
      const target = overrideTarget ?? ctx.config.forwardTo;
      if (!target) {
        return reply.code(400).send({ error: "no_forward_target" });
      }

      const originalHeaders = JSON.parse(original.headersJson) as Record<string, string>;
      const headers = overrideHeaders
        ? { ...originalHeaders, ...overrideHeaders }
        : originalHeaders;
      const body = overrideBody !== undefined ? overrideBody : original.body;
      const wasEdited = overrideBody !== undefined || overrideHeaders !== undefined;

      const result = await forwardWebhook({
        forwardTo: target,
        method: original.method,
        path: original.path,
        queryParams: original.queryParams,
        headers,
        body,
        timeoutMs: ctx.config.forwardTimeoutMs,
      });

      const now = Date.now();

      // Record what was actually sent — not the original payload — so the
      // replay row reflects reality (you can inspect the edited body later).
      const replayRecord: NewWebhook = {
        id: nanoid(),
        method: original.method,
        path: original.path,
        headersJson: JSON.stringify(headers),
        body,
        queryParams: original.queryParams,
        contentType: headers["content-type"] ?? original.contentType,
        contentLength: body ? Buffer.byteLength(body) : 0,
        sourceIp: wasEdited ? "replay-edited" : "replay",
        receivedAt: now,
        source: original.source,
        eventType: original.eventType,
        forwardedTo: target,
        forwardStatus: result.status,
        forwardDurationMs: result.durationMs,
        forwardError: result.error,
        replayCount: 0,
        lastReplayedAt: null,
        replayOf: original.id,
        // Edited payloads break HMACs by definition — never carry over a "valid"
        // status from the original onto an edited replay, that would be a lie.
        signatureStatus: wasEdited ? "not_applicable" : original.signatureStatus,
        signatureNotes: wasEdited ? "Edited replay — original signature no longer applies" : original.signatureNotes,
      };
      ctx.db.insert(webhooks).values(replayRecord).run();

      // Bump the original's replay counter.
      ctx.db.$client
        .prepare("UPDATE webhooks SET replay_count = replay_count + 1, last_replayed_at = ? WHERE id = ?")
        .run(now, original.id);

      const stored = ctx.db.$client
        .prepare("SELECT * FROM webhooks WHERE id = ?")
        .get(replayRecord.id) as Record<string, unknown>;
      ctx.bus.publish(rowToWebhook(stored));

      return { ok: true, result, replayId: replayRecord.id };
    },
  );

  // Clear all captured webhooks.
  app.post("/api/webhooks/clear", async (_req, reply) => {
    if (ctx.config.readonly) {
      return reply.code(403).send({ error: "readonly" });
    }
    ctx.db.$client.prepare("DELETE FROM webhooks").run();
    return reply.send({ ok: true });
  });
}
