import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import path from "node:path";

const DB_PATH = process.env.PULSEBOARD_DB_PATH ?? ".pulseboard/dev.db";
const DAYS = 30;
const INSTANCE_ID = "default";

const QUEUES = ["email", "imports", "invoices", "webhooks", "ai-pipeline"];

const JOB_SPECS: Record<string, { names: string[]; failRate: number; avgDurationMs: number; durationVariance: number }> = {
  email: {
    names: ["send-welcome", "send-receipt", "send-newsletter", "send-reminder", "send-verification"],
    failRate: 0.03,
    avgDurationMs: 400,
    durationVariance: 300,
  },
  imports: {
    names: ["parse-csv", "validate-rows", "import-batch", "reconcile-data"],
    failRate: 0.08,
    avgDurationMs: 2500,
    durationVariance: 2000,
  },
  invoices: {
    names: ["generate-invoice", "send-invoice-email", "calculate-tax", "apply-discounts"],
    failRate: 0.04,
    avgDurationMs: 800,
    durationVariance: 500,
  },
  webhooks: {
    names: ["deliver-webhook", "retry-delivery", "verify-signature"],
    failRate: 0.12,
    avgDurationMs: 300,
    durationVariance: 400,
  },
  "ai-pipeline": {
    names: ["embed-text", "classify-document", "extract-entities", "summarize-content"],
    failRate: 0.15,
    avgDurationMs: 3500,
    durationVariance: 3000,
  },
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function trafficMultiplier(hour: number): number {
  // Sine wave peaking at 2pm, low at 4am
  const phase = ((hour - 14) / 24) * Math.PI * 2;
  return 0.3 + 0.7 * ((Math.cos(phase) + 1) / 2);
}

function dayOfWeekMultiplier(dayOfWeek: number): number {
  // Lower on weekends
  return dayOfWeek === 0 || dayOfWeek === 6 ? 0.4 : 1.0;
}

type JobRow = {
  id: string;
  instance_id: string;
  queue_name: string;
  job_id: string;
  job_name: string;
  status: string;
  attempts_made: number;
  created_at: number;
  processed_on: number;
  finished_on: number;
  wait_time_ms: number;
  processing_time_ms: number;
  failed_reason: string | null;
  error_hash: string | null;
  stacktrace_preview: string | null;
  updated_at: number;
};

type EventRow = {
  id: string;
  instance_id: string;
  queue_name: string;
  job_id: string;
  event_type: string;
  attempts_made: number;
  worker_id: string;
  processed_on: number;
  created_at: number;
};

const FAILURE_REASONS = [
  "Connection timeout after 30000ms",
  "SMTP server rejected message: 550 Mailbox not found",
  "Rate limit exceeded: retry after 60s",
  "Invalid CSV: missing required column 'user_id'",
  "Row 47: column count mismatch",
  "Webhook endpoint returned 502 Bad Gateway",
  "OpenAI API error: rate_limit_exceeded",
  "Document classification failed: model confidence below threshold",
  "Database connection pool exhausted",
  "S3 upload failed: AccessDenied",
];

function generateJobs(db: Database.Database): void {
  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO jobs (
      id, instance_id, queue_name, job_id, job_name, status,
      attempts_made, created_at, processed_on, finished_on,
      wait_time_ms, processing_time_ms, failed_reason, error_hash,
      stacktrace_preview, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO job_events (
      id, instance_id, queue_name, job_id, event_type,
      attempts_made, worker_id, processed_on, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const startTime = now - DAYS * DAY_MS;

  let jobCounter = 100000;
  let totalJobs = 0;
  let totalCompleted = 0;
  let totalFailed = 0;

  console.log(`Seeding ${DAYS} days of historical data...`);

  const insertMany = db.transaction((jobs: JobRow[], events: EventRow[]) => {
    for (const job of jobs) {
      insertJob.run(
        job.id, job.instance_id, job.queue_name, job.job_id, job.job_name, job.status,
        job.attempts_made, job.created_at, job.processed_on, job.finished_on,
        job.wait_time_ms, job.processing_time_ms, job.failed_reason, job.error_hash,
        job.stacktrace_preview, job.updated_at
      );
    }
    for (const event of events) {
      insertEvent.run(
        event.id, event.instance_id, event.queue_name, event.job_id, event.event_type,
        event.attempts_made, event.worker_id, event.processed_on, event.created_at
      );
    }
  });

  // Generate hour by hour
  for (let hourOffset = 0; hourOffset < DAYS * 24; hourOffset++) {
    const hourStart = startTime + hourOffset * HOUR_MS;
    const date = new Date(hourStart);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();

    const baseJobsPerHour = 50; // Base rate
    const multiplier = trafficMultiplier(hour) * dayOfWeekMultiplier(dayOfWeek);
    const jobsThisHour = Math.round(baseJobsPerHour * multiplier * rand(0.7, 1.3));

    const jobs: JobRow[] = [];
    const events: EventRow[] = [];

    for (let i = 0; i < jobsThisHour; i++) {
      const queueName = pick(QUEUES);
      const spec = JOB_SPECS[queueName];
      const jobName = pick(spec.names);
      const jobId = String(jobCounter++);

      const createdAt = hourStart + Math.floor(rand(0, HOUR_MS - 1));
      const waitTimeMs = Math.round(rand(5, 5000));
      const processingTimeMs = Math.max(50, Math.round(spec.avgDurationMs + rand(-spec.durationVariance, spec.durationVariance)));
      const processedOn = createdAt + waitTimeMs;
      const finishedOn = processedOn + processingTimeMs;

      const failed = Math.random() < spec.failRate;
      const status = failed ? "failed" : "completed";

      const failedReason = failed ? pick(FAILURE_REASONS) : null;
      const errorHash = failed ? nanoid(8) : null;

      jobs.push({
        id: nanoid(),
        instance_id: INSTANCE_ID,
        queue_name: queueName,
        job_id: jobId,
        job_name: jobName,
        status,
        attempts_made: failed ? Math.floor(rand(1, 4)) : 1,
        created_at: createdAt,
        processed_on: processedOn,
        finished_on: finishedOn,
        wait_time_ms: waitTimeMs,
        processing_time_ms: processingTimeMs,
        failed_reason: failedReason,
        error_hash: errorHash,
        stacktrace_preview: failed ? `Error: ${failedReason}\n    at processJob (worker.ts:42:15)` : null,
        updated_at: finishedOn,
      });

      // Active event
      events.push({
        id: nanoid(),
        instance_id: INSTANCE_ID,
        queue_name: queueName,
        job_id: jobId,
        event_type: "active",
        attempts_made: 1,
        worker_id: `worker-${Math.floor(rand(1, 5))}`,
        processed_on: processedOn,
        created_at: processedOn,
      });

      // Completed/failed event
      events.push({
        id: nanoid(),
        instance_id: INSTANCE_ID,
        queue_name: queueName,
        job_id: jobId,
        event_type: status,
        attempts_made: failed ? Math.floor(rand(1, 4)) : 1,
        worker_id: `worker-${Math.floor(rand(1, 5))}`,
        processed_on: processedOn,
        created_at: finishedOn,
      });

      totalJobs++;
      if (failed) totalFailed++;
      else totalCompleted++;
    }

    insertMany(jobs, events);

    if (hourOffset % 24 === 0) {
      const day = Math.floor(hourOffset / 24) + 1;
      process.stdout.write(`\r  Day ${day}/${DAYS}...`);
    }
  }

  console.log(`\n  Done: ${totalJobs.toLocaleString()} jobs (${totalCompleted.toLocaleString()} completed, ${totalFailed.toLocaleString()} failed)`);
}

function main(): void {
  const dbPath = path.resolve(DB_PATH);
  console.log(`Opening database: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Check if tables exist
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get();
  if (!tableCheck) {
    console.error("Error: Database tables not found. Run pulseboard first to create the schema.");
    process.exit(1);
  }

  // Check existing data
  const existingCount = (db.prepare("SELECT COUNT(*) as count FROM jobs WHERE instance_id = ?").get(INSTANCE_ID) as { count: number }).count;
  if (existingCount > 1000) {
    console.log(`Database already has ${existingCount.toLocaleString()} jobs. Skipping seed.`);
    console.log("  To re-seed, delete .pulseboard/dev.db and restart.");
    db.close();
    return;
  }

  generateJobs(db);
  db.close();
}

main();
