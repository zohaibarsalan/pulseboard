import type { FastifyInstance, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import type { AppContext } from "../context.js";
import { webhooks, webhookSecrets, type NewWebhook } from "../../db/schema.js";
import { detectSource } from "../../capture/detector.js";
import { forwardWebhook } from "../../capture/forwarder.js";
import { verifySignature } from "../../capture/signature.js";
import { rowToWebhook } from "../serialize.js";
import { deliveryFields, targetsForWebhook } from "../../capture/routing.js";

// Webhooks are captured under /hook/*. Everything after /hook is treated as the
// "real" path: it's recorded and replayed onto the forward target. This keeps
// webhook ingress cleanly separated from the UI (served at /) and API (/api/*).
const HOOK_PREFIX = "/hook";

function normalizeHeaders(raw: FastifyRequest["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

export async function captureRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.all(`${HOOK_PREFIX}/*`, async (req, reply) => {
    const headers = normalizeHeaders(req.headers);
    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    const bodyPreview = rawBody ? rawBody.toString("utf8") : null;

    // Strip the /hook prefix so the recorded path matches what the user's app expects.
    const fullPath = req.url.split("?")[0] ?? req.url;
    const path = fullPath.slice(HOOK_PREFIX.length) || "/";
    const queryIndex = req.url.indexOf("?");
    const queryParams = queryIndex >= 0 ? req.url.slice(queryIndex + 1) : null;

    const detected = detectSource(headers, bodyPreview);

    // Look up the signing secret (if any) for this source and verify.
    const secretRow = ctx.db.$client
      .prepare("SELECT secret FROM webhook_secrets WHERE source = ?")
      .get(detected.source) as { secret: string } | undefined;
    const signature = verifySignature({
      source: detected.source,
      headers,
      body: rawBody,
      secret: secretRow?.secret ?? null,
    });

    const now = Date.now();

    const record: NewWebhook = {
      id: nanoid(),
      method: req.method,
      path,
      headersJson: JSON.stringify(headers),
      body: bodyPreview,
      bodyBase64: rawBody?.toString("base64") ?? null,
      queryParams,
      contentType: headers["content-type"] ?? null,
      contentLength: rawBody?.byteLength ?? 0,
      sourceIp: req.ip,
      receivedAt: now,
      source: detected.source,
      eventType: detected.eventType ?? null,
      forwardedTo: null,
      forwardStatus: null,
      forwardDurationMs: null,
      forwardError: null,
      responseHeadersJson: null,
      responseBody: null,
      responseContentType: null,
      responseBodyTruncated: false,
      deliveriesJson: null,
      replayCount: 0,
      lastReplayedAt: null,
      replayOf: null,
      signatureStatus: signature.status,
      signatureNotes: signature.notes ?? null,
    };

    // Forward first (if configured) so we can record the result in one insert.
    const targets = targetsForWebhook(ctx.config, { path, source: detected.source });
    if (targets.length > 0) {
      const results = await Promise.all(targets.map((forwardTo) => forwardWebhook({
        forwardTo,
        method: req.method,
        path,
        queryParams,
        headers,
        body: rawBody,
        timeoutMs: ctx.config.forwardTimeoutMs,
      })));
      Object.assign(record, deliveryFields(results));
    }

    ctx.db.insert(webhooks).values(record).run();
    ctx.lastCapturedAt.value = now;

    const stored = ctx.db.$client
      .prepare("SELECT * FROM webhooks WHERE id = ?")
      .get(record.id) as Record<string, unknown>;
    ctx.bus.publish(rowToWebhook(stored));

    // Respond to the provider. If forwarding succeeded, mirror that status so the
    // provider sees the user app's real response. Otherwise acknowledge with 200.
    if (record.forwardStatus != null) {
      return reply.code(record.forwardStatus).send({ ok: true, captured: record.id });
    }
    return reply.code(200).send({ ok: true, captured: record.id });
  });
}
