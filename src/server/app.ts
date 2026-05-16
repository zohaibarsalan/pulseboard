import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import proxy from "@fastify/http-proxy";
import staticPlugin from "@fastify/static";
import type { AppContext } from "./context.js";
import { healthRoute } from "./routes/health.js";
import { queuesRoute } from "./routes/queues.js";
import { eventsRoute } from "./routes/events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  await eventsRoute(app, ctx);

  const devProxyTarget = process.env.PULSEBOARD_DEV_PROXY;
  if (devProxyTarget) {
    await app.register(proxy, {
      upstream: devProxyTarget,
      prefix: "/",
      rewritePrefix: "/",
      websocket: true,
    });
  } else {
    const webRoot = resolveWebRoot();
    if (webRoot) {
      const indexHtml = readFileSync(resolve(webRoot, "index.html"), "utf8");
      await app.register(staticPlugin, {
        root: webRoot,
        prefix: "/",
        wildcard: false,
        index: false,
      });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith("/api/")) {
          return reply.code(404).send({ error: "not_found", path: req.url });
        }
        return reply.type("text/html").send(indexHtml);
      });
    } else {
      app.log.warn("no built web bundle found; UI will not be served");
      app.setNotFoundHandler((req, reply) => {
        reply.code(404).send({ error: "not_found", path: req.url });
      });
    }
  }

  return app;
}

function resolveWebRoot(): string | null {
  const candidates = [
    resolve(__dirname, "../web"),
    resolve(__dirname, "../../dist/web"),
    resolve(process.cwd(), "dist/web"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
