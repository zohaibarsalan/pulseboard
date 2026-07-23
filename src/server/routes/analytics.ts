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
      succeeded: number;
      failed: number;
      pending: number;
      avgForwardMs: number | null;
      validSignatures: number;
      verifiableTotal: number;
    } => {
      const range = withTimeRange(filter, start, end);
      const row = ctx.db.$client
        .prepare(
          `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN forward_status >= 200 AND forward_status < 300 THEN 1 ELSE 0 END) AS succeeded,
            SUM(CASE WHEN forward_error IS NOT NULL OR forward_status >= 400 THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN forwarded_to IS NULL THEN 1 ELSE 0 END) AS pending,
            AVG(forward_duration_ms) AS avg_forward_ms,
            SUM(CASE WHEN signature_status = 'valid' THEN 1 ELSE 0 END) AS valid_signatures,
            SUM(CASE WHEN signature_status IN ('valid', 'invalid') THEN 1 ELSE 0 END) AS verifiable_total
          FROM webhooks
          ${range.where}`,
        )
        .get(...range.params) as Record<string, number | null>;
      return {
        total: row.total ?? 0,
        succeeded: row.succeeded ?? 0,
        failed: row.failed ?? 0,
        pending: row.pending ?? 0,
        avgForwardMs: row.avg_forward_ms != null ? Math.round(row.avg_forward_ms) : null,
        validSignatures: row.valid_signatures ?? 0,
        verifiableTotal: row.verifiable_total ?? 0,
      };
    };

    const current = queryPeriod(since, now);
    const previous = queryPeriod(prevSince, since);

    const successRate = current.total > 0 ? (current.succeeded / current.total) * 100 : 0;
    const prevSuccessRate = previous.total > 0 ? (previous.succeeded / previous.total) * 100 : 0;
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
          SUM(CASE WHEN forward_status >= 200 AND forward_status < 300 THEN 1 ELSE 0 END) AS succeeded,
          SUM(CASE WHEN forward_error IS NOT NULL OR forward_status >= 400 THEN 1 ELSE 0 END) AS failed
        FROM webhooks
        ${range.where}
        GROUP BY ${column}
        ORDER BY total DESC
        LIMIT ?`,
      )
      .all(...range.params, limit) as { key: string; total: number; succeeded: number; failed: number }[];

    return {
      rangeDays: days,
      by,
      items: rows.map((r) => ({
        key: r.key,
        total: r.total,
        succeeded: r.succeeded,
        failed: r.failed,
        successRate: r.total > 0 ? (r.succeeded / r.total) * 100 : 0,
      })),
    };
  });
}
