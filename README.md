# Pulseboard

Pulseboard is a local-first dashboard for capturing, inspecting, replaying, and forwarding webhooks.

It sits between a webhook provider and your local application:

```text
Provider → your tunnel → Pulseboard :4500/hook/* → your app
```

Pulseboard stores exact request bytes in SQLite, forwards them without re-serialization, detects common providers, verifies signatures, and provides a live web interface.

## Quick start

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:4500](http://localhost:4500). Development mode includes an echo target and generated webhook traffic.

For real use:

```bash
npx pulseboard --forward http://localhost:3000
```

Point your provider or tunnel at:

```text
http://localhost:4500/hook/your-path
```

Pulseboard strips `/hook` before forwarding, so `/hook/stripe` is sent to `http://localhost:3000/stripe`.

### Connect a provider

Open **Connect** in the dashboard to generate a setup for Stripe, GitHub, Shopify,
Vercel, Slack, or a generic HTTP provider. The flow:

- generates the Pulseboard start command for local, Vercel, AWS, Docker, and custom targets;
- generates Stripe CLI, Cloudflare Tunnel, ngrok, or existing-public-URL instructions;
- reports signing-secret and forwarding readiness; and
- sends an inspectable synthetic event through the configured capture and forwarding path.

The synthetic connection test verifies Pulseboard and the configured downstream
target. Send a real provider event afterward to confirm public reachability and
provider signature verification.

### Diagnose deliveries

Pulseboard translates common delivery failures into an explanation and a
concrete next step. It recognizes connection, DNS, TLS, timeout, redirect,
authentication, rate-limit, route, handler, and signature failures while
preserving the raw response and error evidence.

Analytics adds a developer-focused view of delivery health: P95 latency, slow
handler counts, failure causes, response classes, slowest endpoints, and recent
events that need attention. Every issue links back to the captured webhook.

### Compare webhook requests

Open any captured webhook and choose **Compare** to diff it against another
request. Pulseboard ranks matching event types and providers first, then shows:

- added, removed, changed, and unchanged JSON fields by path;
- case-insensitive request-header changes;
- delivery target, status, duration, and signature differences; and
- structured downstream response-body changes.

The comparison is chronological, so the earlier and later values remain clear
even when you start from the older request. Non-JSON payloads fall back to a
whole-body comparison instead of hiding the change.

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
npx pulseboard
```

All matching rules are combined and de-duplicated. If no rule matches, the default targets are used. Custom targets entered in Compose or replay must use HTTP(S) and match a configured target origin or a hostname in `PULSEBOARD_ALLOWED_FORWARD_HOSTS`. Redirects are not followed, so an approved endpoint cannot redirect a server-side request to an unapproved host.

Pulseboard records each delivery's target, status, duration, error, response headers, and the first 64 KB of its response body. Configured sensitive header names are redacted from dashboard/API responses.

## Commands

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm smoke:package
pnpm smoke:docker
pnpm release:check
pnpm start
```

## Docker

An example is available at `docker/docker-compose.example.yml`.

Keep the dashboard bound to localhost unless authentication is configured and the surrounding network is trusted.
