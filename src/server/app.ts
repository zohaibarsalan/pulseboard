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
import { activityRoute } from "./routes/activity.js";
import { jobRoute } from "./routes/jobs.js";
import { errorGroupsRoute } from "./routes/error-groups.js";
import { liveRoute } from "./routes/live.js";
import { actionsRoute } from "./routes/actions.js";
import { debugContextRoute } from "./routes/debug-context.js";
import { searchRoute } from "./routes/search.js";
import { analyticsRoutes } from "./routes/analytics.js";

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

  // CORS is only needed when the UI and API live on different origins.
  // In dev (Vite proxied through Fastify) and prod (static served by Fastify) they're
  // same-origin, so we only enable CORS when there's no dev proxy AND we're not
  // in production — i.e., when a developer is hitting the API from elsewhere.
  // Registering it globally also collides with @fastify/http-proxy's OPTIONS handler.
  if (!process.env.PULSEBOARD_DEV_PROXY && process.env.NODE_ENV !== "production") {
    await app.register(cors, { origin: true, credentials: true });
  }

  await healthRoute(app, ctx);
  await queuesRoute(app, ctx);
  await eventsRoute(app, ctx);
  await activityRoute(app, ctx);
  await jobRoute(app, ctx);
  await errorGroupsRoute(app, ctx);
  await liveRoute(app, ctx);
  await actionsRoute(app, ctx);
  await debugContextRoute(app, ctx);
  await searchRoute(app, ctx);
  await analyticsRoutes(app, ctx);

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
  // Only accept *built* web output — a directory containing both index.html
  // and an `assets/` subdirectory (Vite's convention). This excludes
  // `src/web/`, which contains the TS source and would cause the server
  // to hand the browser raw `.tsx` files with octet-stream MIME.
  const candidates = [
    resolve(__dirname, "../web"),       // running from dist/server → dist/web
    resolve(__dirname, "../../dist/web"), // running from src/server (tsx) → ./dist/web
    resolve(process.cwd(), "dist/web"),
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "index.html")) && existsSync(resolve(candidate, "assets"))) {
      return candidate;
    }
  }
  return null;
}
