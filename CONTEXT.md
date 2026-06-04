# Pulseboard — AI Context

This file orients AI assistants working on this codebase. **Keep it up to date as the code evolves.** If you change architecture, decisions, or conventions, update this file in the same commit.

---

## One-line summary

Pulseboard is a local-first, self-hosted tool to **capture, inspect, replay, and forward webhooks**. You point a provider (Stripe, GitHub, Shopify, etc.) — or a tunnel like ngrok — at Pulseboard's capture URL; it stores every request in embedded SQLite, forwards it to your local app with the raw bytes preserved, and serves a polished dashboard. Positioning: *Postman for incoming requests*.

This project was pivoted from the original Pulseboard BullMQ concept after we found [Workbench](https://github.com/pontusab/workbench) already occupied that space. The product name is Pulseboard again, but the product surface is still webhook capture and replay. Keep the current logo mark as-is.

---

## How it works

Pulseboard sits **behind** the user's tunnel — it does not build one (that's the expensive ngrok-competing part, out of scope for v1).

```
Stripe / GitHub / etc
        │
        ▼
   ngrok / Cloudflare / HTTPS URL   (user's responsibility)
        │
        ▼
   Pulseboard      :4500/hook/*     (capture + store + forward)
        │
        ▼
   Your local app  :3000            (--forward target)
```

The user changes their tunnel target from their app's port to Pulseboard's port. Webhooks arrive at `/hook/*`; everything after `/hook` is the "real" path, recorded and replayed onto the forward target.

### Design principles

- **Payload-agnostic core.** We store raw bytes + headers + content-type. We never try to understand each provider's payload semantics — there are thousands. The UI renders JSON generically.
- **Source detection is cosmetic.** We sniff the provider from headers (`Stripe-Signature`, `X-GitHub-Event`, etc.) only for a label/icon. Unknown providers still work fully.
- **Raw-byte preservation is load-bearing.** Webhook signatures are HMACs of the exact body. The forwarder must never re-serialize, or signature validation breaks on the user's app. This is why the Fastify content-type parser is replaced with a global raw-string parser (`removeAllContentTypeParsers()` + wildcard parser in `server/app.ts`).

---

## Build status

Building **v0.1**.

| Component | Status | Notes |
|---|---|---|
| CLI (`pulseboard --forward <url>`) | done | commander; `--port`, `--forward`, `--forward-timeout`, `--readonly`, `--db` |
| Config loader (CLI + env) | done | zod-validated; `PULSEBOARD_*` env vars, with `WEBHOOK_STUDIO_*` fallback compatibility |
| Drizzle schema + WAL SQLite | done | Single `webhooks` table; indexes on received_at, source, path |
| Capture route (`/hook/*`) | done | `server/routes/capture.ts` — catch-all, stores raw body, detects source, forwards, publishes to bus |
| Forwarder | done | `capture/forwarder.ts` — preserves raw bytes, strips hop-by-hop headers, records status/duration/error |
| Source detector | done | `capture/detector.ts` — Stripe/GitHub/Shopify/Twilio/Slack/Discord/Linear/Polar/Clerk/Vercel/Paddle + unknown fallback |
| API routes | done | `server/routes/webhooks.ts` — list (filters + cursor), get, sources, stats, replay, clear |
| SSE live feed | done | `server/routes/live.ts` — `/api/live`, hello + 15s heartbeat, publishes every captured/replayed webhook |
| Row serializer | done | `server/serialize.ts` — maps raw snake_case SQLite rows to camelCase for the UI (hand-written SQL bypasses Drizzle's casing) |
| Health route | done | `/api/health` — status, forwardTo, captureUrl, lastCapturedAt, readonly |
| Web shell (sidebar + topbar + Cmd+K) | done | Reused from Pulseboard; nav trimmed to Webhooks + Settings |
| Webhooks page | done | Split-pane: filterable live list (left) + inspect detail (right). Status + source filters, search, clear |
| Webhook detail | done | `components/WebhookDetail.tsx` — Body/Headers/Forwarding tabs, replay, copy-as-cURL |
| Settings page | done | Capture URL (copyable), forwarding target, system status, read-only mode |
| Dockerfile + compose example | done | Node 20 slim; `PULSEBOARD_*` env; port 4500 |
| Production build | done | `pnpm build` → `dist/cli.js` + `dist/web/` |

---

## Roadmap (next features)

Prioritized list. Done items kept here for product context.

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Signature verification | ✅ done | HMAC verifiers for 9 providers, `webhook_secrets` table, masked Settings UI, badge in detail + list rows |
| 2 | Replay with edits | ✅ done | Replay endpoint accepts body + headers overrides (merged with original). Inline edit mode in WebhookDetail with JSON formatter and editable header rows. Edited replays tagged `replay-edited`; signature marked `not_applicable` since HMAC no longer matches |
| 3 | Analytics page | ✅ done | Filter bar (source pills + status + signature), 4 KPIs with vs-prev-period trends, stacked-area throughput chart, forwarding-latency line chart, breakdowns by source and event_type with success-rate bars. Endpoints under `/api/analytics/{summary,timeseries,breakdown}`. |
| 4 | Built-in webhook sender | ✅ done | Compose page with provider presets (Stripe, GitHub, Shopify, Clerk, Slack, Linear, Paddle + blank). Auto-sign with stored secrets via `capture/signer.ts` (mirror of the verifier). `POST /api/sender/send` forwards through the same pipeline and stores the result tagged `sourceIp: studio-sender`. Closed loop: sender signs → capture verifies → badge shows valid. |
| 5 | Onboarding / first-run | pending | When empty, show the capture URL huge with a copyable curl example. Most important moment in the UX. |

---

## Running it

```bash
pnpm install

# dev — runs everything you need:
#   - Vite on :5173 (HMR)
#   - Pulseboard server on :4500 (proxies non-/api, non-/hook to Vite)
#   - dev-sender: an echo target on :3999 + a fake-webhook generator
#     so the UI always has live traffic
pnpm dev
# Open http://localhost:4500

# prod
pnpm build
pnpm start            # = node dist/cli.js

pnpm typecheck        # server + web tsconfigs
pnpm db:generate      # regenerate Drizzle migrations after schema changes
```

### Real usage

```bash
npx pulseboard --forward http://localhost:3000
# Point your tunnel at the printed capture URL, e.g.
#   https://your-tunnel.ngrok.io/hook/stripe
# Pulseboard captures, stores, and forwards to localhost:3000/stripe
```

### Dev test traffic

`scripts/dev-sender.ts` runs a tiny echo server (the forward target on :3999) and posts realistic fake webhooks (stripe/github/shopify/clerk/custom) to the capture URL every 2.5s. It defaults to no downstream failures for a quiet dev run; set `ECHO_FAILURE_RATE=0.15` when you want visible error states. Started automatically by `pnpm dev`.

---

## Stack decisions

| Decision | Choice |
|---|---|
| Runtime | Node ≥20, ESM |
| Language | TypeScript (strict) |
| Package manager | pnpm |
| Server | Fastify |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| UI | React + Vite + Tailwind 3 |
| Routing | wouter |
| Data fetching | TanStack Query |
| Live updates | SSE (not WebSocket) |
| Distribution | npm package + Docker image |

---

## Directory layout

```
src/
  cli.ts                  ← CLI entry (commander)
  config/index.ts         ← zod config (CLI + env)
  capture/
    event-bus.ts          ← in-memory pub/sub for SSE
    detector.ts           ← source detection from headers/body
    forwarder.ts          ← raw-byte-preserving proxy to forward target
  server/
    app.ts                ← Fastify factory; raw-body parser; static/proxy
    context.ts            ← AppContext (config, db, bus, lastCapturedAt)
    serialize.ts          ← snake_case row → camelCase Webhook
    routes/
      capture.ts          ← /hook/* catch-all
      webhooks.ts         ← /api/webhooks* (list/get/sources/stats/replay/clear)
      live.ts             ← /api/live SSE
      health.ts           ← /api/health
  db/
    schema.ts             ← webhooks table
    client.ts             ← better-sqlite3 + WAL
    migrate.ts            ← migration runner
    migrations/           ← drizzle-kit generated SQL
  web/                    ← React UI (served by Fastify)
    pages/                ← Webhooks, Settings, Placeholder
    components/           ← Sidebar, Topbar, WebhookDetail, SourceBadge, SearchInput, CommandPalette
    lib/                  ← api, format, cn, hooks
scripts/
  dev-sender.ts           ← echo target + fake webhook generator
docker/
  Dockerfile
  docker-compose.example.yml
```

---

## Conventions

- TypeScript strict, ESM only (`.js` import extensions), kebab-case files.
- Comments only when the WHY is non-obvious.
- API routes carry **no request bodies** (GET + param-only POST) so the global raw-body parser is safe. The one exception (replay's optional `forwardTo`) is parsed manually from the raw string.
- Hand-written SQL returns snake_case — always map through `rowToWebhook` before returning to the client or publishing to the bus.

---

## Open questions / gotchas

- **Raw body parser is global.** `removeAllContentTypeParsers()` + a `*` string parser. Don't add JSON-body API routes without parsing the string manually (see replay route).
- **Capture path prefix is `/hook`.** Chosen to cleanly separate webhook ingress from the UI (`/`) and API (`/api/*`). The prefix is stripped before recording/forwarding.
- **Forwarding mirrors the downstream status** back to the provider when forwarding succeeds; otherwise returns 200 to acknowledge capture.
- **Replays are stored as new rows** with `replay_of` set, so the timeline stays honest. The original's `replay_count` is bumped.
- **No built-in tunnel in v1.** Users bring ngrok/Cloudflare. A built-in tunnel is a possible later feature but means competing with ngrok's infra.
- **better-sqlite3 native build** still applies (see pnpm `onlyBuiltDependencies`); Node 24 has no prebuilt binary and compiles on install.
```
