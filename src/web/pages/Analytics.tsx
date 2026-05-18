import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock, Hourglass, TrendingUp } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { KpiCard } from "../components/KpiCard.js";
import { ThroughputChart } from "../components/ThroughputChart.js";
import { ProcessingTimeChart } from "../components/ProcessingTimeChart.js";
import { RangeSelector, RANGES, rangeConfig, type Range } from "../components/RangeSelector.js";
import { api, type SlowestJob, type TopFailure } from "../lib/api.js";
import { computeKpis } from "../lib/kpi.js";
import { formatNumber, formatDuration } from "../lib/format.js";

const INSTANCE_ID = "default";
const RANGE_KEY = "pb-analytics-range";

function loadRange(): Range {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(RANGE_KEY) : null;
  return stored === "24h" || stored === "7d" || stored === "30d" ? stored : "24h";
}

export function AnalyticsPage(): React.ReactElement {
  const [range, setRange] = useState<Range>(loadRange);
  const cfg = rangeConfig(range);
  const queryClient = useQueryClient();

  const { data: activity } = useQuery({
    queryKey: ["activity", INSTANCE_ID, cfg.days, cfg.bucket],
    queryFn: () => api.activity(INSTANCE_ID, cfg.days, undefined, cfg.bucket),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });

  const { data: perf } = useQuery({
    queryKey: ["analytics-perf", INSTANCE_ID, cfg.days],
    queryFn: () => api.analyticsPerformance(INSTANCE_ID, cfg.days),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: procTime } = useQuery({
    queryKey: ["analytics-proc-time", INSTANCE_ID, cfg.days, cfg.bucket],
    queryFn: () => api.analyticsProcessingTime(INSTANCE_ID, cfg.days, undefined, cfg.bucket),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: slowest } = useQuery({
    queryKey: ["analytics-slowest", INSTANCE_ID, cfg.days],
    queryFn: () => api.analyticsSlowestJobs(INSTANCE_ID, cfg.days),
    refetchInterval: 30_000,
  });

  const { data: failures } = useQuery({
    queryKey: ["analytics-failures", INSTANCE_ID, cfg.days],
    queryFn: () => api.analyticsTopFailures(INSTANCE_ID, cfg.days),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    for (const r of RANGES) {
      void queryClient.prefetchQuery({
        queryKey: ["activity", INSTANCE_ID, r.days, r.bucket],
        queryFn: () => api.activity(INSTANCE_ID, r.days, undefined, r.bucket),
        staleTime: 15_000,
      });
    }
  }, [queryClient]);

  const updateRange = (next: Range): void => {
    setRange(next);
    localStorage.setItem(RANGE_KEY, next);
  };

  const kpis = computeKpis(activity);

  // Compute sparklines for processing time from procTime data
  const procSpark = procTime?.buckets.map((b) => b.avgProcessingMs) ?? [];
  const waitSpark = procTime?.buckets.map((b) => b.avgWaitMs) ?? [];

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Analytics"
        subtitle={<RangeSelector value={range} onChange={updateRange} />}
      />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Throughput"
              value={kpis.throughputPerHour.toLocaleString()}
              subtext="jobs/hour avg"
              icon={TrendingUp}
              spark={kpis.completedSpark}
              sparkTone="success"
              trend={
                kpis.completedTrendPct !== null
                  ? { direction: kpis.completedTrendPct >= 0 ? "up" : "down", percent: Math.abs(kpis.completedTrendPct), good: "up" }
                  : undefined
              }
            />
            <KpiCard
              label="Error rate"
              value={`${kpis.errorRate.toFixed(1)}%`}
              subtext={`${formatNumber(kpis.failedTotal)} failed`}
              icon={AlertTriangle}
              spark={kpis.failedSpark}
              sparkTone="danger"
              trend={
                kpis.failedTrendPct !== null
                  ? { direction: kpis.failedTrendPct >= 0 ? "up" : "down", percent: Math.abs(kpis.failedTrendPct), good: "down" }
                  : undefined
              }
            />
            <KpiCard
              label="Avg duration"
              value={perf?.avgProcessingTimeMs != null ? formatDuration(perf.avgProcessingTimeMs) : "—"}
              subtext="processing time"
              icon={Clock}
              spark={procSpark.length > 1 ? procSpark : undefined}
              sparkTone="neutral"
            />
            <KpiCard
              label="Avg wait time"
              value={perf?.avgWaitTimeMs != null ? formatDuration(perf.avgWaitTimeMs) : "—"}
              subtext="queue delay"
              icon={Hourglass}
              spark={waitSpark.length > 1 ? waitSpark : undefined}
              sparkTone="neutral"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ThroughputChart data={activity} bucket={cfg.bucket} />
            <ProcessingTimeChart data={procTime} />
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <SlowestJobsList jobs={slowest?.jobs ?? []} />
            <TopFailuresList failures={failures?.failures ?? []} days={cfg.days} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SlowestJobsList({ jobs }: { jobs: SlowestJob[] }): React.ReactElement {
  return (
    <div className="pb-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Clock className="h-4 w-4 text-fg-subtle" />
        <h3 className="text-sm font-medium">Slowest Jobs</h3>
      </div>
      {jobs.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-fg-subtle">No completed jobs in this period</div>
      ) : (
        <ul className="divide-y divide-border">
          {jobs.map((job, i) => (
            <li key={`${job.queueName}-${job.jobId}`} className="flex items-center gap-4 px-4 py-3 hover:bg-bg-muted/40">
              <span className="w-5 text-center text-sm font-medium text-fg-subtle">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/queue/${encodeURIComponent(job.queueName)}?job=${encodeURIComponent(job.jobId)}`}
                  className="block truncate font-medium hover:underline"
                >
                  {job.jobName}
                </Link>
                <span className="text-xs text-fg-subtle">{job.queueName}</span>
              </div>
              <span className="rounded bg-bg-muted px-2 py-1 font-mono text-xs tabular-nums">
                {formatDuration(job.processingTimeMs)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopFailuresList({ failures, days }: { failures: TopFailure[]; days: number }): React.ReactElement {
  // We need total jobs per job type to compute failure rate - for now, show raw counts
  // and note this as a TODO for a proper failure rate calculation
  return (
    <div className="pb-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-fg-subtle" />
        <h3 className="text-sm font-medium">Most Failing Job Types</h3>
      </div>
      {failures.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-fg-subtle">No failures in this period</div>
      ) : (
        <ul className="divide-y divide-border">
          {failures.map((f, i) => (
            <li key={`${f.queueName}-${f.jobName}`} className="flex items-center gap-4 px-4 py-3 hover:bg-bg-muted/40">
              <span className="w-5 text-center text-sm font-medium text-fg-subtle">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/queue/${encodeURIComponent(f.queueName)}?search=${encodeURIComponent(`name:"${f.jobName}" status:failed`)}`}
                  className="block truncate font-medium hover:underline"
                >
                  {f.jobName}
                </Link>
                <span className="text-xs text-fg-subtle">{f.queueName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg-muted tabular-nums">{formatNumber(f.failureCount)}</span>
                <span className="rounded bg-danger/15 px-2 py-0.5 text-xs font-medium tabular-nums text-danger">
                  failed
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
