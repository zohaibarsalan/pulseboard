# Pulseboard — AI Context

This file orients AI assistants working on this codebase. **Keep it up to date as the code evolves.** If you change architecture, decisions, or conventions, update this file in the same commit.

The product specification is the source of truth for *what* Pulseboard is and *why*. This file describes *how* the code is organized right now.

- Product spec: [`docs/pulseboard-product-spec.md`](./docs/pulseboard-product-spec.md)

---

## One-line summary

Pulseboard is a local-first, self-hosted **BullMQ studio** distributed as an npm package and Docker image. It sits next to the user's Redis, indexes job metadata into embedded SQLite, and serves a polished dashboard for real-time monitoring, search, workflow graphs, and failure debugging. Positioning: *Drizzle Studio for BullMQ*.

---

## Build status

We are building **v0.1** per spec §19.

| Component | Status | Notes |
|---|---|---|
| Package scaffold (pnpm + TS + ESM) | done | Node ≥20 engines, ESM throughout |
| CLI entry (`pulseboard --redis <url>`) | done | commander; redacts password in startup log |
| Config loader (CLI + env) | done | zod-validated; CLI flags override env |
| Fastify server + `/api/health` | done | Returns `{status, redis, sqlite, instanceId, uptimeSeconds}` |
| Drizzle schema + WAL SQLite | done | All 5 tables; `instance_id` leading in every composite index; WAL/synchronous=NORMAL pragmas applied |
| BullMQ connection module | done | ioredis; ping helper for health checks |
| Queue registry + auto-discovery | done | `SCAN bull:*:meta`; refuses on Upstash/RedisCloud without `--force-discover` |
| `GET /api/instances/:instanceId/queues` | done | Returns counts (waiting/active/completed/failed/delayed/paused/waiting-children) + `isPaused` |
| `GET /api/instances` | done | Lists registered instances; v1 always just `default` |
| Build pipeline (`pnpm build`) | done | tsc + sql migrations copy step; produces runnable `dist/cli.js` |
| Smoke-tested end-to-end | done | tsx-dev and built binary both verified against local Redis + 3 seeded jobs |
| FTS5 virtual table for failure text | **deferred** | Drizzle has no FTS5 helper; needs hand-written SQL migration before search lands |
| Minimal QueueEvents indexer | not started | Next session — Step 5 in §25 |
| Vite + React + Coss UI scaffold | not started | Step after indexer |
| Docker image | not started | Step after UI |

The implementation order is fixed in spec §25.

### Verified working

```bash
pnpm install
pnpm db:generate              # generates SQL migration from schema
pnpm typecheck                # clean
pnpm tsx src/cli.ts --redis redis://localhost:6379 --port 4547 --auto-discover
# OR
pnpm build && node dist/cli.js --redis redis://localhost:6379 --auto-discover

curl http://127.0.0.1:4547/api/health
curl http://127.0.0.1:4547/api/instances/default/queues
```

### Seed script for local testing

`scripts/seed.ts` pushes a few jobs into a queue named `email`. Run with `pnpm tsx scripts/seed.ts`.

---

## Stack decisions (do not re-litigate)

These were debated and decided. If you're tempted to swap one, check the spec § cited:

| Decision | Choice | Reference |
|---|---|---|
| Runtime | Node ≥20, ESM | §17 |
| Language | TypeScript | implied by Drizzle's typed schemas; default for new Node tooling |
| Package manager | pnpm | single package now, monorepo-ready later |
| Server | Fastify | §17, §24 |
| Database | SQLite via better-sqlite3 + Drizzle ORM | §17, §24 |
| Queue lib | BullMQ + ioredis | §17 |
| UI framework | React + Vite | §17 |
| Component library | Coss UI (built on Base UI) | §17, §24 |
| Styling | Tailwind CSS | §17 |
| Workflow graphs | React Flow | §9.4 |
| Repo layout | Single package now; refactor to monorepo around v0.3 | §18 |

---

## Architecture (3-layer data model — §6)

```
Layer 1: Redis / BullMQ   ← source of truth for current queue state
Layer 2: In-memory cache  ← fast live UI state
Layer 3: Embedded SQLite  ← search, analytics, history, audit
```

If SQLite is deleted, Pulseboard still works — it loses historical analytics and search history until rebuilt from Redis.

**The browser never connects directly to Redis.** All Redis access is server-side.

---

## Directory layout (current — single package, spec §18)

```
src/
  cli.ts              ← CLI entry, parses args, boots server
  config/             ← config loading (CLI + env, validated)
  server/
    app.ts            ← Fastify app factory
    routes/           ← API route modules
  web/                ← React + Vite app (served as static + dev proxy)
  db/
    schema.ts         ← Drizzle schema (all tables include instance_id)
    client.ts         ← better-sqlite3 client, WAL mode mandatory
    migrations/       ← Drizzle-generated SQL migrations
  bullmq/
    connection.ts     ← ioredis connection
    queue-registry.ts ← named queue instances
    queue-service.ts  ← reads (counts, jobs)
    job-service.ts    ← single job read/merge live + indexed
    event-service.ts  ← QueueEvents subscriptions
    flow-service.ts   ← (later) flow graph reads
    action-service.ts ← retry, pause, resume, etc.
  indexer/
    bootstrap-indexer.ts ← startup backfill (paginated, streaming)
    event-indexer.ts     ← live QueueEvents → SQLite (bounded buffer)
    reconciliation.ts    ← periodic Redis state checks
  security/
    redaction.ts      ← redact secret-shaped keys from payloads
    auth.ts           ← password auth, localhost-trusted detection
docs/
  pulseboard-product-spec.md
```

Refactor to `apps/web` + `apps/server` + `packages/*` around v0.3 when packaging/build complexity demands it. Not before.

---

## Conventions

### Code

- **TypeScript strict mode.** No `any` without a comment explaining why.
- **ESM only** (`"type": "module"` in package.json). Use `.js` extensions in imports.
- **File naming**: kebab-case (`queue-registry.ts`), matches spec §18.
- **No barrel re-exports** unless they serve a real consumer. They hurt tree-shaking and obscure the dependency graph.
- **Comments**: only when WHY is non-obvious. Don't narrate what the code does.

### Schema and IDs

- Every indexed table has `instance_id TEXT NOT NULL DEFAULT 'default'` as the **first** column in composite indexes. v1 always writes `'default'`. See spec §13.
- SQLite is always opened with `journal_mode=WAL`. Non-negotiable.
- IDs are nanoid by default. BullMQ job IDs are strings and stored as-is.

### API

- All routes are scoped: `/api/instances/:instanceId/...`. v1 always uses `default`. See spec §21.
- Live updates use SSE, not WebSocket.

### Trust principle (spec §22 #8)

**Never lie about what we didn't see.** Pulseboard's history is incomplete by definition — Redis trims events and `removeOnComplete` deletes jobs. Gaps must be shown as gaps in the UI, not as zeros. Always display "Last indexed at" prominently. The user must always be able to answer *"did this job actually fail, or did Pulseboard just miss it?"*

---

## Running

```bash
pnpm install
pnpm dev          # starts server in watch mode
pnpm build        # builds for distribution
pnpm typecheck
```

The CLI entry will eventually be:

```bash
npx pulseboard --redis redis://localhost:6379
```

---

## Open questions / known gotchas

- **pnpm 10 build-script approval.** `better-sqlite3` (and `esbuild`, `msgpackr-extract`) need their install scripts to run. The approved list lives in `package.json` under `pnpm.onlyBuiltDependencies`. **`.npmrc` does NOT work for this in pnpm 10** — initially tried and silently failed. After editing `package.json`, you may need `pnpm install --force` or a manual `node-gyp rebuild` if the binding is missing (`node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build/Release/better_sqlite3.node`).
- **Node 24 + better-sqlite3 has no prebuilt binary.** `prebuild-install` will fail and fall through to `node-gyp rebuild --release`. The first install takes ~30s while it compiles. Make sure Xcode CLI tools are present.
- **Migrations are `.sql` files; tsc does not copy them to `dist/`.** The `build` script has a post-step that `cpSync`s `src/db/migrations/` to `dist/db/migrations/`. If you change the build pipeline, preserve this.
- **Drizzle has no FTS5 helper.** The FTS5 virtual table on `failed_reason`/`stacktrace_preview`/`job_name` must be added via a hand-written SQL migration before search lands. Not blocking until v0.3-era search work.
- **Coss UI** is new (©2026); used in production by Cal.com but limited ecosystem docs. If you hit a wall, fall back to Base UI primitives directly rather than swapping the whole library.
- BullMQ Cluster support is an explicit v1 non-goal (spec §5). Don't add it.
- Concrete retention numbers (spec §14) are starting points, not commitments — easy to tune.
- Operational guarantee thresholds (max Redis RPS, max DB growth/day) — measure once the indexer is running; don't try to predict now.
- **The dev Redis already has unrelated queues** (`clio-sync`, `clio-token-refresh`) from another project on this machine. Auto-discovery will surface them. Use `--queues email` to scope down during local testing.

---

## Update protocol

When you finish a meaningful unit of work:

1. Update the Build Status table above.
2. If you added/removed a directory or file convention, update Directory Layout and Conventions.
3. If you made or reversed a stack decision, update Stack Decisions.
4. If you discovered a gotcha future-you (or another AI) needs to know, add to Open Questions.

This file is the fastest way for an AI to get oriented. Keep it accurate.
