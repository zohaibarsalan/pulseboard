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

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PULSEBOARD_HOST` | `127.0.0.1` | Bind host |
| `PULSEBOARD_PORT` | `4500` | Bind port |
| `PULSEBOARD_FORWARD` | — | Default forwarding target |
| `PULSEBOARD_FORWARD_TIMEOUT_MS` | `30000` | Forward timeout |
| `PULSEBOARD_DB_PATH` | `~/.pulseboard/pulseboard.db` | SQLite path |
| `PULSEBOARD_READONLY` | `false` | Disable sends, replays, clears, and secret changes |
| `PULSEBOARD_AUTH_PASSWORD` | — | Enable HTTP Basic auth; username is `pulseboard` |
| `PULSEBOARD_REDACT_HEADERS` | sensitive defaults | Comma-separated header-name tokens hidden from clients |
| `PULSEBOARD_RETENTION_DAYS` | `30` | Delete older webhook history |
| `PULSEBOARD_MAX_DB_SIZE_MB` | `1024` | Prune oldest history above this database size |

The `/hook/*` capture endpoint remains unauthenticated when password protection is enabled so providers can deliver webhooks.

## Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Docker

An example is available at `docker/docker-compose.example.yml`.

Pulseboard is currently pre-release software. Keep the dashboard bound to localhost unless authentication is configured and the surrounding network is trusted.
