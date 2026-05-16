# Pulseboard Product Specification

## 1. Product Summary

**Pulseboard** is a local-first, self-hosted BullMQ studio for monitoring, searching, debugging, and understanding background jobs.

The easiest way to describe it:

> Pulseboard is Drizzle Studio for BullMQ.

It connects to a user's Redis instance, reads BullMQ queue state, indexes useful job and event metadata into an embedded SQLite database, and serves a polished local/self-hosted dashboard.

Pulseboard is **not** a hosted SaaS in the first version. It is distributed as:

1. An npm package
2. A Docker image

The user runs Pulseboard near their Redis instance and opens the dashboard in their browser.

---

## 2. Core Positioning

### One-liner

Pulseboard is a modern BullMQ studio for real-time job monitoring, searchable job history, workflow graphs, and performance insights.

### Longer description

Pulseboard helps developers inspect queues, monitor jobs in real time, debug failures, visualize BullMQ flows, and understand performance bottlenecks without digging through logs or exposing Redis to a third-party cloud service.

### Core analogy

| Product | Connects to | Lets you inspect |
|---|---:|---|
| Drizzle Studio | SQL database | tables, rows, schemas |
| Pulseboard | Redis / BullMQ | queues, jobs, workers, flows, failures |

### What Pulseboard is

- Local-first BullMQ studio
- Self-hosted queue dashboard
- Redis/BullMQ inspector
- Job debugging cockpit
- Queue observability layer

### What Pulseboard is not

- Not a hosted SaaS in v1
- Not a Datadog replacement
- Not a general logging tool
- Not an APM platform
- Not dashboardWISE-specific
- Not dependent on modifying the user's app

---

## 3. Target Users

### Primary users

- Full-stack developers using BullMQ
- Backend developers managing background jobs
- SaaS teams running async workflows
- Indie hackers with local Redis queues
- Teams with self-hosted workers and Redis

### Use cases

Pulseboard should work for any BullMQ workload, including:

- Email queues
- Webhook delivery
- Billing jobs
- AI pipelines
- File processing
- Image/video processing
- Data imports
- Scheduled jobs
- Sync engines
- Report exports
- Notification workers
- Workflow automation

Example generic job names:

```txt
email.send
invoice.generate
user.import
image.process
webhook.deliver
stripe.sync
report.export
ai.embedding
notification.push
```

---

## 4. Product Form

Pulseboard has a web UI, but it is not initially a hosted web app.

The product is:

```txt
Pulseboard = Node server + React UI + BullMQ/ioredis connector + SQLite index
```

The user runs Pulseboard themselves.

### Distribution formats

#### 1. npm package

For local development:

```bash
npx pulseboard --redis redis://localhost:6379
```

Expected behavior:

```txt
Pulseboard starts a local server.
User opens http://localhost:4545.
Pulseboard connects to Redis.
Pulseboard shows BullMQ queues and jobs.
```

#### 2. Docker image

For self-hosted usage:

```yaml
services:
  pulseboard:
    image: pulseboard/pulseboard
    ports:
      - "4545:4545"
    environment:
      REDIS_URL: redis://redis:6379
      PULSEBOARD_DB_PATH: /data/pulseboard.db
      PULSEBOARD_AUTH_PASSWORD: changeme
      PULSEBOARD_READONLY: "false"
    volumes:
      - pulseboard-data:/data

  redis:
    image: redis:7

volumes:
  pulseboard-data:
```

Expected behavior:

```txt
Pulseboard runs next to Redis.
It serves the dashboard from port 4545.
It stores its own SQLite index in /data/pulseboard.db.
```

---

## 5. Connection Model

The browser should never connect directly to Redis.

Correct architecture:

```txt
Browser
  ↓
Pulseboard API server
  ↓
BullMQ / ioredis
  ↓
Redis
```

Bad architecture:

```txt
Browser
  ↓
Redis
```

Redis credentials must stay on the server side.

### Local Redis

```bash
npx pulseboard --redis redis://localhost:6379
```

### Docker Compose Redis

```yaml
REDIS_URL=redis://redis:6379
```

In Docker Compose, `redis` is the service hostname.

### Remote Redis

```env
REDIS_URL=redis://default:password@your-redis-host:6379
```

With TLS:

```env
REDIS_URL=rediss://default:password@your-redis-host:6380
```

### Upstash or serverless Redis

Pulseboard should support Redis URLs such as:

```env
REDIS_URL=rediss://default:password@host.upstash.io:6379
```

However, Pulseboard should warn users that queue monitoring may generate frequent Redis commands, especially when live monitoring, event polling, or reconciliation is enabled.

### Redis topology

| Topology | v1 status |
|---|---|
| Standalone | Supported and tested |
| Standalone + TLS (`rediss://`) | Supported and tested |
| Sentinel | Supported via ioredis sentinel config |
| Cluster | Explicit non-goal for v1 |
| Read replicas | Never (BullMQ atomicity requires a single primary) |

Cluster is excluded from v1 because BullMQ requires `{queueName}` hash tags so all keys for a queue land on one slot. Half-supporting Cluster is a footgun; revisit once there is real demand.

---

## 6. Data Strategy

Pulseboard should not query Redis for everything all the time.

The data model should use three layers:

```txt
Layer 1: Redis / BullMQ
Source of truth for current queue state, jobs, flows, retries, and actions.

Layer 2: In-memory cache
Fast live UI state for counts, active jobs, and recent events.

Layer 3: Embedded SQLite
Search, analytics, history, timelines, error grouping, and audit logs.
```

### Source of truth

Redis/BullMQ remains the truth.

SQLite is a local derived index.

If SQLite is deleted, Pulseboard should still work, but it loses historical analytics and local search history until rebuilt.

### Why SQLite?

SQLite is ideal because it is:

- Embedded
- Serverless
- Local
- File-based
- Easy to ship
- Zero setup for the user

Pulseboard should create and manage its own SQLite database automatically.

### Default SQLite paths

For npm mode:

```txt
~/.pulseboard/pulseboard.db
```

For Docker mode:

```txt
/data/pulseboard.db
```

Configurable through:

```env
PULSEBOARD_DB_PATH=/custom/path/pulseboard.db
```

---

## 7. Startup Flow

When Pulseboard starts:

```txt
1. Load configuration.
2. Connect to Redis.
3. Open or create SQLite database.
4. Run migrations automatically.
5. Discover or load configured BullMQ queues.
6. Bootstrap recent queue state from Redis.
7. Index recent job metadata into SQLite.
8. Start QueueEvents listeners.
9. Maintain in-memory cache for live dashboard state.
10. Serve the UI and API.
```

### Bootstrap limits

Pulseboard should not fetch millions of jobs on startup, but it must also not silently cap real history.

Suggested defaults (each is a chunk/page size, not a product cap):

```txt
failed: 1,000 per chunk
completed: 500 per chunk
waiting: 500 per chunk
delayed: 500 per chunk
active: all/current
waiting-children: 500 per chunk
```

All limits are configurable. Pulseboard must support three modes:

- Numeric cap: `PULSEBOARD_BOOTSTRAP_FAILED_LIMIT=10000`
- Full backfill via paginated streaming: `PULSEBOARD_BOOTSTRAP_FAILED_LIMIT=all`
- Time-based bounds: `PULSEBOARD_BOOTSTRAP_FAILED_SINCE=7d`

For `all` or large numeric backfills, Pulseboard must page through `getFailed(start, end)` in chunks and stream into SQLite, never loading the full result set into memory.

### Bootstrap UX

Bootstrap can take minutes on a large queue. The UI must surface progress prominently:

```txt
Indexing failed jobs: 12,450 / 87,200
```

The dashboard should be usable in a degraded mode during bootstrap rather than blocking on completion. Silent multi-minute waits read as broken and get killed.

---

## 8. Queue Discovery

Pulseboard should support two modes.

### Explicit queue list

Recommended for production:

```bash
npx pulseboard --redis redis://localhost:6379 --queues email,imports,billing
```

Or:

```env
PULSEBOARD_QUEUES=email,imports,billing
```

### Auto-discovery

Useful for local development.

Pulseboard can inspect Redis keys and infer BullMQ queue names.

However, auto-discovery may pick up unwanted queues or stale keys, so it should be optional.

```env
PULSEBOARD_AUTO_DISCOVER=true
```

### Recommended default

Auto-discovery is **off by default everywhere**. The CLI prompts on first run:

```txt
Found 4 BullMQ queues in Redis: email, imports, billing, webhooks.
Index all? [y/N]
```

For serverless Redis (`rediss://` with hosts like `upstash.io` or `redis-cloud.com`), Pulseboard refuses auto-discovery unless `--force-discover` is passed. `SCAN` over a serverless instance can be expensive enough to show up on a bill.

---

## 9. Core Features

## 9.1 Real-Time Job Monitoring

Pulseboard should show every job run at a glance.

### UI requirements

- Live queue status cards
- 7-day activity chart: completed vs failed
- Sortable job table
- Status indicators
- Tag-based search
- One-click navigation to job detail
- Live event stream

### Job statuses

Support at least:

```txt
waiting
active
delayed
completed
failed
paused
waiting-children
```

### Example dashboard stats

```txt
Queue: email

Completed today: 1,284
Failed today: 37
Active now: 6
Waiting: 122
Delayed: 18
Average processing time: 4.2s
Error rate: 2.8%
```

### Live feed example

```txt
10:31:04  email.send: active
10:31:08  email.send: completed
10:31:11  invoice.generate: failed
10:31:15  invoice.generate: retried
```

---

## 9.2 Performance Insights

Pulseboard should show what actually affects system health.

### Metrics

- Throughput trends
- Jobs per hour
- Error rate
- Processing time
- Wait time
- Slowest job types
- Most failing job types
- Retry rate
- Stalled jobs
- Queue backlog growth
- Worker utilization, if available

### Important definitions

```txt
Processing time = time spent executing the job after a worker starts it.

Wait time = time the job spent waiting before a worker picked it up.
```

### Interpretation

```txt
High processing time:
The job logic is slow.

High wait time:
The queue lacks worker capacity or has too much backlog.

High error rate:
The code, API, auth, payload, or dependency is failing.

High retry rate:
The system is unstable even if jobs eventually complete.
```

---

## 9.3 Powerful Search and Tag Filtering

Search should not scan Redis.

Search should query SQLite.

### Searchable fields

- Queue name
- Job ID
- Job name
- Status
- Tags
- Failed reason
- Error hash
- Attempt count
- Created time
- Processed time
- Finished time
- Wait time
- Processing time
- Parent job
- Flow ID

### Search examples

```txt
status:failed
queue:email
name:send-welcome-email
tag:transactional
reason:timeout
attempts:>2
duration:>10s
created:today
```

### Tag support

Pulseboard supports generic tags **without requiring app changes**. Tags are derived, not user-supplied. This preserves the "do not require app changes" principle.

#### Derivation sources (v1)

- Queue name (always becomes an implicit tag)
- Job name patterns (e.g., `email.send` → `email`, `email.retry` → `email`)
- Structured job ID prefixes (e.g., `tenant:acme:job:123` → `tenant:acme`)

#### Tag rules

Tag inference is persisted as **rules** (regex/glob), not per-job labels. A rule like `name LIKE 'email.%' → tag:email` applies to all current and future jobs automatically. One-off per-job labels rot.

#### User edits

Users can edit tags and tag rules in the Pulseboard UI. These edits live in SQLite only — Pulseboard never writes back to Redis. The user's app remains untouched.

---

## 9.4 Visual Workflow Graphs

Pulseboard should visualize BullMQ flows as interactive job trees.

### UI requirements

- Hierarchical flow visualization
- Parent-child job tree
- Status at every level
- Failed jobs highlighted
- Collapsible nodes
- Click node to open job detail
- Show duration per node
- Show retry count per node

### Example tree

```txt
sync-tenant
├─ sync-users       completed
├─ sync-products    completed
├─ sync-orders      failed
│  ├─ page-1        completed
│  ├─ page-2        completed
│  └─ page-3        failed
└─ sync-invoices    waiting
```

### Graph library

Use React Flow or a similar graph library.

The graph should support:

- Pan
- Zoom
- Fit view
- Node selection
- Status coloring
- Mini-map in later versions

---

## 9.5 Error Details That Actually Help

When a job fails, Pulseboard should provide all useful debugging context.

### Error page requirements

- Failed reason
- Full stack trace, if available
- Stack trace preview in tables
- Payload view, if enabled
- Return value, if available
- Attempts made
- Retry history
- Execution timeline
- Related jobs in the same flow
- Similar failures
- One-click retry
- Clone as new job
- Copy AI debug context

### Failure clustering

Pulseboard should group failures by error hash.

Example:

```txt
248 failed jobs

143  API 429 rate limit
61   OAuth token expired
31   Missing userId
13   Network timeout
```

### AI debug context

Pulseboard generates a clipboard-ready debug bundle for any failed job, designed to paste into Claude, Cursor, ChatGPT, or similar tools. The format is plain Markdown so any LLM host can consume it cleanly.

Contents:

- Queue name, job ID, job name, status
- Failed reason
- Stack trace (full if stored, preview otherwise)
- Attempts and retry history
- Recent timeline events
- Payload and return value (only if payload storage is enabled, with redaction applied)
- Repo path hint (from `process.cwd()` at Pulseboard startup, if Pulseboard was launched inside a repo)
- A suggested prompt stub at the bottom (e.g., *"Help me figure out why this job failed. Look at the stack and recent events first."*)

The bundle must respect redaction settings. Sensitive fields are never copied to the clipboard.

### Error hash

Naive hashing of `failedReason + top frame` will explode into too many groups. The normalizer must do real work.

#### Hash formula

```txt
errorHash = sha1(normalize(failedReason) + '|' + normalize(top 3-5 frames))
```

Hashing the top 3–5 frames (not just the top) avoids over-grouping when the top frame is a generic library function like `axios.request` or `fetch`.

#### Normalization rules

Strip before hashing:

- Line and column numbers (`foo.js:42:8` → `foo.js`)
- Absolute paths (`/Users/foo/proj/src/bar.js` → `src/bar.js` or `bar.js`)
- UUIDs, ULIDs, and hex IDs
- Numeric IDs in URLs and messages
- Timestamps (ISO strings, epoch numbers)
- Webpack/Vite chunk hashes (`chunk-AB12CD.js` → `chunk.js`)
- pnpm path noise (`node_modules/.pnpm/pkg@1.2.3/node_modules/pkg/` → `node_modules/pkg/`)

Keep `node:internal/*` frames as-is — they are stable and carry signal.

Source-map-aware normalization is a future enhancement, not a v1 requirement.

---

## 9.6 Retry and Clone

Retry and clone must be separate actions.

### Retry

Runs the same failed job again.

### Clone

Creates a new job with the same payload.

Clone is more dangerous because it can duplicate side effects.

### UI actions

- Retry job
- Clone job
- Clone and edit payload
- Remove job
- Promote delayed job
- Pause queue
- Resume queue
- Clean old jobs

### Safety requirements

For destructive actions:

- Confirmation modal
- Read-only mode support
- Audit log entry
- Role check in future team mode

---

## 9.7 Command Menu

Pulseboard should have a command-first interface.

Keyboard shortcut:

```txt
Cmd/Ctrl + K
```

### Commands

- Go to queue
- Go to failed jobs
- Search job ID
- Open job
- Retry selected job
- Clone selected job
- Pause queue
- Resume queue
- Toggle dark mode
- Copy debug context
- Open flow graph
- Filter failed jobs
- Filter active jobs

### Additional shortcuts

```txt
/        focus search
G Q      go to queues
G F      go to failed jobs
R        retry selected job
Esc      close drawer or modal
```

---

## 9.8 Dark and Light Mode

Pulseboard should support both dark and light mode from v1.

### UI system

Use **Coss UI** for components.

### Design direction

- Clean developer tooling aesthetic
- Compact tables
- Strong typography
- Subtle borders
- Status pills
- Resizable panels
- Monospace code blocks
- Good payload and JSON viewers
- Beautiful charts without dashboard clutter

### Layout

```txt
Sidebar:
- Queues
- Failed Jobs
- Flows
- Analytics
- Workers
- Settings

Main:
- Queue overview
- Charts
- Job table

Right drawer:
- Selected job detail

Bottom/side panel:
- Live event stream
```

---

## 10. Job Detail Page

The job detail page should merge live Redis state with Pulseboard's local indexed history.

### Flow

```txt
User opens job detail
  ↓
Pulseboard queries Redis for live job data
  ↓
Pulseboard queries SQLite for indexed event history
  ↓
Pulseboard merges both
  ↓
UI renders full detail view
```

### If job no longer exists in Redis

Show local indexed metadata only.

Message:

```txt
This job was removed from Redis. Pulseboard only has the indexed summary.
```

---

## 11. Analytics Architecture

Pulseboard should use SQLite for analytics.

### Analytics pages should query SQLite for:

- Completed vs failed over time
- Throughput trends
- Error rate
- Slowest jobs
- Most failing jobs
- Wait time distribution
- Processing time distribution
- Retry trends
- Queue backlog changes

### Data sources

Pulseboard may use:

1. BullMQ's built-in metrics, where available
2. Pulseboard's own indexed event history
3. Periodic reconciliation snapshots from Redis

The best long-term source is Pulseboard's own event index.

---

## 12. Reconciliation Strategy

Pulseboard should not rely only on live events.

It may be offline, restarted, or start after older events are trimmed.

### Recommended strategy

```txt
Live path:
QueueEvents update in-memory cache and SQLite quickly.

Reconciliation path:
Periodic Redis checks correct missed state.
```

### Suggested interval

```env
PULSEBOARD_RECONCILE_INTERVAL_SECONDS=60
```

### Reconciliation tasks

- Refresh job counts
- Refresh active jobs
- Refresh recent failed jobs
- Refresh recent completed jobs
- Detect status changes missed while offline
- Backfill recent jobs into SQLite

### What reconciliation cannot recover

Reconciliation only sees the **current state** of jobs in Redis. It cannot reconstruct:

- Transitions for jobs that were removed via `removeOnComplete` / `removeOnFail`
- Intermediate transitions that were trimmed from the QueueEvents stream (BullMQ default keeps ~10k recent events)
- Retry history for jobs that eventually completed — the final state has replaced the intermediate ones

In local npm mode, "Pulseboard was offline" is the default state — the user closes their terminal at EOD. After a 16-hour gap, many transitions are permanently invisible. Docker mode hits the same problem on restarts, deploys, and k8s rescheduling.

### Honesty in the UI

Pulseboard must be explicit about gaps, never silent about them:

- Show "Last indexed at: 2026-05-15 18:42" prominently on queue and analytics pages
- Annotate gaps in analytics charts (greyed-out bars during offline periods) rather than rendering them as zeros
- Surface a banner on first reconnect: *"Pulseboard was offline from X to Y. Transitions during that window may be missing."*

This is a load-bearing product principle (see §22): Pulseboard never lies about what it didn't see.

---

## 13. SQLite Schema Draft

### Operational requirements

- SQLite must be opened with `journal_mode=WAL` from day one. Non-negotiable for concurrent reads during event indexing.
- Every indexed table includes `instance_id TEXT NOT NULL DEFAULT 'default'` as the leading column in composite indexes. v1 always writes `'default'`; multi-instance support becomes a non-breaking upgrade.

### jobs

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL DEFAULT 'default',
  queue_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  tags_json TEXT,
  attempts_made INTEGER DEFAULT 0,
  created_at INTEGER,
  processed_on INTEGER,
  finished_on INTEGER,
  wait_time_ms INTEGER,
  processing_time_ms INTEGER,
  failed_reason TEXT,
  error_hash TEXT,
  stacktrace_preview TEXT,
  parent_key TEXT,
  flow_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX jobs_instance_queue_job_unique
ON jobs (instance_id, queue_name, job_id);

CREATE INDEX jobs_hot_path_idx
ON jobs (instance_id, queue_name, status, created_at DESC);

CREATE INDEX jobs_error_hash_idx
ON jobs (instance_id, error_hash);

CREATE INDEX jobs_flow_idx
ON jobs (instance_id, flow_id);
```

The `jobs_hot_path_idx` covers the most common dashboard query: "show me jobs in queue X with status Y, newest first." Order of columns matters — `created_at DESC` last enables index-only sorting.

### jobs_fts (FTS5)

```sql
CREATE VIRTUAL TABLE jobs_fts USING fts5 (
  failed_reason,
  stacktrace_preview,
  job_name,
  content='jobs',
  content_rowid='rowid'
);
```

Use `content='jobs'` (external content) to avoid duplicating failure text on disk. Sync via triggers on `INSERT`/`UPDATE`/`DELETE` of the `jobs` table.

### job_events

```sql
CREATE TABLE job_events (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL DEFAULT 'default',
  queue_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  attempts_made INTEGER,
  worker_id TEXT,
  processed_on INTEGER,
  event_data_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX job_events_job_idx
ON job_events (instance_id, queue_name, job_id, created_at DESC);

CREATE INDEX job_events_type_idx
ON job_events (instance_id, event_type, created_at DESC);
```

Common fields (`attempts_made`, `worker_id`, `processed_on`) are extracted into real columns for fast filtering. Anything forward-compatible stays in `event_data_json`.

### error_groups

```sql
CREATE TABLE error_groups (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL DEFAULT 'default',
  queue_name TEXT NOT NULL,
  job_name TEXT,
  error_hash TEXT NOT NULL,
  failed_reason TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX error_groups_unique
ON error_groups (instance_id, queue_name, error_hash);
```

### queue_metric_buckets

```sql
CREATE TABLE queue_metric_buckets (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL DEFAULT 'default',
  queue_name TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  bucket_size_seconds INTEGER NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  avg_wait_time_ms INTEGER,
  avg_processing_time_ms INTEGER,
  p95_processing_time_ms INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX queue_metric_buckets_unique
ON queue_metric_buckets (instance_id, queue_name, bucket_start, bucket_size_seconds);
```

### audit_logs

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL DEFAULT 'default',
  action TEXT NOT NULL,
  queue_name TEXT,
  job_id TEXT,
  actor TEXT NOT NULL DEFAULT 'admin',
  actor_source TEXT NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX audit_logs_created_at_idx
ON audit_logs (instance_id, created_at DESC);
```

`actor_source` values in v1: `password-auth`, `localhost-trusted`, `system`. The `actor` column always holds `'admin'` in v1 — per-user values are blocked until real user auth/RBAC lands. The column exists now so that future RBAC is a non-breaking upgrade.

---

## 14. Storage and Privacy

Pulseboard must be careful with job payloads.

Jobs may contain:

- API keys
- Access tokens
- Refresh tokens
- Emails
- Customer data
- Personal data
- Internal business data

### Safe defaults

```txt
Store job metadata: yes
Store failed reason: yes
Store stacktrace preview: yes
Store full stacktrace: configurable
Store payload snapshots: off by default
Store return values: off by default
```

### Redaction

Pulseboard should support redacted fields.

Default redaction keys:

```txt
password
secret
token
accessToken
refreshToken
apiKey
authorization
cookie
clientSecret
privateKey
```

### Retention

The local SQLite DB grows unbounded if not actively managed. `job_events` is the fastest-growing table on a busy queue.

#### Default policy

| Data | Retention | Notes |
|---|---|---|
| Raw `job_events` | 7–14 days | Powers timelines and live feed |
| Rolled-up metric buckets | 90 days | Powers analytics charts |
| Completed `jobs` rows | 7 days | Bulk of throughput |
| Failed `jobs` rows | 30 days | Failures are the debugging signal — retained longer |
| `audit_logs` | 90 days | |
| `error_groups` | Retained while any member is retained | |

#### Eviction order under DB size pressure

1. Oldest completed `job_events`
2. Oldest completed `jobs` rows
3. Oldest failed `job_events`
4. Oldest failed `jobs` rows

Failed rows are always evicted last within their age class.

#### Config

```env
PULSEBOARD_RETENTION_EVENTS_DAYS=14
PULSEBOARD_RETENTION_COMPLETED_DAYS=7
PULSEBOARD_RETENTION_FAILED_DAYS=30
PULSEBOARD_RETENTION_ROLLUPS_DAYS=90
PULSEBOARD_MAX_DB_SIZE_MB=2048
```

When `MAX_DB_SIZE_MB` is hit, the eviction order above runs until the DB is back under the cap. The UI surfaces this with a "Retention pruning ran at HH:MM, removed N rows" line in the audit log.

### Config

```env
PULSEBOARD_STORE_PAYLOADS=false
PULSEBOARD_STORE_RETURN_VALUES=false
PULSEBOARD_STORE_FULL_STACKTRACES=true
PULSEBOARD_REDACT_KEYS=password,secret,token,accessToken,refreshToken,apiKey,authorization
```

---

## 15. Security

### Local mode

Local mode may run without auth by default.

However, Pulseboard should clearly warn if binding to non-localhost without auth.

Default bind:

```env
PULSEBOARD_HOST=127.0.0.1
```

### Docker mode

Docker mode should strongly recommend auth.

```env
PULSEBOARD_AUTH_PASSWORD=changeme
```

### Read-only mode

Read-only mode disables destructive actions.

```env
PULSEBOARD_READONLY=true
```

Disabled actions:

- Retry
- Clone
- Remove
- Promote
- Pause queue
- Resume queue
- Clean jobs

### Future auth

Possible future options:

- OAuth
- SSO
- Team accounts
- Role-based permissions (RBAC)

#### Known v1 limitations

- Single-password auth means all destructive actions show `actor='admin'` in the audit log. Per-user attribution is blocked until real user auth lands.
- `client_ip` and `user_agent` are captured from day one to provide some forensic value even without identity.

---

## 16. Configuration

### CLI options

```bash
pulseboard \
  --redis redis://localhost:6379 \
  --port 4545 \
  --host 127.0.0.1 \
  --queues email,imports,billing \
  --readonly \
  --db ~/.pulseboard/pulseboard.db
```

### Environment variables

```env
REDIS_URL=redis://localhost:6379

PULSEBOARD_PORT=4545
PULSEBOARD_HOST=127.0.0.1
PULSEBOARD_QUEUES=email,imports,billing
PULSEBOARD_AUTO_DISCOVER=false

PULSEBOARD_DB_PATH=~/.pulseboard/pulseboard.db
PULSEBOARD_READONLY=false
PULSEBOARD_AUTH_PASSWORD=

PULSEBOARD_STORE_PAYLOADS=false
PULSEBOARD_STORE_RETURN_VALUES=false
PULSEBOARD_STORE_FULL_STACKTRACES=true
PULSEBOARD_REDACT_KEYS=password,secret,token,accessToken,refreshToken,apiKey,authorization

PULSEBOARD_RECONCILE_INTERVAL_SECONDS=60

PULSEBOARD_BOOTSTRAP_FAILED_LIMIT=1000
PULSEBOARD_BOOTSTRAP_COMPLETED_LIMIT=500
PULSEBOARD_BOOTSTRAP_WAITING_LIMIT=500
PULSEBOARD_BOOTSTRAP_DELAYED_LIMIT=500
PULSEBOARD_BOOTSTRAP_FAILED_SINCE=
PULSEBOARD_BOOTSTRAP_COMPLETED_SINCE=

PULSEBOARD_RETENTION_EVENTS_DAYS=14
PULSEBOARD_RETENTION_COMPLETED_DAYS=7
PULSEBOARD_RETENTION_FAILED_DAYS=30
PULSEBOARD_RETENTION_ROLLUPS_DAYS=90
PULSEBOARD_MAX_DB_SIZE_MB=2048
```

`*_LIMIT` accepts a number or `all`. `*_SINCE` accepts durations like `7d`, `24h`, `30m`, or an absolute ISO timestamp.

---

## 17. Technical Stack

### Runtime

- Node.js
- ESM
- BullMQ
- ioredis
- SQLite
- Drizzle ORM
- better-sqlite3

### Server

**Fastify** (decided).

Rationale: Pulseboard is a Node-only CLI/Docker product. Fastify's mature plugin ecosystem (`@fastify/static`, `@fastify/auth`, `@fastify/websocket`, `@fastify/sse-v2`) is a direct fit. Hono's main advantage is multi-runtime portability (edge/Deno/Cloudflare) which Pulseboard does not need.

### UI

- React
- Vite
- Tailwind CSS
- **Coss UI** (decided — built on Base UI, used in production by Cal.com)
- React Flow for workflow graphs
- cmdk-style command menu
- Recharts or lightweight charting library
- JSON viewer component
- Code/stacktrace viewer

Coss UI was chosen over shadcn for aesthetic differentiation — Pulseboard should not look like another shadcn dashboard.

### Packaging

- npm CLI package
- Docker image
- Static UI bundled into server package

---

## 18. Project Structure

### v0.1: single package

Ship v0.1 as a single package, not a monorepo. Monorepo plumbing slows down the foundation phase.

```txt
pulseboard/
  src/
    cli.ts
    server/
      app.ts
      routes/
    web/
      app/
      components/
      features/
    db/
      schema.ts
      migrations/
      client.ts
    bullmq/
      connection.ts
      queue-registry.ts
      queue-service.ts
      job-service.ts
      event-service.ts
      flow-service.ts
      action-service.ts
    indexer/
      bootstrap-indexer.ts
      event-indexer.ts
      reconciliation.ts
    security/
      redaction.ts
      auth.ts
  docker/
    Dockerfile
  package.json
```

### v0.3+: monorepo refactor

When npm packaging, Docker builds, and shared UI/core code start pulling against each other (expected around v0.3), refactor to:

```txt
pulseboard/
  apps/
    web/
    server/
  packages/
    ui/
    core/
  docker/
    Dockerfile
  package.json
```

Defer the refactor until it pays for itself. Premature monorepo is one of the slowest mistakes a small project can make.

---

## 19. MVP Scope

### v0.1

Goal: usable local/self-hosted BullMQ studio with credible differentiation from Bull Board on day one.

Features:

- npm package
- Docker image
- Connect to Redis (standalone + TLS)
- Open/create SQLite DB (WAL mode)
- Auto migrations with `instance_id` from day one
- Queue list
- Queue counts
- Job table
- Job detail drawer
- Failed jobs view
- Retry job
- Read-only mode
- Dark/light mode
- Basic settings screen
- **Minimal QueueEvents indexer** (active, completed, failed, stalled with timestamps and basic event data)
- **Bounded event buffer with drop-with-warning on backpressure**
- **"Last indexed at" indicator and gap-aware UI**

Event indexing moves into v0.1 (originally v0.2) because without it, Pulseboard launches as a nicer Bull Board clone instead of the "Drizzle Studio for BullMQ" product.

### v0.2

Goal: analytics and command surface on top of v0.1's event index.

Features:

- Live event feed (UI on top of v0.1 indexer)
- In-memory live cache for hot dashboard state
- Rolled-up metric buckets
- 7-day completed vs failed chart
- Basic throughput chart
- Error rate
- Processing time vs wait time
- Slowest jobs
- Most failing job types
- Command menu (Cmd/Ctrl+K)

### v0.3

Goal: advanced search and failure intelligence.

Features:

- Search syntax
- Tag filtering
- Failure clustering
- Error groups
- Similar failures
- Copy AI debug context
- Clone job
- Clone and edit payload
- Audit logs

### v0.4

Goal: BullMQ flow visualization.

Features:

- Flow tree viewer
- Interactive workflow graph
- Failed branches highlighted
- Click-to-open job node
- Parent/child job drilldown
- Flow-level timeline

### v1.0

Goal: polished self-hosted release.

Features:

- Stable npm package
- Stable Docker image
- Documentation
- Auth password
- Read-only mode
- Safe defaults
- Redaction system
- Production deployment guide
- Upstash/remote Redis notes
- Clean onboarding screen

---

## 20. UI Pages

### 1. Home / Overview

Shows:

- All queues
- Total active jobs
- Total waiting jobs
- Total failed jobs
- Total completed today
- Global error rate
- Global throughput chart

### 2. Queue Detail

Shows:

- Queue status cards
- Activity chart
- Job table
- Status filters
- Search bar
- Live event feed

### 3. Job Detail

Shows:

- Job status
- Job metadata
- Payload
- Result
- Error
- Stack trace
- Attempts
- Timeline
- Retry/clone actions
- Related flow/jobs

### 4. Failed Jobs

Shows:

- Failure groups
- Most common errors
- Failed job table
- Retry actions
- Error trend

### 5. Analytics

Shows:

- Throughput
- Error rate
- Wait time
- Processing time
- Slowest jobs
- Most failing jobs
- Backlog trend

### 6. Flows

Shows:

- Flow list
- Flow graph
- Job tree
- Failed branches

### 7. Settings

Shows:

- Redis connection info
- Queue discovery mode
- SQLite DB path
- Read-only mode
- Payload storage settings
- Redaction settings
- Theme setting

---

## 21. Core API Routes

All routes are scoped by `:instanceId` from day one. v1 always uses `default`, but the URL shape is future-proof — adding multi-instance support later requires no breaking API changes.

```txt
GET /api/health

GET /api/instances
GET /api/instances/:instanceId/queues
GET /api/instances/:instanceId/queues/:queueName
GET /api/instances/:instanceId/queues/:queueName/jobs
GET /api/instances/:instanceId/queues/:queueName/jobs/:jobId
GET /api/instances/:instanceId/queues/:queueName/events
GET /api/instances/:instanceId/queues/:queueName/metrics
GET /api/instances/:instanceId/queues/:queueName/flows/:flowId

POST /api/instances/:instanceId/queues/:queueName/jobs/:jobId/retry
POST /api/instances/:instanceId/queues/:queueName/jobs/:jobId/clone
POST /api/instances/:instanceId/queues/:queueName/jobs/:jobId/remove
POST /api/instances/:instanceId/queues/:queueName/pause
POST /api/instances/:instanceId/queues/:queueName/resume
POST /api/instances/:instanceId/queues/:queueName/clean
```

Live events use SSE:

```txt
GET /api/instances/:instanceId/queues/:queueName/live
```

---

## 22. Product Principles

### 1. Zero setup beyond Redis URL

The user should be able to run:

```bash
npx pulseboard --redis redis://localhost:6379
```

and get value immediately.

### 2. Redis is truth

Pulseboard should not pretend its SQLite index is the real queue state.

### 3. SQLite is rebuildable

The local DB is an index and history store. It can be deleted and rebuilt.

### 4. Do not require app changes

Pulseboard should work with existing BullMQ projects.

### 5. Respect sensitive data

Do not store payloads by default.

### 6. Local-first

No third-party cloud needed.

### 7. Beautiful but practical

The UI should be polished, but the product wins by making debugging faster.

### 8. Never lie about what we didn't see

Pulseboard's history is incomplete by definition — it can only index events while it is running, and Redis trims old events out from under it. Gaps must be shown as gaps, not as zeros. The user must always be able to answer: *"did this job actually fail, or did Pulseboard just miss it?"*

This is the trust line that separates Pulseboard from Bull Board.

---

## 23. Differentiation

Bull Board shows jobs.

Pulseboard should explain the system.

### Differentiators

- Embedded SQLite search index
- Real analytics
- Failure clustering
- Workflow graphs
- Command menu
- Timeline-based debugging
- Copy AI debug context
- Local-first distribution
- Strong dark/light UI
- Production-safe read-only mode
- Payload redaction

### Core product line

```txt
Pulseboard tells you what broke, why it broke, how often it breaks, what it affects, and what to do next.
```

---

## 24. Open Decisions

Most stack-level decisions are resolved. Remaining open items:

### 1. Concrete retention numbers

§14 lists starting points (14d events, 7d completed, 30d failed, 90d rollups, 2GB cap). These should be tuned against real usage before v1 GA.

### 2. Operational guarantee thresholds

Pulseboard should publish hard numbers: max sustained Redis RPS, max DB growth/day at default settings. Easier to measure once v0.1 is running than to predict now.

### 3. Tag rule UX

Tag inference rules (§9.3) need a UI for users to add/edit/disable rules. Defer the editor UI to v0.3 once we know which rule shapes are actually useful.

---

### Resolved

| Decision | Resolution |
|---|---|
| Server framework | Fastify |
| UI framework / build | React + Vite |
| Component library | Coss UI |
| Database library | Drizzle ORM + better-sqlite3 |
| Queue discovery default | Off everywhere; CLI prompts on first run |
| Payload storage default | Off by default; redact common secret fields |
| Repo layout | Single package v0.1; monorepo refactor around v0.3 |
| Multi-instance schema | `instance_id` from day one, always `'default'` in v1 |

---

## 25. First Implementation Plan

The order has been revised: event indexing moves earlier (now Step 5) because v0.1 ships with it.

### Step 1: CLI skeleton

```bash
npx pulseboard --redis redis://localhost:6379
```

Starts Fastify server and serves placeholder UI.

### Step 2: Fastify server + Vite dev integration

Static file serving for the built UI, dev-mode proxy to Vite, `/api/health` route.

### Step 3: Redis/BullMQ connection

Connect via ioredis (standalone + TLS), instantiate `Queue` objects for explicit queue list, expose counts.

### Step 4: SQLite setup + migrations

Drizzle schema with `instance_id`, WAL mode, FTS5 virtual table, all composite indexes from day one. Run migrations on startup.

### Step 5: Minimal QueueEvents indexer

Subscribe to `active`, `completed`, `failed`, `stalled`. Persist with timestamps and extracted fields (`attempts_made`, `worker_id`, `processed_on`). Bounded in-memory buffer with drop-with-warning on backpressure.

### Step 6: Queue overview

Queue list with counts; "Last indexed at" indicator visible.

### Step 7: Job table

Jobs by status with pagination, served from SQLite using `jobs_hot_path_idx`.

### Step 8: Job detail

Merge live Redis state with indexed event history. Show metadata, payload (if enabled), result, failed reason, stack trace, timeline.

### Step 9: Live updates

SSE endpoint streams new events to the open dashboard.

### Step 10: Actions + read-only mode

Retry, pause, resume. Read-only mode disables destructive endpoints. Audit log writes from day one (always `actor='admin'`, `actor_source='password-auth'` or `'localhost-trusted'`).

---

## 26. Final Product Definition

Pulseboard is a local-first, self-hosted BullMQ studio distributed as an npm package and Docker image.

It connects to Redis, indexes job metadata into an embedded SQLite database, and gives developers a beautiful interface for real-time monitoring, powerful search, workflow graphs, analytics, and error debugging.

It is the Drizzle Studio experience, but for BullMQ.
