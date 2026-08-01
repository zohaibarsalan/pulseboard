<p align="center">
  <img src="src/web/public/favicon.svg" width="72" height="72" alt="Pulseboard logo">
</p>

<h1 align="center">Pulseboard</h1>

<p align="center">
  <strong>Postman for incoming requests.</strong><br>
  Capture, inspect, replay, compare, and forward webhooks from a local dashboard.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@zohaibarsalan/pulseboard"><img src="https://img.shields.io/npm/v/%40zohaibarsalan%2Fpulseboard?style=flat-square&color=111827" alt="npm version"></a>
  <a href="https://github.com/zohaibarsalan/pulseboard/releases"><img src="https://img.shields.io/github/v/release/zohaibarsalan/pulseboard?style=flat-square&color=111827" alt="GitHub release"></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-111827?style=flat-square" alt="Node.js 20 or newer">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-you-can-do">Features</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#development">Development</a>
</p>

![Pulseboard webhook inspector](docs/product-shots/webhook-inspector.png)

Pulseboard sits between a webhook provider and your application. It keeps the
exact request bytes in SQLite, forwards them without re-serialization, verifies
supported provider signatures, and shows the entire delivery lifecycle in a
live web interface.

```text
Provider → your tunnel → Pulseboard :4500/hook/* → your app
```

No hosted account or cloud database is required. Pulseboard listens on
`127.0.0.1` by default and keeps your webhook history on your machine.

## Quick start

Requires Node.js 20 or newer.

```bash
npx @zohaibarsalan/pulseboard --forward http://localhost:3000
```

Then:

1. Open [http://localhost:4500](http://localhost:4500).
2. Point your provider or tunnel at `http://localhost:4500/hook/your-path`.
3. Trigger an event and inspect the request, signature, forwarding result, and response.

Pulseboard strips the `/hook` prefix when forwarding. For example,
`/hook/stripe` is delivered to `http://localhost:3000/stripe`.

Choose explicit runtime locations when needed:

```bash
npx @zohaibarsalan/pulseboard \
  --port 4600 \
  --db ./data/pulseboard.db \
  --forward http://localhost:3000
```

## What you can do

| | Capability | What it gives you |
|---|---|---|
| 📥 | **Capture exactly** | Raw request bytes, headers, paths, query strings, and searchable JSON previews stored in SQLite |
| 🔎 | **Inspect end to end** | Provider detection, signature state, downstream status, headers, response body, duration, and attempt history |
| ↻ | **Replay and edit** | Resend the original request or modify its body, headers, and destination before replaying |
| ⇄ | **Compare captures** | Field-level JSON, header, signature, delivery, and response differences in chronological order |
| ⑂ | **Route and fan out** | Deliver to multiple targets or select targets with source and path-prefix rules |
| ⚕ | **Diagnose failures** | Concrete guidance for DNS, TLS, timeout, redirect, authentication, rate-limit, route, handler, and signature errors |
| ⏱ | **Retry safely** | Persisted target-level attempts, manual retries, optional exponential backoff, and queued-attempt cancellation |
| ✎ | **Compose test events** | Provider presets and signing support for exercising the complete capture-to-delivery path |

## Product tour

### Understand delivery health

See P95 latency, slow handlers, response classes, failure causes, recovered
deliveries, and exhausted retries. Every issue links back to the captured event.

![Pulseboard delivery analytics](docs/product-shots/analytics.png)

### Compare webhook requests

Compare two captures across structured bodies, request headers, signatures,
delivery outcomes, and downstream responses. Comparison URLs are bookmarkable.

![Pulseboard webhook comparison](docs/product-shots/compare.png)

## Connect a provider

The **Connect** workflow generates setup instructions for Stripe, GitHub,
Shopify, Vercel, Slack, and generic HTTP providers. It supports Stripe CLI,
Cloudflare Tunnel, ngrok, existing public URLs, Docker, and custom targets.

Its synthetic connection test exercises Pulseboard and the configured
downstream target, producing a real inspectable event. Send a provider event
afterward to confirm public reachability and signature verification.

## Delivery behavior

Each target gets a persisted attempt timeline. You can retry only the failed
target, inspect every response, or cancel a queued automatic retry without
duplicating the captured webhook.

Automatic retries are disabled by default. When enabled, Pulseboard retries
transient network failures, `408`, `429`, and `5xx` responses using capped
exponential backoff. Permanent `4xx` responses remain manual.

## Local by default

The npm package starts one foreground Node.js process that serves the dashboard
and capture API. By default it:

- listens only on `127.0.0.1:4500`;
- stores history in `~/.pulseboard/pulseboard.db`;
- reuses that SQLite history on the next run; and
- stops when you press `Ctrl+C`.

For an always-on shared instance, run Pulseboard with Docker or a process
manager, bind deliberately with `PULSEBOARD_HOST=0.0.0.0`, and configure
authentication before exposing it.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PULSEBOARD_HOST` | `127.0.0.1` | Bind host |
| `PULSEBOARD_PORT` | `4500` | Bind port |
| `PULSEBOARD_FORWARD` | — | Default forwarding target |
| `PULSEBOARD_FORWARD_TARGETS` | — | Comma-separated default targets; each capture is sent to all of them |
| `PULSEBOARD_ROUTING_RULES` | `[]` | JSON routing rules matched by `source` and/or `pathPrefix` |
| `PULSEBOARD_ALLOWED_FORWARD_HOSTS` | — | Hostnames allowed for custom Compose/replay targets |
| `PULSEBOARD_FORWARD_TIMEOUT_MS` | `30000` | Forward timeout |
| `PULSEBOARD_DB_PATH` | `~/.pulseboard/pulseboard.db` | SQLite path |
| `PULSEBOARD_READONLY` | `false` | Disable sends, replays, clears, and secret changes |
| `PULSEBOARD_AUTH_PASSWORD` | — | Enable HTTP Basic auth; username is `pulseboard` |
| `PULSEBOARD_REDACT_HEADERS` | sensitive defaults | Comma-separated header-name tokens hidden from clients |
| `PULSEBOARD_RETENTION_DAYS` | `30` | Delete older webhook history |
| `PULSEBOARD_MAX_DB_SIZE_MB` | `1024` | Prune oldest history above this database size |

The `/hook/*` capture endpoint remains unauthenticated when password protection is enabled so providers can deliver webhooks.

### Routing and forwarding safety

Route selected webhooks to one or more services:

```bash
PULSEBOARD_FORWARD_TARGETS=http://localhost:3000,http://localhost:4000 \
PULSEBOARD_ROUTING_RULES='[{"source":"stripe","targets":["http://localhost:3000"]},{"pathPrefix":"/audit","targets":["http://localhost:4000"]}]' \
npx @zohaibarsalan/pulseboard
```

All matching rules are combined and de-duplicated. If no rule matches, the default targets are used. Custom targets entered in Compose or replay must use HTTP(S) and match a configured target origin or a hostname in `PULSEBOARD_ALLOWED_FORWARD_HOSTS`. Redirects are not followed, so an approved endpoint cannot redirect a server-side request to an unapproved host.

Pulseboard records every delivery attempt's target, trigger, state, schedule,
status, duration, error, response headers, and the first 64 KB of its response
body. Configured sensitive header names are redacted from dashboard/API
responses.

## Development

```bash
git clone https://github.com/zohaibarsalan/pulseboard.git
cd pulseboard
pnpm install
pnpm dev
```

Open [http://localhost:4500](http://localhost:4500). Development mode starts
the dashboard, API, an echo target, and generated webhook traffic.

### Quality checks

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm product-shots
pnpm build
pnpm smoke:package
pnpm smoke:docker
pnpm release:check
pnpm start
```

`pnpm product-shots` starts or reuses the development stack, seeds a
representative GitHub webhook pair, and uses the development-only Screenshotter
integration to capture the webhook inspector, analytics, and comparison
workspaces into `docs/product-shots`. In development, open Screenshotter
manually from its bottom-right launcher or with `Cmd/Ctrl + Shift + K`. It is
excluded from Pulseboard's production bundle and npm runtime.

## Test strategy

Pulseboard uses a risk-based automated release gate. Tests are grouped by
behavior so the suite stays useful and maintainable instead of chasing a test
count. It covers these independent failure boundaries:

- configuration defaults, environment parsing, CLI precedence, invalid values,
  routing rules, forwarding allowlists, and SSRF protections;
- provider detection plus valid, modified, and missing-secret signature cases
  for every signable provider;
- exact-byte capture, authentication, header redaction, capture-only mode,
  read-only mode, persistence, retention, forwarding, response capture,
  retries, delivery diagnostics, and analytics;
- webhook body/header comparison, provider onboarding commands, JSON display,
  time/number formatting, and refresh preferences;
- browser E2E coverage for capture → inspect → edit → replay → compare → clear;
  and
- clean-room npm tarball and Docker smoke tests, including process restart and
  SQLite persistence for the installed package.

Run the fast unit and integration suite with:

```bash
pnpm test
```

Before publishing, run the complete release gate:

```bash
pnpm release:check
```

That command additionally type-checks both server and browser code, audits
production dependencies, executes the real browser workflow, installs the
packed npm artifact in a clean temporary project, and boots the Docker image.
The release is not considered verified if any layer fails.

## Docker

Build and run the image locally:

```bash
docker build -f docker/Dockerfile -t pulseboard .
docker run --rm \
  -p 4500:4500 \
  -v pulseboard-data:/data \
  -e PULSEBOARD_HOST=0.0.0.0 \
  -e PULSEBOARD_DB_PATH=/data/pulseboard.db \
  pulseboard
```

A Compose example is available at
[`docker/docker-compose.example.yml`](docker/docker-compose.example.yml).

Keep the dashboard bound to localhost unless authentication is configured and the surrounding network is trusted.
