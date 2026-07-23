import { nanoid } from "nanoid";
import type { ForwardResult } from "../capture/forwarder.js";
import { forwardWebhook } from "../capture/forwarder.js";
import type { Db } from "../db/client.js";
import type { DeliveryAttempt, Webhook } from "../db/schema.js";
import type { AppContext } from "../server/context.js";
import { rowToWebhook } from "../server/serialize.js";

export type DeliveryTrigger = "initial" | "manual" | "automatic";
export type DeliveryAttemptState = "queued" | "sending" | "delivered" | "failed" | "cancelled";

export type RetryPolicy = {
  automaticRetries: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type DeliveryTarget = {
  target: string;
  state: "queued" | "sending" | "delivered" | "failed" | "retrying" | "exhausted" | "cancelled";
  attempts: DeliveryAttempt[];
  nextAttemptAt: number | null;
};

const DEFAULT_POLICY: RetryPolicy = {
  automaticRetries: false,
  maxAttempts: 3,
  baseDelayMs: 5_000,
  maxDelayMs: 300_000,
};

export function getRetryPolicy(db: Db): RetryPolicy {
  const row = db.$client
    .prepare("SELECT automatic_retries, max_attempts, base_delay_ms, max_delay_ms FROM delivery_policy WHERE id = 1")
    .get() as {
      automatic_retries: number;
      max_attempts: number;
      base_delay_ms: number;
      max_delay_ms: number;
    } | undefined;
  if (!row) {
    db.$client
      .prepare(
        `INSERT INTO delivery_policy
          (id, automatic_retries, max_attempts, base_delay_ms, max_delay_ms, updated_at)
         VALUES (1, 0, ?, ?, ?, ?)`,
      )
      .run(DEFAULT_POLICY.maxAttempts, DEFAULT_POLICY.baseDelayMs, DEFAULT_POLICY.maxDelayMs, Date.now());
    return DEFAULT_POLICY;
  }
  return {
    automaticRetries: Boolean(row.automatic_retries),
    maxAttempts: row.max_attempts,
    baseDelayMs: row.base_delay_ms,
    maxDelayMs: row.max_delay_ms,
  };
}

export function updateRetryPolicy(db: Db, policy: RetryPolicy): RetryPolicy {
  db.$client
    .prepare(
      `INSERT INTO delivery_policy
        (id, automatic_retries, max_attempts, base_delay_ms, max_delay_ms, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         automatic_retries = excluded.automatic_retries,
         max_attempts = excluded.max_attempts,
         base_delay_ms = excluded.base_delay_ms,
         max_delay_ms = excluded.max_delay_ms,
         updated_at = excluded.updated_at`,
    )
    .run(
      policy.automaticRetries ? 1 : 0,
      policy.maxAttempts,
      policy.baseDelayMs,
      policy.maxDelayMs,
      Date.now(),
    );
  return getRetryPolicy(db);
}

export function persistInitialAttempts(
  ctx: AppContext,
  webhookId: string,
  results: ForwardResult[],
  completedAt = Date.now(),
  scheduleRetries = true,
): void {
  const insert = ctx.db.$client.prepare(
    `INSERT OR IGNORE INTO delivery_attempts (
      id, webhook_id, target, attempt_number, trigger, state, scheduled_at,
      started_at, completed_at, status_code, duration_ms, error,
      response_headers_json, response_body, response_content_type, response_body_truncated
    ) VALUES (?, ?, ?, 1, 'initial', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const transaction = ctx.db.$client.transaction(() => {
    for (const result of results) {
      const startedAt = Math.max(0, completedAt - result.durationMs);
      insert.run(
        nanoid(),
        webhookId,
        result.target,
        deliverySucceeded(result) ? "delivered" : "failed",
        startedAt,
        startedAt,
        completedAt,
        result.status,
        result.durationMs,
        result.error,
        JSON.stringify(result.responseHeaders),
        result.responseBody,
        result.responseContentType,
        result.responseBodyTruncated ? 1 : 0,
      );
    }
  });
  transaction();

  const policy = getRetryPolicy(ctx.db);
  if (!scheduleRetries || !policy.automaticRetries) return;
  for (const result of results) {
    if (shouldRetryDelivery(result)) {
      scheduleAutomaticAttempt(ctx.db, webhookId, result.target, 2, policy);
    }
  }
}

export function listDeliveryTargets(db: Db, webhookId: string): DeliveryTarget[] {
  const rows = db.$client
    .prepare(
      `SELECT * FROM delivery_attempts
       WHERE webhook_id = ?
       ORDER BY target ASC, attempt_number DESC`,
    )
    .all(webhookId) as Record<string, unknown>[];
  const attempts = rows.map(rowToAttempt);
  const groups = new Map<string, DeliveryAttempt[]>();
  for (const attempt of attempts) {
    const targetAttempts = groups.get(attempt.target) ?? [];
    targetAttempts.push(attempt);
    groups.set(attempt.target, targetAttempts);
  }
  const policy = getRetryPolicy(db);
  return Array.from(groups.entries()).map(([target, targetAttempts]) => {
    const latest = targetAttempts[0]!;
    const latestState = latest.state as DeliveryAttemptState;
    const retryable = attemptIsRetryable(latest);
    const state: DeliveryTarget["state"] =
      latestState === "queued"
        ? latest.trigger === "automatic" ? "retrying" : "queued"
        : latestState === "failed" && retryable && latest.attemptNumber >= policy.maxAttempts
          ? "exhausted"
          : latestState;
    return {
      target,
      state,
      attempts: targetAttempts,
      nextAttemptAt: latestState === "queued" ? latest.scheduledAt : null,
    };
  });
}

export function ensureLegacyDeliveryAttempts(ctx: AppContext, webhookId: string): void {
  const existing = ctx.db.$client
    .prepare("SELECT 1 FROM delivery_attempts WHERE webhook_id = ? LIMIT 1")
    .get(webhookId);
  if (existing) return;
  const row = ctx.db.$client
    .prepare(
      `SELECT received_at, forwarded_to, forward_status, forward_duration_ms, forward_error,
        response_headers_json, response_body, response_content_type, response_body_truncated,
        deliveries_json
       FROM webhooks WHERE id = ?`,
    )
    .get(webhookId) as {
      received_at: number;
      forwarded_to: string | null;
      forward_status: number | null;
      forward_duration_ms: number | null;
      forward_error: string | null;
      response_headers_json: string | null;
      response_body: string | null;
      response_content_type: string | null;
      response_body_truncated: number;
      deliveries_json: string | null;
    } | undefined;
  if (!row || !row.forwarded_to) return;

  let results: ForwardResult[];
  try {
    results = row.deliveries_json
      ? JSON.parse(row.deliveries_json) as ForwardResult[]
      : [{
          target: row.forwarded_to,
          status: row.forward_status,
          durationMs: row.forward_duration_ms ?? 0,
          error: row.forward_error,
          responseHeaders: row.response_headers_json
            ? JSON.parse(row.response_headers_json) as Record<string, string>
            : {},
          responseBody: row.response_body,
          responseContentType: row.response_content_type,
          responseBodyTruncated: Boolean(row.response_body_truncated),
        }];
  } catch {
    return;
  }
  persistInitialAttempts(ctx, webhookId, results, row.received_at, false);
}

export async function retryDeliveryTarget(
  ctx: AppContext,
  webhookId: string,
  target: string,
  trigger: Exclude<DeliveryTrigger, "initial"> = "manual",
): Promise<DeliveryAttempt> {
  const active = ctx.db.$client
    .prepare(
      `SELECT id FROM delivery_attempts
       WHERE webhook_id = ? AND target = ? AND state IN ('queued', 'sending')
       LIMIT 1`,
    )
    .get(webhookId, target) as { id: string } | undefined;
  if (active) throw new DeliveryAttemptConflictError();

  const attemptNumber = nextAttemptNumber(ctx.db, webhookId, target);
  const id = nanoid();
  const now = Date.now();
  ctx.db.$client
    .prepare(
      `INSERT INTO delivery_attempts
        (id, webhook_id, target, attempt_number, trigger, state, scheduled_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
    )
    .run(id, webhookId, target, attemptNumber, trigger, now);
  return executeDeliveryAttempt(ctx, id);
}

export function cancelQueuedAttempt(db: Db, webhookId: string, attemptId: string): boolean {
  return db.$client
    .prepare(
      `UPDATE delivery_attempts
       SET state = 'cancelled', completed_at = ?
       WHERE id = ? AND webhook_id = ? AND state = 'queued'`,
    )
    .run(Date.now(), attemptId, webhookId).changes > 0;
}

export function startDeliveryScheduler(ctx: AppContext): () => void {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const due = ctx.db.$client
        .prepare(
          `SELECT id FROM delivery_attempts
           WHERE state = 'queued' AND scheduled_at <= ?
           ORDER BY scheduled_at ASC
           LIMIT 10`,
        )
        .all(Date.now()) as Array<{ id: string }>;
      for (const item of due) {
        try {
          await executeDeliveryAttempt(ctx, item.id);
        } catch (error) {
          ctx.db.$client
            .prepare(
              `UPDATE delivery_attempts
               SET state = 'failed', completed_at = ?, error = ?
               WHERE id = ? AND state IN ('queued', 'sending')`,
            )
            .run(
              Date.now(),
              error instanceof Error ? error.message : "delivery_attempt_failed",
              item.id,
            );
        }
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

export function retryDelayMs(
  attemptNumber: number,
  policy: Pick<RetryPolicy, "baseDelayMs" | "maxDelayMs">,
  random = Math.random,
): number {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attemptNumber - 2));
  const jitter = 0.8 + random() * 0.4;
  return Math.max(1, Math.round(exponential * jitter));
}

export function shouldRetryDelivery(result: Pick<ForwardResult, "status" | "error">): boolean {
  return result.error != null || result.status === 408 || result.status === 429 || (result.status != null && result.status >= 500);
}

export class DeliveryAttemptConflictError extends Error {
  constructor() {
    super("A delivery attempt is already queued or sending for this target.");
    this.name = "DeliveryAttemptConflictError";
  }
}

async function executeDeliveryAttempt(ctx: AppContext, attemptId: string): Promise<DeliveryAttempt> {
  const claimedAt = Date.now();
  const claimed = ctx.db.$client
    .prepare(
      `UPDATE delivery_attempts
       SET state = 'sending', started_at = ?
       WHERE id = ? AND state = 'queued'`,
    )
    .run(claimedAt, attemptId);
  if (claimed.changes === 0) {
    const existing = getAttempt(ctx.db, attemptId);
    if (!existing) throw new Error("delivery_attempt_not_found");
    return existing;
  }

  const row = ctx.db.$client
    .prepare(
      `SELECT a.*, w.method, w.path, w.query_params, w.headers_json, w.body, w.body_base64
       FROM delivery_attempts a
       JOIN webhooks w ON w.id = a.webhook_id
       WHERE a.id = ?`,
    )
    .get(attemptId) as Record<string, unknown> | undefined;
  if (!row) throw new Error("delivery_attempt_not_found");

  const body = row.body_base64
    ? Buffer.from(row.body_base64 as string, "base64")
    : (row.body as string | null);
  const result = await forwardWebhook({
    forwardTo: row.target as string,
    method: row.method as string,
    path: row.path as string,
    queryParams: (row.query_params as string | null) ?? null,
    headers: JSON.parse(row.headers_json as string) as Record<string, string>,
    body,
    timeoutMs: ctx.config.forwardTimeoutMs,
  });
  const completedAt = Date.now();
  ctx.db.$client
    .prepare(
      `UPDATE delivery_attempts SET
        state = ?, completed_at = ?, status_code = ?, duration_ms = ?, error = ?,
        response_headers_json = ?, response_body = ?, response_content_type = ?,
        response_body_truncated = ?
       WHERE id = ?`,
    )
    .run(
      deliverySucceeded(result) ? "delivered" : "failed",
      completedAt,
      result.status,
      result.durationMs,
      result.error,
      JSON.stringify(result.responseHeaders),
      result.responseBody,
      result.responseContentType,
      result.responseBodyTruncated ? 1 : 0,
      attemptId,
    );

  updateWebhookDeliverySummary(ctx, row.webhook_id as string, result);

  const policy = getRetryPolicy(ctx.db);
  const attemptNumber = row.attempt_number as number;
  if (
    policy.automaticRetries &&
    attemptNumber < policy.maxAttempts &&
    shouldRetryDelivery(result)
  ) {
    scheduleAutomaticAttempt(ctx.db, row.webhook_id as string, row.target as string, attemptNumber + 1, policy);
  }

  const stored = ctx.db.$client
    .prepare("SELECT * FROM webhooks WHERE id = ?")
    .get(row.webhook_id as string) as Record<string, unknown> | undefined;
  if (stored) ctx.bus.publish(rowToWebhook(stored), "updated");
  return getAttempt(ctx.db, attemptId)!;
}

function scheduleAutomaticAttempt(
  db: Db,
  webhookId: string,
  target: string,
  attemptNumber: number,
  policy: RetryPolicy,
): void {
  const scheduledAt = Date.now() + retryDelayMs(attemptNumber, policy);
  db.$client
    .prepare(
      `INSERT OR IGNORE INTO delivery_attempts
        (id, webhook_id, target, attempt_number, trigger, state, scheduled_at)
       VALUES (?, ?, ?, ?, 'automatic', 'queued', ?)`,
    )
    .run(nanoid(), webhookId, target, attemptNumber, scheduledAt);
}

function nextAttemptNumber(db: Db, webhookId: string, target: string): number {
  const row = db.$client
    .prepare(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next
       FROM delivery_attempts WHERE webhook_id = ? AND target = ?`,
    )
    .get(webhookId, target) as { next: number };
  return row.next;
}

function getAttempt(db: Db, attemptId: string): DeliveryAttempt | null {
  const row = db.$client
    .prepare("SELECT * FROM delivery_attempts WHERE id = ?")
    .get(attemptId) as Record<string, unknown> | undefined;
  return row ? rowToAttempt(row) : null;
}

function rowToAttempt(row: Record<string, unknown>): DeliveryAttempt {
  return {
    id: row.id as string,
    webhookId: row.webhook_id as string,
    target: row.target as string,
    attemptNumber: row.attempt_number as number,
    trigger: row.trigger as string,
    state: row.state as string,
    scheduledAt: row.scheduled_at as number,
    startedAt: (row.started_at as number | null) ?? null,
    completedAt: (row.completed_at as number | null) ?? null,
    statusCode: (row.status_code as number | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    error: (row.error as string | null) ?? null,
    responseHeadersJson: (row.response_headers_json as string | null) ?? null,
    responseBody: (row.response_body as string | null) ?? null,
    responseContentType: (row.response_content_type as string | null) ?? null,
    responseBodyTruncated: Boolean(row.response_body_truncated),
  };
}

function deliverySucceeded(result: Pick<ForwardResult, "status" | "error">): boolean {
  return result.error == null && result.status != null && result.status >= 200 && result.status < 300;
}

function attemptIsRetryable(attempt: DeliveryAttempt): boolean {
  return shouldRetryDelivery({ status: attempt.statusCode, error: attempt.error });
}

function updateWebhookDeliverySummary(ctx: AppContext, webhookId: string, result: ForwardResult): void {
  const row = ctx.db.$client
    .prepare("SELECT forwarded_to, deliveries_json FROM webhooks WHERE id = ?")
    .get(webhookId) as { forwarded_to: string | null; deliveries_json: string | null } | undefined;
  if (!row) return;

  let deliveries: ForwardResult[] = [];
  try {
    deliveries = row.deliveries_json ? JSON.parse(row.deliveries_json) as ForwardResult[] : [];
  } catch {
    deliveries = [];
  }
  const index = deliveries.findIndex((delivery) => delivery.target === result.target);
  if (index >= 0) deliveries[index] = result;
  else deliveries.push(result);

  if (row.forwarded_to === result.target) {
    ctx.db.$client
      .prepare(
        `UPDATE webhooks SET
          forward_status = ?, forward_duration_ms = ?, forward_error = ?,
          response_headers_json = ?, response_body = ?, response_content_type = ?,
          response_body_truncated = ?, deliveries_json = ?
         WHERE id = ?`,
      )
      .run(
        result.status,
        result.durationMs,
        result.error,
        JSON.stringify(result.responseHeaders),
        result.responseBody,
        result.responseContentType,
        result.responseBodyTruncated ? 1 : 0,
        JSON.stringify(deliveries),
        webhookId,
      );
  } else {
    ctx.db.$client
      .prepare("UPDATE webhooks SET deliveries_json = ? WHERE id = ?")
      .run(JSON.stringify(deliveries), webhookId);
  }
}
