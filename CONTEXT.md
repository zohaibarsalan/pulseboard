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
| Minimal QueueEvents indexer | done | `src/indexer/event-indexer.ts` — bounded buffer (10k), 250ms flush, drop-with-warning, batched upserts to `jobs` + `job_events` |
| `GET /api/instances/:instanceId/queues/:queueName/events` | done | Paginated newest-first via `?before` cursor; default limit 100, max 500 |
| `lastIndexedAt` in `/api/health` | done | Powers the "Last indexed at" topbar indicator (trust principle) |
| Vite + React + Tailwind scaffold | done | Tailwind 3 with custom Vercel/Linear tokens; class-based dark mode; Geist Variable + Geist Mono Variable via `@fontsource-variable` |
| App shell (sidebar + topbar) | done | 240px sidebar (Queues, Failed Jobs, Flows, Analytics, Settings); topbar with connection badge + last-indexed indicator + theme toggle |
| Queues page | done | Live queue list with status pills (active/waiting/delayed/failed/completed); 3s auto-refresh via TanStack Query |
| Placeholder pages | done | Failed Jobs / Flows / Analytics / Settings / queue detail all stubbed with "coming soon" |
| Fastify serves UI | done | `@fastify/static` for assets; SPA fallback via setNotFoundHandler reading index.html into memory at boot; `@fastify/http-proxy` to Vite in dev when `PULSEBOARD_DEV_PROXY` env is set |
| End-to-end smoke test | done | Built binary serves UI + API + indexer; verified with worker processing 2 successes + 1 failure |
| FTS5 virtual table for failure text | **deferred** | Drizzle has no FTS5 helper; needs hand-written SQL migration before search lands |
| `/api/health` exposes redacted redis URL | done | Powers the sidebar Redis indicator so users know what's being monitored |
| `/api/instances/:id/activity?days=N` | done | Daily-bucket counts of completed/failed from `job_events` — powers KPIs and the activity bar chart |
| `/api/instances/:id/queues/:name/jobs/:jobId` | done | Merges live Redis state with indexed history + timeline; reports `removedFromRedis` when only the indexed row remains |
| `/api/instances/:id/error-groups` + `:hash/jobs` | done | Failure clustering by normalized `errorHash` |
| Error hash normalizer | done | `src/indexer/error-hash.ts` — strips paths/line numbers/UUIDs/hex IDs/timestamps/pnpm noise; hashes top 5 stack frames |
| KPI card component | done | Tiny uppercase label, big tabular number, sub-text, mini sparkline, trend arrow + percent |
| Activity bar chart | done | Pure SVG, no chart lib; daily buckets, hover tooltip, totals legend |
| Sidebar redesign (Redis indicator + tighter density) | done | Wide labeled sidebar kept; Redis URL + connection dot pinned bottom; theme toggle moved out of topbar |
| QueueDetail page with job table + drawer | done | Per-queue activity chart, events table, click row → JobDrawer with metadata grid + Payload/Output/Error/Timeline tabs |
| Failed Jobs page (error grouping) | done | Lists `error_groups` rows with count + first/last seen |
| Dockerfile (multi-stage, Node 20 bookworm-slim) | done | Image: 613MB; pinned `pnpm@10.14.0` via `packageManager`; native better-sqlite3 build at install time; runtime stage strips dev deps |
| Docker compose example | done | `docker/docker-compose.example.yml` — Pulseboard + Redis + named volume |
| LiveEventBus (in-memory pub/sub) | done | `src/indexer/event-bus.ts` — single source for SSE clients; indexer publishes before buffering |
| `GET /api/instances/:id/queues/:name/live` (SSE) | done | Per-client EventSource. Hello on connect, 15s heartbeat, auto-cleanup on close. |
| Action endpoints (retry/remove/pause/resume) | done | `src/server/routes/actions.ts`. Writes `audit_logs` with actor/actor_source/client_ip/user_agent. Returns 403 in readonly mode. |
| `useLiveEvents` hook | done | EventSource consumer with 400ms debounced invalidation of `events` + `queues` + `activity` queries. Drops polling intervals when status==="live". |
| Pause/Resume button in QueueDetail topbar | done | Toggles based on `queue.isPaused`; uses react-query mutations |
| Retry + Remove buttons in JobDrawer | done | Retry: single click. Remove: `window.confirm()` gate. Both invalidate caches on success. |
| Live badge in QueueDetail | done | Pulsing green dot when connected, warning dot when reconnecting |

The implementation order is fixed in spec §25.

### Verified working

```bash
# one-time setup
pnpm install
pnpm db:generate              # generates SQL migration from schema
pnpm typecheck                # checks server + web (two tsconfigs)

# production-mode run (UI + API in one process)
pnpm build                    # builds web bundle + server bundle, copies migrations
node dist/cli.js --redis redis://localhost:6379 --auto-discover
# Then open http://127.0.0.1:4545

# dev mode with HMR (two terminals)
pnpm dev                      # Fastify, proxies non-/api to Vite
pnpm dev:web                  # Vite on :5173
# Open http://127.0.0.1:4545 — the proxy hides Vite from the user

# manual smoke
curl http://127.0.0.1:4545/api/health
curl http://127.0.0.1:4545/api/instances/default/queues
curl "http://127.0.0.1:4545/api/instances/default/queues/email/events?limit=20"
```

### Seed and worker scripts for local testing

- `scripts/seed.ts` — pushes a handful of jobs into queue `email`.
- `scripts/worker.ts` — processes the `email` queue; intentionally fails `send-receipt` jobs.

Run with `pnpm tsx scripts/seed.ts` and `pnpm tsx scripts/worker.ts`.

### Full demo workload (recommended for exploring features)

`scripts/demo/index.ts` runs a long-running producer + workers across 5 realistic queues (`email`, `imports`, `invoices`, `webhooks`, `ai-pipeline`) with varied job names, weighted random scheduling, retry policies, delayed jobs, and a tuned mix of distinct failure messages so error grouping has something to cluster.

It uses an **isolated dev Redis on port 6390** (separate from the user's existing local Redis on 6379) defined in `docker/docker-compose.dev.yml`.

Three commands, three terminals:

```bash
pnpm demo:up           # start the isolated Redis container (port 6390)
pnpm demo:traffic      # long-running producer + workers (Ctrl+C to stop)
pnpm demo:pulseboard   # Pulseboard pointed at the dev Redis (port 4547)
# Open http://127.0.0.1:4547

pnpm demo:down         # tear down the Redis container + volume
```

Tunables:

- `DEMO_INTERVAL=500 pnpm demo:traffic` — more aggressive job rate
- `DEMO_CONCURRENCY=10 pnpm demo:traffic` — wider workers

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
  cli.ts                  ← CLI entry, parses args, boots server (commander)
  config/index.ts         ← zod-validated config (CLI + env)
  server/
    app.ts                ← Fastify app factory; serves static UI or proxies to Vite
    context.ts            ← AppContext (db, redis, registry, indexer)
    routes/
      health.ts           ← GET /api/health
      queues.ts           ← GET /api/instances, GET /api/instances/:id/queues
      events.ts           ← GET /api/instances/:id/queues/:name/events
  web/                    ← React + Vite app, served by Fastify
    index.html            ← shell with <div id="root"> + script tag
    main.tsx              ← React mount + theme bootstrap + React Query
    App.tsx               ← wouter routes
    styles.css            ← Tailwind + CSS variables (light/dark tokens)
    components/
      Sidebar.tsx
      Topbar.tsx          ← connection badge, last-indexed indicator, theme toggle
      StatusPill.tsx      ← compact pill with dot + label + count
    pages/
      Queues.tsx          ← live queue list w/ TanStack Query
      Placeholder.tsx     ← shared "coming soon" page
    lib/
      api.ts              ← typed fetch helpers
      cn.ts               ← class composition
      format.ts           ← number + relative-time formatting
  db/
    schema.ts             ← Drizzle schema (all tables include instance_id)
    client.ts             ← better-sqlite3, WAL mode + 5s busy timeout
    migrate.ts            ← Drizzle migration runner
    migrations/           ← drizzle-kit generated SQL
  bullmq/
    connection.ts         ← ioredis with maxRetriesPerRequest: null
    queue-registry.ts     ← named queue instances + SCAN-based auto-discovery
    queue-service.ts      ← reads (getJobCounts + isPaused)
    event-service.ts      ← QueueEvents subscriptions (active/completed/failed/stalled)
    job-service.ts        ← (not started) single job read/merge live + indexed
    flow-service.ts       ← (not started) flow graph reads
    action-service.ts     ← (not started) retry, pause, resume, etc.
  indexer/
    event-indexer.ts      ← live QueueEvents → SQLite (bounded buffer, drop-with-warning)
    bootstrap-indexer.ts  ← (not started) startup backfill (paginated, streaming)
    reconciliation.ts     ← (not started) periodic Redis state checks
  security/
    redaction.ts          ← (not started) redact secret-shaped keys from payloads
    auth.ts               ← (not started) password auth, localhost-trusted detection
scripts/
  seed.ts                 ← local-dev: push test jobs into a queue
  worker.ts               ← local-dev: process the email queue (intentional failures)
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
- **Coss UI not used yet.** Despite the spec listing Coss UI, the v0.1 UI is pure Tailwind + lucide icons — the queue list and shell don't need component-library primitives. Add Coss UI (or Base UI primitives) when we hit a screen that needs dialogs, popovers, command menu, etc. — likely the job detail drawer.
- **The `geist` npm package is Next.js-only** (it exports font helpers, not CSS). For non-Next projects use `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` — the CSS-family variants. Initially tried `geist` and it broke the Vite build.
- **Tailwind 3, not Tailwind 4.** Tailwind 4 changed the config story significantly (CSS-first, no `tailwind.config.ts`). Sticking with v3 for stability; revisit when the v4 ecosystem stabilizes.
- **`@fastify/static` does not auto-serve `index.html` for `/` with `wildcard: false`.** Fixed by reading `index.html` into memory once at boot and serving it from the not-found handler for non-`/api/` paths. This also gives us SPA client-route fallback for free.
- **better-sqlite3 binds JS numbers as REAL via `?` placeholders.** This silently broke the activity bucket query: `(created_at / ?) * ?` became float math, so each row got a unique fractional bucket instead of a clean day boundary. Fix: inline integer constants as SQL literals (or `CAST(? AS INTEGER)`) when you need integer arithmetic. See `src/server/routes/activity.ts`.
- **pnpm 10 needs `packageManager: "pnpm@10.14.0"` in `package.json`** for Corepack inside Docker. Without it, corepack downloaded pnpm 11.1.2 which is incompatible with Node 20 (uses Node 22 builtins).
- **Don't blindly copy reference dashboards.** User feedback: the wide labeled sidebar + solid borders should stay; *only* the KPI-card patterns, tinted status pills, and dense table styles should be lifted from references like the Midday/Cal dashboards.
- BullMQ Cluster support is an explicit v1 non-goal (spec §5). Don't add it.
- Concrete retention numbers (spec §14) are starting points, not commitments — easy to tune.
- Operational guarantee thresholds (max Redis RPS, max DB growth/day) — measure once the indexer is running; don't try to predict now.
- **The user's default Redis (localhost:6379) hosts unrelated queues** (`clio-sync`, `clio-token-refresh`) from another project. Auto-discovery against it will surface them. **For exercising Pulseboard, use `pnpm demo:up` to bring up an isolated Redis on port 6390 instead** — the demo workload populates 5 realistic queues with mixed success/failure so all the UI surfaces have something to show.
- **`resolveWebRoot()` requires BOTH `index.html` AND an `assets/` subdirectory.** Earlier it just checked for the folder, which made it pick up `src/web/` (the source) when running via `tsx src/cli.ts`. The browser then got raw `.tsx` files served as `application/octet-stream` and refused to execute them. Now the resolver only accepts directories that look like Vite's built output. `pnpm demo:pulseboard` therefore runs `pnpm build:web` first.
- **Error hash v1 uses `normalized(reason) + first user-code frame` only.** An earlier version hashed top-5 frames from `stacktrace.join("\n")`, which was unstable across retries (BullMQ appends each attempt's stack to the array, so top-N frames shifted). Result was over-fragmentation — same job creating 3-4 distinct error_groups. Source-map-aware multi-frame hashing is a v0.3+ improvement; see `src/indexer/error-hash.ts`.

---

## Update protocol

When you finish a meaningful unit of work:

1. Update the Build Status table above.
2. If you added/removed a directory or file convention, update Directory Layout and Conventions.
3. If you made or reversed a stack decision, update Stack Decisions.
4. If you discovered a gotcha future-you (or another AI) needs to know, add to Open Questions.

This file is the fastest way for an AI to get oriented. Keep it accurate.
