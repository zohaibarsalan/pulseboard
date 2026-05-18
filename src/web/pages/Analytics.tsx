import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Clock, Hourglass, TrendingUp } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { KpiCard } from "../components/KpiCard.js";
import { ActivityChart } from "../components/ActivityChart.js";
import { RangeSelector, RANGES, rangeConfig, type Range } from "../components/RangeSelector.js";
import { api, type SlowestJob, type TopFailure } from "../lib/api.js";
import { computeKpis } from "../lib/kpi.js";
import { formatNumber, formatDuration, formatRelative } from "../lib/format.js";

const INSTANCE_ID = "default";
const RANGE_KEY = "pb-analytics-range";

function loadRange(): Range {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(RANGE_KEY) : null;
  return stored === "24h" || stored === "7d" || stored === "30d" ? stored : "7d";
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

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Analytics" subtitle={`Last ${cfg.days === 1 ? "24 hours" : `${cfg.days} days`}`} />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              subtext={`${formatNumber(kpis.failedTotal)} failed of ${formatNumber(kpis.completedTotal + kpis.failedTotal)}`}
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
              label="Avg processing"
              value={perf?.avgProcessingTimeMs != null ? formatDuration(perf.avgProcessingTimeMs) : "—"}
              subtext={perf?.p95ProcessingTimeMs != null ? `p95: ${formatDuration(perf.p95ProcessingTimeMs)}` : undefined}
              icon={Clock}
            />
            <KpiCard
              label="Avg wait time"
              value={perf?.avgWaitTimeMs != null ? formatDuration(perf.avgWaitTimeMs) : "—"}
              subtext="time in queue before processing"
              icon={Hourglass}
            />
          </div>

          <ActivityChart
            data={activity}
            bucket={cfg.bucket}
            rangeControl={<RangeSelector value={range} onChange={updateRange} />}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SlowestJobsTable jobs={slowest?.jobs ?? []} />
            <TopFailuresTable failures={failures?.failures ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SlowestJobsTable({ jobs }: { jobs: SlowestJob[] }): React.ReactElement {
  return (
    <div className="pb-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Slowest Jobs</h3>
        <p className="text-2xs text-fg-subtle">Top 10 by processing time</p>
      </div>
      {jobs.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-fg-subtle">No completed jobs in this period</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-2">Job</th>
                <th className="px-4 py-2">Queue</th>
                <th className="px-4 py-2 text-right">Processing</th>
                <th className="px-4 py-2 text-right">Wait</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr key={`${job.queueName}-${job.jobId}`} className="hover:bg-bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/queue/${encodeURIComponent(job.queueName)}?job=${encodeURIComponent(job.jobId)}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {job.jobName}
                    </Link>
                    <div className="text-2xs text-fg-subtle">{job.jobId}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{job.queueName}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                    {formatDuration(job.processingTimeMs)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-fg-muted">
                    {job.waitTimeMs != null ? formatDuration(job.waitTimeMs) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TopFailuresTable({ failures }: { failures: TopFailure[] }): React.ReactElement {
  return (
    <div className="pb-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Most Failing Jobs</h3>
        <p className="text-2xs text-fg-subtle">Top 10 by failure count</p>
      </div>
      {failures.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-fg-subtle">No failures in this period</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                <th className="px-4 py-2">Job</th>
                <th className="px-4 py-2">Queue</th>
                <th className="px-4 py-2 text-right">Failures</th>
                <th className="px-4 py-2 text-right">Last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {failures.map((f) => (
                <tr key={`${f.queueName}-${f.jobName}`} className="hover:bg-bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/queue/${encodeURIComponent(f.queueName)}?search=${encodeURIComponent(`name:"${f.jobName}" status:failed`)}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {f.jobName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{f.queueName}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium tabular-nums text-danger">
                      {formatNumber(f.failureCount)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-fg-muted">
                    {formatRelative(f.lastFailure)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
