import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { AppContext } from "./context.js";
import { healthRoute } from "./routes/health.js";
import { queuesRoute } from "./routes/queues.js";

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
          : undefined,
    },
    disableRequestLogging: false,
  });

  await app.register(cors, {
    origin: process.env.NODE_ENV !== "production" ? true : false,
    credentials: true,
  });

  await healthRoute(app, ctx);
  await queuesRoute(app, ctx);

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: "not_found", path: req.url });
  });

  return app;
}
