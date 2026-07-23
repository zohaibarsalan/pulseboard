import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type CommonQuery = {
  days?: string;
  source?: string;
  status?: "success" | "failed" | "pending";
  signature?: "valid" | "invalid" | "no_secret" | "unverifiable" | "not_applicable";
};

type SummaryQuery = CommonQuery;
type TimeseriesQuery = CommonQuery & { bucket?: "hour" | "day" };
type BreakdownQuery = CommonQuery & { by?: "source" | "event_type" | "path"; limit?: string };
type DiagnosticsQuery = CommonQuery;

const DIAGNOSTIC_REASON_SQL = `CASE
  WHEN signature_status = 'invalid' THEN 'signature_invalid'
  WHEN signature_status = 'no_secret' THEN 'signature_missing'
  WHEN signature_status = 'unverifiable' THEN 'signature_unverifiable'
  WHEN forwarded_to IS NULL THEN 'capture_only'
  WHEN forward_error IS NOT NULL AND (LOWER(forward_error) LIKE '%timed out%' OR LOWER(forward_error) LIKE '%timeout%' OR LOWER(forward_error) LIKE '%abort%') THEN 'timeout'
  WHEN forward_error IS NOT NULL AND (LOWER(forward_error) LIKE '%econnrefused%' OR LOWER(forward_error) LIKE '%connection refused%' OR LOWER(forward_error) LIKE '%fetch failed%') THEN 'connection_refused'
  WHEN forward_error IS NOT NULL AND (LOWER(forward_error) LIKE '%enotfound%' OR LOWER(forward_error) LIKE '%getaddrinfo%' OR LOWER(forward_error) LIKE '%dns%') THEN 'dns_failure'
  WHEN forward_error IS NOT NULL AND (LOWER(forward_error) LIKE '%certificate%' OR LOWER(forward_error) LIKE '%tls%' OR LOWER(forward_error) LIKE '%ssl%') THEN 'tls_failure'
  WHEN forward_error IS NOT NULL THEN 'network_error'
  WHEN forward_status BETWEEN 300 AND 399 THEN 'redirect'
  WHEN forward_status IN (401, 403) THEN 'unauthorized'
  WHEN forward_status = 404 THEN 'route_not_found'
  WHEN forward_status IN (408, 504) THEN 'timeout'
  WHEN forward_status = 429 THEN 'rate_limited'
  WHEN forward_status IN (400, 409, 422) THEN 'invalid_request'
  WHEN forward_status >= 500 THEN 'handler_error'
  WHEN forward_status IS NOT NULL AND (forward_status < 200 OR forward_status >= 300) THEN 'unexpected_status'
  WHEN forward_duration_ms >= 5000 THEN 'slow_handler'
  ELSE NULL
END`;

const STATUS_CLASS_SQL = `CASE
  WHEN forwarded_to IS NULL THEN 'capture_only'
  WHEN forward_error IS NOT NULL THEN 'network_error'
  WHEN forward_status BETWEEN 200 AND 299 THEN '2xx'
  WHEN forward_status BETWEEN 300 AND 399 THEN '3xx'
  WHEN forward_status BETWEEN 400 AND 499 THEN '4xx'
  WHEN forward_status >= 500 THEN '5xx'
  ELSE 'unknown'
END`;

function buildFilter(query: CommonQuery, baseTimeColumn = "received_at"): {
  clause: string;
  params: (string | number)[];
} {
  const params: (string | number)[] = [];
  const clauses: string[] = [];

  if (query.source) {
    clauses.push("source = ?");
    params.push(query.source);
  }
  if (query.status === "success") {
    clauses.push("forward_status >= 200 AND forward_status < 300");
  } else if (query.status === "failed") {
    clauses.push("(forward_error IS NOT NULL OR forward_status >= 400)");
  } else if (query.status === "pending") {
    clauses.push("forwarded_to IS NULL");
  }
  if (query.signature) {
    clauses.push("signature_status = ?");
    params.push(query.signature);
  }

  return {
    clause: clauses.length > 0 ? clauses.join(" AND ") : "",
    params,
  };
}

// Combine a time range with the filter clause.
function withTimeRange(filter: ReturnType<typeof buildFilter>, since: number, until?: number): {
  where: string;
  params: (string | number)[];
} {
  const parts: string[] = [`received_at >= ?`];
  const params: (string | number)[] = [since];
  if (until !== undefined) {
    parts.push(`received_at < ?`);
    params.push(until);
  }
  if (filter.clause) {
    parts.push(filter.clause);
    params.push(...filter.params);
  }
  return { where: `WHERE ${parts.join(" AND ")}`, params };
}

export async function analyticsRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // Summary: totals + trend vs the previous equal-length window.
  app.get<{ Querystring: SummaryQuery }>("/api/analytics/summary", async (req) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const now = Date.now();
    const rangeMs = days * DAY_MS;
    const since = now - rangeMs;
    const prevSince = since - rangeMs;

    const filter = buildFilter(req.query);

    const queryPeriod = (start: number, end: number): {
      total: number;
      forwardedTotal: number;
      succeeded: number;
      failed: number;
      pending: number;
      avgForwardMs: number | null;
      p95ForwardMs: number | null;
      slowDeliveries: number;
      validSignatures: number;
      verifiableTotal: number;
    } => {
      const range = withTimeRange(filter, start, end);
      const row = ctx.db.$client
        .prepare(
          `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN forwarded_to IS NOT NULL THEN 1 ELSE 0 END) AS forwarded_total,
            SUM(CASE WHEN forward_status >= 200 AND forward_status < 300 THEN 1 ELSE 0 END) AS succeeded,
            SUM(CASE WHEN forward_error IS NOT NULL OR (forward_status IS NOT NULL AND (forward_status < 200 OR forward_status >= 300)) THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN forwarded_to IS NULL THEN 1 ELSE 0 END) AS pending,
            AVG(forward_duration_ms) AS avg_forward_ms,
            SUM(CASE WHEN forward_duration_ms >= 5000 THEN 1 ELSE 0 END) AS slow_deliveries,
            SUM(CASE WHEN signature_status = 'valid' THEN 1 ELSE 0 END) AS valid_signatures,
            SUM(CASE WHEN signature_status IN ('valid', 'invalid') THEN 1 ELSE 0 END) AS verifiable_total
          FROM webhooks
          ${range.where}`,
        )
        .get(...range.params) as Record<string, number | null>;
      const durationCount = ctx.db.$client
        .prepare(`SELECT COUNT(*) AS count FROM webhooks ${range.where} AND forward_duration_ms IS NOT NULL`)
        .get(...range.params) as { count: number };
      const p95Offset = Math.max(0, Math.ceil((durationCount.count ?? 0) * 0.95) - 1);
      const p95Row = durationCount.count > 0
        ? ctx.db.$client
            .prepare(`SELECT forward_duration_ms AS value FROM webhooks ${range.where} AND forward_duration_ms IS NOT NULL ORDER BY forward_duration_ms ASC LIMIT 1 OFFSET ?`)
            .get(...range.params, p95Offset) as { value: number } | undefined
        : undefined;
      return {
        total: row.total ?? 0,
        forwardedTotal: row.forwarded_total ?? 0,
        succeeded: row.succeeded ?? 0,
        failed: row.failed ?? 0,
        pending: row.pending ?? 0,
        avgForwardMs: row.avg_forward_ms != null ? Math.round(row.avg_forward_ms) : null,
        p95ForwardMs: p95Row?.value ?? null,
        slowDeliveries: row.slow_deliveries ?? 0,
        validSignatures: row.valid_signatures ?? 0,
        verifiableTotal: row.verifiable_total ?? 0,
      };
    };

    const current = queryPeriod(since, now);
    const previous = queryPeriod(prevSince, since);

    const successRate = current.forwardedTotal > 0 ? (current.succeeded / current.forwardedTotal) * 100 : 0;
    const prevSuccessRate = previous.forwardedTotal > 0
      ? (previous.succeeded / previous.forwardedTotal) * 100
      : 0;
    const sigValidRate =
      current.verifiableTotal > 0 ? (current.validSignatures / current.verifiableTotal) * 100 : 0;
    const prevSigValidRate =
      previous.verifiableTotal > 0 ? (previous.validSignatures / previous.verifiableTotal) * 100 : 0;

    const pctDelta = (cur: number, prev: number): number | null => {
      if (prev === 0 && cur === 0) return null;
      if (prev === 0) return null;
      return ((cur - prev) / prev) * 100;
    };

    return {
      rangeDays: days,
      current,
      previous,
      derived: {
        successRate,
        signatureValidRate: sigValidRate,
        totalTrendPct: pctDelta(current.total, previous.total),
        successRateTrendPct: pctDelta(successRate, prevSuccessRate),
        avgForwardTrendPct:
          current.avgForwardMs != null && previous.avgForwardMs != null
            ? pctDelta(current.avgForwardMs, previous.avgForwardMs)
            : null,
        signatureValidTrendPct: pctDelta(sigValidRate, prevSigValidRate),
      },
    };
  });

  // Timeseries: buckets of throughput by status + avg latency per bucket.
  app.get<{ Querystring: TimeseriesQuery }>("/api/analytics/timeseries", async (req) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = Date.now() - days * DAY_MS;

    const bucketKind: "hour" | "day" = req.query.bucket ?? (days <= 2 ? "hour" : "day");
    const bucketSize = bucketKind === "hour" ? HOUR_MS : DAY_MS;

    const filter = buildFilter(req.query);
    const range = withTimeRange(filter, since);

    // Bucket size is a fixed JS number — inline it as SQL so SQLite does integer
    // division instead of binding it as REAL (which would silently produce float
    // buckets and fragment counts). Same trick as the Pulseboard activity query.
    const rows = ctx.db.$client
      .prepare(
        `SELECT
          (received_at / ${bucketSize}) * ${bucketSize} AS bucket,
          SUM(CASE WHEN forward_status >= 200 AND forward_status < 300 THEN 1 ELSE 0 END) AS succeeded,
          SUM(CASE WHEN forward_error IS NOT NULL OR forward_status >= 400 THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN forwarded_to IS NULL THEN 1 ELSE 0 END) AS pending,
          AVG(forward_duration_ms) AS avg_forward_ms
        FROM webhooks
        ${range.where}
        GROUP BY bucket
        ORDER BY bucket ASC`,
      )
      .all(...range.params) as {
      bucket: number;
      succeeded: number;
      failed: number;
      pending: number;
      avg_forward_ms: number | null;
    }[];

    const byBucket = new Map<number, { succeeded: number; failed: number; pending: number; avgForwardMs: number | null }>();
    const start = Math.floor(since / bucketSize) * bucketSize;
    const end = Math.floor(Date.now() / bucketSize) * bucketSize;
    for (let b = start; b <= end; b += bucketSize) {
      byBucket.set(b, { succeeded: 0, failed: 0, pending: 0, avgForwardMs: null });
    }
    for (const row of rows) {
      byBucket.set(row.bucket, {
        succeeded: row.succeeded ?? 0,
        failed: row.failed ?? 0,
        pending: row.pending ?? 0,
        avgForwardMs: row.avg_forward_ms != null ? Math.round(row.avg_forward_ms) : null,
      });
    }

    return {
      bucketSizeSeconds: bucketSize / 1000,
      rangeDays: days,
      buckets: Array.from(byBucket.entries())
        .map(([ts, v]) => ({ ts, ...v }))
        .sort((a, b) => a.ts - b.ts),
    };
  });

  // Breakdown: top-N by a chosen dimension, with success rate per row.
  app.get<{ Querystring: BreakdownQuery }>("/api/analytics/breakdown", async (req) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = Date.now() - days * DAY_MS;
    const by = req.query.by ?? "source";
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

    // Whitelist the column to avoid SQL injection through the GROUP BY clause.
    const column =
      by === "event_type" ? "event_type" : by === "path" ? "path" : "source";

    const filter = buildFilter(req.query);
    const range = withTimeRange(filter, since);

    const rows = ctx.db.$client
      .prepare(
        `SELECT
          COALESCE(${column}, '(none)') AS key,
          COUNT(*) AS total,
          SUM(CASE WHEN forwarded_to IS NOT NULL THEN 1 ELSE 0 END) AS forwarded_total,
          SUM(CASE WHEN forward_status >= 200 AND forward_status < 300 THEN 1 ELSE 0 END) AS succeeded,
          SUM(CASE WHEN forward_error IS NOT NULL OR (forward_status IS NOT NULL AND (forward_status < 200 OR forward_status >= 300)) THEN 1 ELSE 0 END) AS failed
        FROM webhooks
        ${range.where}
        GROUP BY ${column}
        ORDER BY total DESC
        LIMIT ?`,
      )
      .all(...range.params, limit) as { key: string; total: number; forwarded_total: number; succeeded: number; failed: number }[];

    return {
      rangeDays: days,
      by,
      items: rows.map((r) => ({
        key: r.key,
        total: r.total,
        forwardedTotal: r.forwarded_total,
        succeeded: r.succeeded,
        failed: r.failed,
        successRate: r.forwarded_total > 0 ? (r.succeeded / r.forwarded_total) * 100 : 0,
      })),
    };
  });

  app.get<{ Querystring: DiagnosticsQuery }>("/api/analytics/diagnostics", async (req) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const since = Date.now() - days * DAY_MS;
    const filter = buildFilter(req.query);
    const range = withTimeRange(filter, since);

    const failureReasons = ctx.db.$client
      .prepare(
        `SELECT reason, COUNT(*) AS count
         FROM (
           SELECT ${DIAGNOSTIC_REASON_SQL} AS reason
           FROM webhooks
           ${range.where}
         )
         WHERE reason IS NOT NULL AND reason != 'capture_only'
         GROUP BY reason
         ORDER BY count DESC`,
      )
      .all(...range.params) as Array<{ reason: string; count: number }>;

    const statusClasses = ctx.db.$client
      .prepare(
        `SELECT ${STATUS_CLASS_SQL} AS key, COUNT(*) AS count
         FROM webhooks
         ${range.where}
         GROUP BY key
         ORDER BY count DESC`,
      )
      .all(...range.params) as Array<{ key: string; count: number }>;

    const slowestEndpoints = ctx.db.$client
      .prepare(
        `SELECT
           path,
           COUNT(*) AS total,
           SUM(CASE WHEN forward_error IS NOT NULL OR forward_status >= 400 THEN 1 ELSE 0 END) AS failed,
           AVG(forward_duration_ms) AS avg_forward_ms,
           MAX(forward_duration_ms) AS max_forward_ms
         FROM webhooks
         ${range.where}
           AND forwarded_to IS NOT NULL
           AND forward_duration_ms IS NOT NULL
         GROUP BY path
         ORDER BY avg_forward_ms DESC
         LIMIT 8`,
      )
      .all(...range.params) as Array<{
        path: string;
        total: number;
        failed: number;
        avg_forward_ms: number;
        max_forward_ms: number;
      }>;

    const recentIssues = ctx.db.$client
      .prepare(
        `SELECT id, source, event_type, path, forward_status, forward_error, received_at, reason
         FROM (
           SELECT
             id,
             source,
             event_type,
             path,
             forward_status,
             forward_error,
             received_at,
             ${DIAGNOSTIC_REASON_SQL} AS reason
           FROM webhooks
           ${range.where}
         )
         WHERE reason IS NOT NULL AND reason != 'capture_only'
         ORDER BY received_at DESC
         LIMIT 8`,
      )
      .all(...range.params) as Array<{
        id: string;
        source: string;
        event_type: string | null;
        path: string;
        forward_status: number | null;
        forward_error: string | null;
        received_at: number;
        reason: string;
      }>;

    const attemptClauses = ["w.received_at >= ?"];
    const attemptParams: Array<string | number> = [since];
    if (req.query.source) {
      attemptClauses.push("w.source = ?");
      attemptParams.push(req.query.source);
    }
    if (req.query.status === "success") {
      attemptClauses.push("w.forward_status >= 200 AND w.forward_status < 300");
    } else if (req.query.status === "failed") {
      attemptClauses.push("(w.forward_error IS NOT NULL OR w.forward_status >= 400)");
    } else if (req.query.status === "pending") {
      attemptClauses.push("w.forwarded_to IS NULL");
    }
    if (req.query.signature) {
      attemptClauses.push("w.signature_status = ?");
      attemptParams.push(req.query.signature);
    }
    const attemptWhere = attemptClauses.join(" AND ");
    const lifecycle = ctx.db.$client
      .prepare(
        `WITH target_rollup AS (
          SELECT
            a.webhook_id,
            a.target,
            COUNT(*) AS attempts,
            MAX(CASE WHEN a.attempt_number = 1 AND a.state = 'delivered' THEN 1 ELSE 0 END) AS first_success,
            MAX(CASE WHEN a.attempt_number > 1 AND a.state = 'delivered' THEN 1 ELSE 0 END) AS recovered,
            MAX(CASE WHEN a.state IN ('queued', 'sending') THEN 1 ELSE 0 END) AS active
          FROM delivery_attempts a
          JOIN webhooks w ON w.id = a.webhook_id
          WHERE ${attemptWhere}
          GROUP BY a.webhook_id, a.target
        )
        SELECT
          COUNT(*) AS targets,
          COALESCE(SUM(attempts), 0) AS attempts,
          COALESCE(SUM(first_success), 0) AS first_successes,
          COALESCE(SUM(CASE WHEN attempts > 1 THEN 1 ELSE 0 END), 0) AS retried,
          COALESCE(SUM(recovered), 0) AS recovered,
          COALESCE(SUM(active), 0) AS active,
          COALESCE(AVG(attempts), 0) AS avg_attempts
        FROM target_rollup`,
      )
      .get(...attemptParams) as {
        targets: number;
        attempts: number;
        first_successes: number;
        retried: number;
        recovered: number;
        active: number;
        avg_attempts: number;
      };
    const policy = ctx.db.$client
      .prepare("SELECT max_attempts FROM delivery_policy WHERE id = 1")
      .get() as { max_attempts: number } | undefined;
    const maxAttempts = policy?.max_attempts ?? 3;
    const exhausted = ctx.db.$client
      .prepare(
        `WITH latest AS (
          SELECT a.webhook_id, a.target, MAX(a.attempt_number) AS attempt_number
          FROM delivery_attempts a
          JOIN webhooks w ON w.id = a.webhook_id
          WHERE ${attemptWhere}
          GROUP BY a.webhook_id, a.target
        )
        SELECT COUNT(*) AS count
        FROM latest l
        JOIN delivery_attempts a
          ON a.webhook_id = l.webhook_id
          AND a.target = l.target
          AND a.attempt_number = l.attempt_number
        WHERE a.state = 'failed' AND a.attempt_number >= ?`,
      )
      .get(...attemptParams, maxAttempts) as { count: number };

    const issueTotal = failureReasons.reduce((sum, item) => sum + item.count, 0);
    return {
      rangeDays: days,
      issueTotal,
      failureReasons: failureReasons.map((item) => ({
        reason: item.reason,
        count: item.count,
        percentage: issueTotal > 0 ? (item.count / issueTotal) * 100 : 0,
      })),
      statusClasses,
      slowestEndpoints: slowestEndpoints.map((item) => ({
        path: item.path,
        total: item.total,
        failed: item.failed ?? 0,
        avgForwardMs: Math.round(item.avg_forward_ms),
        maxForwardMs: item.max_forward_ms,
      })),
      recentIssues: recentIssues.map((item) => ({
        id: item.id,
        source: item.source,
        eventType: item.event_type,
        path: item.path,
        forwardStatus: item.forward_status,
        forwardError: item.forward_error,
        receivedAt: item.received_at,
        reason: item.reason,
      })),
      deliveryLifecycle: {
        targets: lifecycle.targets ?? 0,
        attempts: lifecycle.attempts ?? 0,
        firstAttemptSuccessRate:
          lifecycle.targets > 0 ? (lifecycle.first_successes / lifecycle.targets) * 100 : 0,
        retriedTargets: lifecycle.retried ?? 0,
        recoveredTargets: lifecycle.recovered ?? 0,
        exhaustedTargets: exhausted.count ?? 0,
        activeRetries: lifecycle.active ?? 0,
        averageAttempts: lifecycle.avg_attempts ?? 0,
      },
    };
  });
}
