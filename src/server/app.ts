import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import proxy from "@fastify/http-proxy";
import staticPlugin from "@fastify/static";
import { timingSafeEqual } from "node:crypto";
import type { AppContext } from "./context.js";
import { maintainDatabase } from "../db/maintenance.js";
import { healthRoute } from "./routes/health.js";
import { webhooksRoutes } from "./routes/webhooks.js";
import { liveRoute } from "./routes/live.js";
import { captureRoute } from "./routes/capture.js";
import { secretsRoutes } from "./routes/secrets.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { senderRoutes } from "./routes/sender.js";

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

  // Capture the raw body for EVERY content type as an unparsed Buffer. This is
  // essential: webhook signatures are HMACs of the exact raw bytes, so we must
  // never re-serialize. Remove Fastify's built-in JSON/text parsers first so the
  // wildcard parser claims every content type. JSON API routes parse their
  // Buffer bodies explicitly.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.addHook("onRequest", async (req, reply) => {
    if (!ctx.config.authPassword || req.url.startsWith("/hook/")) return;
    const raw = req.headers.authorization;
    const expected = `pulseboard:${ctx.config.authPassword}`;
    let supplied = "";
    if (raw?.startsWith("Basic ")) {
      try {
        supplied = Buffer.from(raw.slice(6), "base64").toString("utf8");
      } catch {
        supplied = "";
      }
    }
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    const valid =
      suppliedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(suppliedBuffer, expectedBuffer);
    if (!valid) {
      return reply
        .header("WWW-Authenticate", 'Basic realm="Pulseboard", charset="UTF-8"')
        .code(401)
        .send({ error: "authentication_required" });
    }
  });

  maintainDatabase(ctx.db, ctx.config);
  const maintenanceTimer = setInterval(() => {
    maintainDatabase(ctx.db, ctx.config);
  }, 60 * 60 * 1000);
  maintenanceTimer.unref();
  app.addHook("onClose", async () => clearInterval(maintenanceTimer));

  const devProxyTarget = process.env.PULSEBOARD_DEV_PROXY ?? process.env.WEBHOOK_STUDIO_DEV_PROXY;

  if (!devProxyTarget && process.env.NODE_ENV !== "production") {
    await app.register(cors, { origin: true, credentials: true });
  }

  await healthRoute(app, ctx);
  await webhooksRoutes(app, ctx);
  await secretsRoutes(app, ctx);
  await analyticsRoutes(app, ctx);
  await senderRoutes(app, ctx);
  await liveRoute(app, ctx);
  await captureRoute(app, ctx);

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
        if (req.url.startsWith("/api/") || req.url.startsWith("/hook/")) {
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
    if (existsSync(resolve(candidate, "index.html")) && existsSync(resolve(candidate, "assets"))) {
      return candidate;
    }
  }
  return null;
}
