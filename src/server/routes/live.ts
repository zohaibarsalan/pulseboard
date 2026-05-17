import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import type { BullEvent } from "../../bullmq/event-service.js";

type Params = { instanceId: string; queueName: string };

export async function liveRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: Params }>(
    "/api/instances/:instanceId/queues/:queueName/live",
    (req, reply) => {
      if (req.params.instanceId !== ctx.instanceId) {
        reply.code(404).send({ error: "instance_not_found" });
        return;
      }

      // SSE handshake — we write directly to the raw socket to keep the stream open.
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ queueName: req.params.queueName, ts: Date.now() })}\n\n`);

      const targetQueue = req.params.queueName;
      const unsubscribe = ctx.bus.subscribe((event: BullEvent) => {
        if (event.queueName !== targetQueue) return;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
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
    },
  );
}
