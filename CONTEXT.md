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
| Docker image | not started | Next session |
| Queue detail page (job table + drawer) | not started | Spec §10 — next session |

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

- `scripts/seed.ts` — pushes 3 jobs into queue `email` (2 immediate, 1 delayed 60s).
- `scripts/worker.ts` — processes the `email` queue; intentionally fails `send-receipt` jobs to generate failure events.

Run with `pnpm tsx scripts/seed.ts` and `pnpm tsx scripts/worker.ts`.

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
