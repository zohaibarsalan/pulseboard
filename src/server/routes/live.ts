import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import type { Webhook } from "../../db/schema.js";

export async function liveRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/live", (req, reply) => {
    // SSE handshake — we write directly to the raw socket to keep the stream open.
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

    const unsubscribe = ctx.bus.subscribe((webhook: Webhook) => {
      res.write(`data: ${JSON.stringify(webhook)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);
    heartbeat.unref?.();

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        res.end();
      } catch {
        // already closed
      }
    };

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
  });
}
