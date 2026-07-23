import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { AppContext } from "../context.js";
import { webhooks, type NewWebhook } from "../../db/schema.js";
import { forwardWebhook } from "../../capture/forwarder.js";
import { signFor } from "../../capture/signer.js";
import { verifySignature } from "../../capture/signature.js";
import { rowToWebhook } from "../serialize.js";

type SendBody = {
  method?: string;
  path?: string;
  /** Override the configured forward target for this one send. */
  target?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Provider source for badging + auto-sign. */
  source?: string;
  /** When true, attach the provider's signature header using the stored secret. */
  autoSign?: boolean;
};

export async function senderRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.post("/api/sender/send", async (req, reply) => {
    if (ctx.config.readonly) return reply.code(403).send({ error: "readonly" });

    // Body comes in as a Buffer (global content-type parser).
    let input: SendBody = {};
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      try {
        input = JSON.parse(req.body.toString("utf8")) as SendBody;
      } catch {
        return reply.code(400).send({ error: "invalid_json_body" });
      }
    }

    const method = (input.method ?? "POST").toUpperCase();
    const path = input.path ?? "/";
    const target = input.target ?? ctx.config.forwardTo;
    if (!target) {
      return reply.code(400).send({ error: "no_forward_target" });
    }

    const body = input.body ?? "";
    const source = input.source && input.source.length > 0 ? input.source : "unknown";
    const baseHeaders = input.headers ?? {};

    // Auto-sign: pull the stored secret for this source, generate the right
    // provider headers, layer on top of whatever the user typed.
    let signedHeaders: Record<string, string> = {};
    let signedWith: string | null = null;
    if (input.autoSign) {
      const secretRow = ctx.db.$client
        .prepare("SELECT secret FROM webhook_secrets WHERE source = ?")
        .get(source) as { secret: string } | undefined;
      if (secretRow) {
        signedHeaders = signFor(source, body, secretRow.secret);
        if (Object.keys(signedHeaders).length > 0) signedWith = source;
      }
    }

    const headers: Record<string, string> = {
      // Sensible defaults the user can override.
      "content-type": "application/json",
      "user-agent": "pulseboard-sender",
      ...baseHeaders,
      ...signedHeaders,
    };

    const result = await forwardWebhook({
      forwardTo: target,
      method,
      path,
      queryParams: null,
      headers,
      body,
      timeoutMs: ctx.config.forwardTimeoutMs,
    });

    // Verify the signature we just attached so the row's badge matches reality.
    const signature = verifySignature({
      source,
      headers,
      body,
      secret: signedWith
        ? ((ctx.db.$client
            .prepare("SELECT secret FROM webhook_secrets WHERE source = ?")
            .get(source) as { secret: string } | undefined)?.secret ?? null)
        : null,
    });

    const now = Date.now();
    const record: NewWebhook = {
      id: nanoid(),
      method,
      path,
      headersJson: JSON.stringify(headers),
      body,
      bodyBase64: Buffer.from(body).toString("base64"),
      queryParams: null,
      contentType: headers["content-type"] ?? null,
      contentLength: Buffer.byteLength(body),
      sourceIp: "studio-sender",
      receivedAt: now,
      source,
      eventType: null,
      forwardedTo: target,
      forwardStatus: result.status,
      forwardDurationMs: result.durationMs,
      forwardError: result.error,
      replayCount: 0,
      lastReplayedAt: null,
      replayOf: null,
      signatureStatus: signature.status,
      signatureNotes: signature.notes ?? null,
    };
    ctx.db.insert(webhooks).values(record).run();
    ctx.lastCapturedAt.value = now;

    const stored = ctx.db.$client
      .prepare("SELECT * FROM webhooks WHERE id = ?")
      .get(record.id) as Record<string, unknown>;
    ctx.bus.publish(rowToWebhook(stored));

    return { ok: true, id: record.id, result, signedWith };
  });
}
