# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# build deps for better-sqlite3 native binding
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json tsconfig.web.json ./
COPY vite.config.ts tailwind.config.ts postcss.config.js drizzle.config.ts ./
COPY src ./src

RUN pnpm build

# Strip dev deps for a smaller runtime install
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
    && pnpm rebuild better-sqlite3

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PULSEBOARD_DB_PATH=/data/pulseboard.db
ENV PULSEBOARD_HOST=0.0.0.0
ENV PULSEBOARD_PORT=4545

WORKDIR /app

# Just runtime libs for the prebuilt better-sqlite3 binding — no build toolchain in the final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 4545
VOLUME ["/data"]

ENTRYPOINT ["node", "dist/cli.js"]
CMD []
