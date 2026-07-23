# Pulseboard Product Specification

## Product

Pulseboard is a local-first, self-hosted webhook development tool: **Postman for incoming requests**.

Developers point a webhook provider—or a tunnel such as ngrok or Cloudflare Tunnel—at Pulseboard. It captures the request, preserves its exact bytes, verifies supported provider signatures, forwards it to the developer’s application, and exposes the result in a live dashboard.

Pulseboard is distributed as an npm package and Docker image. A hosted tunnel is not part of v1.

## Core workflow

```text
Stripe / GitHub / Shopify / other provider
                  ↓
        user-managed HTTPS tunnel
                  ↓
        Pulseboard :4500/hook/*
                  ↓
        local application target
```

Everything after `/hook` is retained as the forwarded path.

## v0.1 scope

- Exact-byte request capture and forwarding
- Multi-target fan-out and source/path-prefix routing
- SQLite-backed, retention-limited history
- Live event feed over server-sent events
- Search and filters with cursor pagination
- Body, header, forwarding, and signature inspection
- Downstream status, headers, and bounded response-body inspection per delivery
- Dedicated, URL-addressable chronological webhook comparison across JSON paths, request headers, delivery outcomes, signatures, and response bodies
- Replay and edited replay
- Built-in webhook sender with provider presets
- Provider onboarding with generated local, tunnel, and hosted-target setup
- Synthetic capture and downstream connection test with inspectable results
- Signature verification and locally stored signing secrets
- Actionable connection and delivery diagnostics with raw error evidence
- Source, delivery, P95 latency, slow endpoint, failure-cause, response-class, and signature analytics
- Read-only mode, header redaction, optional password protection
- Allowlisted custom forwarding targets with redirects disabled
- npm and Docker distribution

## Product principles

1. **Payload agnostic.** Provider detection improves presentation but never gates capture.
2. **Exact bytes are authoritative.** Text is a display/search preview; signatures and forwarding use stored bytes.
3. **Local by default.** The default bind host is localhost and data stays in local SQLite.
4. **Safe mutation.** Replays, sends, secret changes, and destructive clears honor read-only mode.
5. **Honest history.** Replays create new rows and retain lineage.

## Out of scope for v0.1

- Hosted SaaS
- Built-in public tunnel infrastructure
- Multi-user roles
- Provider-specific payload editors
- General APM or logging

## Release gates

- Typecheck, tests, and production build pass
- Binary payloads round-trip byte-for-byte
- Sensitive configured headers are redacted from UI/API/SSE responses
- Retention and database-size limits are enforced
- Password protection covers dashboard and API while leaving `/hook/*` available
- Custom targets cannot reach unconfigured hosts or escape the allowlist through redirects
- Desktop and narrow-screen capture, inspection, compose, analytics, and settings flows are usable
- Browser E2E covers capture, inspect, compare, edit, replay, clear, delivery diagnostics, analytics, reverse-proxy auth, dark mode, narrow desktop, and large payloads
- npm package and Docker image pass smoke tests
- Production dependency audit has no known vulnerabilities
