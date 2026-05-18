import { Queue, Worker, type Job, type Processor } from "bullmq";
import { Redis } from "ioredis";
import pc from "picocolors";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6390";
const PRODUCER_INTERVAL_MS = Number(process.env.DEMO_INTERVAL ?? 1500);
const WORKER_CONCURRENCY = Number(process.env.DEMO_CONCURRENCY ?? 3);

type Spec = {
  name: string;
  weight: number;
  duration: () => number;
  fail?: () => Error | null;
  attempts?: number;
  delayedProbability?: number;
  delayRangeMs?: [number, number];
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const chance = (p: number): boolean => Math.random() < p;

const QUEUES: Record<string, Spec[]> = {
  email: [
    { name: "send-welcome", weight: 5, duration: () => rand(100, 300) },
    {
      name: "send-receipt",
      weight: 4,
      duration: () => rand(200, 600),
      attempts: 2,
      fail: () => (chance(0.10) ? new Error("SMTP connection timeout to mail.example.com") : null),
    },
    {
      name: "send-newsletter",
      weight: 2,
      duration: () => rand(1000, 3000),
      fail: () => (chance(0.05) ? new Error("Rate limited by Mailgun") : null),
    },
  ],

  imports: [
    {
      name: "parse-csv",
      weight: 2,
      duration: () => rand(500, 3000),
      attempts: 2,
      fail: () => {
        const r = Math.random();
        if (r < 0.10) return new Error("Invalid CSV: missing required column 'user_id'");
        if (r < 0.18) return new Error("Row 47: column count mismatch");
        return null;
      },
    },
    { name: "index-records", weight: 3, duration: () => rand(200, 700) },
  ],

  invoices: [
    { name: "generate-invoice", weight: 4, duration: () => rand(400, 700) },
    {
      name: "send-invoice-email",
      weight: 3,
      duration: () => rand(200, 600),
      attempts: 3,
      fail: () => {
        const r = Math.random();
        if (r < 0.05) return new Error("Invalid email address: missing @");
        if (r < 0.15) return new Error("SMTP connection refused by smtp.acme.io");
        return null;
      },
    },
    { name: "record-payment", weight: 2, duration: () => rand(100, 200) },
  ],

  webhooks: [
    {
      name: "deliver-webhook",
      weight: 6,
      duration: () => rand(100, 800),
      attempts: 3,
      delayedProbability: 0.10,
      delayRangeMs: [5_000, 30_000],
      fail: () => {
        const r = Math.random();
        if (r < 0.12) return new Error("Webhook endpoint returned 502 Bad Gateway");
        if (r < 0.22) return new Error("Webhook endpoint timeout after 30s");
        if (r < 0.27) return new Error("TLS handshake failed");
        return null;
      },
    },
  ],

  "ai-pipeline": [
    { name: "embed-text", weight: 3, duration: () => rand(1000, 2500) },
    {
      name: "classify-document",
      weight: 2,
      duration: () => rand(3000, 5000),
      fail: () => (chance(0.08) ? new Error("Model inference timeout") : null),
    },
  ],
};

const TOTAL_WEIGHT = Object.values(QUEUES)
  .flat()
  .reduce((acc, s) => acc + s.weight, 0);

function pickJob(): { queue: string; spec: Spec } {
  let pick = Math.random() * TOTAL_WEIGHT;
  for (const [queue, specs] of Object.entries(QUEUES)) {
    for (const spec of specs) {
      pick -= spec.weight;
      if (pick <= 0) return { queue, spec };
    }
  }
  const queues = Object.keys(QUEUES);
  const queue = queues[0]!;
  return { queue, spec: QUEUES[queue]![0]! };
}

function generateData(queue: string, jobName: string): Record<string, unknown> {
  const userId = `user_${Math.floor(Math.random() * 9999)}`;
  const tenant = ["acme", "globex", "soylent", "umbrella"][Math.floor(Math.random() * 4)];
  switch (queue) {
    case "email":
      return { to: `${userId}@example.com`, tenant, template: jobName };
    case "imports":
      return { fileId: `file_${Math.random().toString(36).slice(2, 10)}`, tenant, rows: Math.floor(rand(100, 50_000)) };
    case "invoices":
      return { invoiceId: `inv_${Math.random().toString(36).slice(2, 10)}`, amountCents: Math.floor(rand(1000, 99_000)), tenant };
    case "webhooks":
      return { url: `https://${tenant}.example.com/hooks/${jobName}`, event: "user.updated", attemptId: Math.floor(rand(1, 10)) };
    case "ai-pipeline":
      return { documentId: `doc_${Math.random().toString(36).slice(2, 10)}`, tenant, tokens: Math.floor(rand(500, 8000)) };
    default:
      return {};
  }
}

async function main(): Promise<void> {
  console.log(pc.cyan("Pulseboard demo workload"));
  console.log(pc.dim(`  Redis:       ${REDIS_URL}`));
  console.log(pc.dim(`  Queues:      ${Object.keys(QUEUES).join(", ")}`));
  console.log(pc.dim(`  Interval:    ${PRODUCER_INTERVAL_MS}ms`));
  console.log(pc.dim(`  Concurrency: ${WORKER_CONCURRENCY} per queue`));
  console.log();

  const sharedConn = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  await sharedConn.ping();

  const queues = new Map<string, Queue>();
  for (const name of Object.keys(QUEUES)) {
    queues.set(name, new Queue(name, { connection: sharedConn }));
  }

  const specByKey = new Map<string, Spec>();
  for (const [queue, specs] of Object.entries(QUEUES)) {
    for (const s of specs) specByKey.set(`${queue} ${s.name}`, s);
  }

  const processor: Processor = async (job: Job) => {
    const spec = specByKey.get(`${job.queueName} ${job.name}`);
    if (!spec) throw new Error(`No spec for ${job.queueName} ${job.name}`);
    await sleep(spec.duration());
    const err = spec.fail?.();
    if (err) throw err;
    return { ok: true, processedAt: Date.now() };
  };

  const workers = Object.keys(QUEUES).map(
    (name) =>
      new Worker(name, processor, {
        connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
        concurrency: WORKER_CONCURRENCY,
      }),
  );

  let produced = 0;
  let succeeded = 0;
  let failed = 0;
  let mode: "steady" | "burst" | "incident" = "steady";

  for (const w of workers) {
    w.on("completed", () => {
      succeeded += 1;
    });
    w.on("failed", () => {
      failed += 1;
    });
  }

  function emit(count: number): void {
    for (let i = 0; i < count; i++) {
      const { queue, spec } = pickJob();
      const q = queues.get(queue);
      if (!q) continue;
      const delay =
        spec.delayedProbability && spec.delayRangeMs && chance(spec.delayedProbability)
          ? Math.floor(rand(spec.delayRangeMs[0], spec.delayRangeMs[1]))
          : undefined;
      void q.add(spec.name, generateData(queue, spec.name), {
        attempts: spec.attempts ?? 1,
        backoff: spec.attempts && spec.attempts > 1 ? { type: "exponential", delay: 500 } : undefined,
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86_400, count: 500 },
        ...(delay ? { delay } : {}),
      });
      produced += 1;
    }
  }

  // Steady producer — varies rate with a sine wave (1× to 4×) so traffic
  // breathes instead of being flat.
  const startedAt = Date.now();
  const producer = setInterval(() => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const waveMultiplier = 1.5 + 1.5 * Math.sin(elapsed / 20); // 0–3 range
    const base = 1 + Math.floor(Math.random() * 3);
    const batch = Math.max(1, Math.round(base * waveMultiplier));
    emit(batch);
  }, PRODUCER_INTERVAL_MS);

  // Burst events: every 30–60s drop a spike of 15–40 jobs so backlog/active
  // counts visibly jump in the UI.
  const burstTimer = setInterval(
    () => {
      const spike = 15 + Math.floor(Math.random() * 25);
      mode = "burst";
      emit(spike);
      setTimeout(() => {
        mode = "steady";
      }, 4_000);
    },
    30_000 + Math.floor(Math.random() * 30_000),
  );

  // Long-running "background" jobs so the active count never sits at 0.
  // These take 20–40s each and trickle in every 8s, keeping at least a
  // few active across the ai-pipeline queue.
  const longRunner = setInterval(() => {
    const q = queues.get("ai-pipeline");
    if (!q) return;
    void q.add(
      "classify-document",
      { documentId: `doc_long_${Date.now()}`, tokens: 4000 + Math.floor(Math.random() * 4000) },
      { attempts: 1, removeOnComplete: { age: 3600, count: 1000 } },
    );
  }, 8_000);

  const stats = setInterval(() => {
    const tag =
      mode === "burst" ? pc.yellow(" BURST") : mode === "incident" ? pc.red(" INCIDENT") : "";
    process.stdout.write(
      `\r${pc.dim("produced")} ${pc.cyan(produced.toString().padStart(5))}  ` +
        `${pc.dim("ok")} ${pc.green(succeeded.toString().padStart(5))}  ` +
        `${pc.dim("failed")} ${pc.red(failed.toString().padStart(5))}  ` +
        `${pc.dim("inflight")} ${(produced - succeeded - failed).toString().padStart(4)}` +
        tag.padEnd(12),
    );
  }, 500);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(pc.yellow(`\n[${signal}] shutting down…`));
    clearInterval(producer);
    clearInterval(burstTimer);
    clearInterval(longRunner);
    clearInterval(stats);
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all(Array.from(queues.values()).map((q) => q.close()));
    sharedConn.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(pc.red("demo crashed:"), err);
  process.exit(1);
});
