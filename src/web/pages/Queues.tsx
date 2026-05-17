import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ChevronRight,
  Hourglass,
  Pause,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { CountPill } from "../components/CountPill.js";
import { KpiCard } from "../components/KpiCard.js";
import { ActivityChart } from "../components/ActivityChart.js";
import { RangeSelector, rangeConfig, type Range } from "../components/RangeSelector.js";
import { SearchInput } from "../components/SearchInput.js";
import { SearchResults } from "../components/SearchResults.js";
import { api, type QueueSummary } from "../lib/api.js";
import { formatNumber } from "../lib/format.js";
import { computeKpis, totalsByQueue } from "../lib/kpi.js";

const INSTANCE_ID = "default";
const RANGE_KEY = "pb-queues-range";

function loadRange(): Range {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(RANGE_KEY) : null;
  return stored === "24h" || stored === "7d" || stored === "30d" ? stored : "7d";
}

export function QueuesPage(): React.ReactElement {
  const [range, setRange] = useState<Range>(loadRange);
  const [search, setSearch] = useState("");
  const cfg = rangeConfig(range);

  const { data, isLoading, error } = useQuery({
    queryKey: ["queues", INSTANCE_ID],
    queryFn: () => api.queues(INSTANCE_ID),
    refetchInterval: 3_000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["activity", INSTANCE_ID, cfg.days, cfg.bucket],
    queryFn: () => api.activity(INSTANCE_ID, cfg.days, undefined, cfg.bucket),
    refetchInterval: 15_000,
  });

  const updateRange = (next: Range): void => {
    setRange(next);
    localStorage.setItem(RANGE_KEY, next);
  };

  const kpis = computeKpis(activity);
  const queueTotals = totalsByQueue(data?.queues ?? []);
  const searching = search.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Queues" />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Throughput"
              value={kpis.throughputPerHour.toLocaleString()}
              subtext={`jobs/hour avg · ${cfg.days === 1 ? "last 24h" : `last ${cfg.days}d`}`}
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
              label="Active"
              value={formatNumber(queueTotals.active)}
              subtext={`${formatNumber(queueTotals.waiting)} waiting across queues`}
              icon={Zap}
            />
            <KpiCard
              label="Backlog"
              value={formatNumber(queueTotals.waiting + queueTotals.delayed)}
              subtext={`${formatNumber(queueTotals.delayed)} delayed`}
              icon={Hourglass}
            />
          </div>

          <ActivityChart
            data={activity}
            isLoading={activityLoading}
            bucket={cfg.bucket}
            rangeControl={<RangeSelector value={range} onChange={updateRange} />}
          />

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search jobs… try status:failed reason:timeout"
            hint='Filters: status:, queue:, name:, id:, reason:, hash:, attempts:>N. Quote for spaces ("rate limit").'
          />

          {searching ? (
            <SearchResults query={search} onClear={() => setSearch("")} />
          ) : (
            <>
              {isLoading && <SkeletonList />}
              {error && (
                <div className="pb-card p-4 text-sm text-danger">
                  Failed to load queues: {(error as Error).message}
                </div>
              )}
              {data && data.queues.length === 0 && <EmptyState />}
              {data && data.queues.length > 0 && (
                <div className="pb-card overflow-hidden">
                  <ul className="divide-y divide-border">
                    {data.queues.map((queue) => (
                      <QueueRow key={queue.name} queue={queue} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueRow({ queue }: { queue: QueueSummary }): React.ReactElement {
  const c = queue.counts;
  const total = c.waiting + c.active + c.completed + c.failed + c.delayed;

  return (
    <li>
      <Link
        href={`/queue/${encodeURIComponent(queue.name)}`}
        className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-bg-muted/40"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="truncate font-mono text-sm font-medium">{queue.name}</span>
          {queue.isPaused && (
            <span className="pb-pill pb-pill-warning">
              <Pause className="h-2.5 w-2.5 stroke-[2.5]" />
              paused
            </span>
          )}
          <span className="text-2xs text-fg-subtle">{formatNumber(total)} total</span>
        </div>
        <div className="flex items-center gap-1">
          <CountPill label="active" value={c.active} tone="info" />
          <CountPill label="waiting" value={c.waiting} tone="neutral" />
          <CountPill label="delayed" value={c.delayed} tone="warning" />
          <CountPill label="failed" value={c.failed} tone="danger" />
          <CountPill label="completed" value={c.completed} tone="success" />
          <ChevronRight className="ml-1 h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </li>
  );
}

function SkeletonList(): React.ReactElement {
  return (
    <div className="pb-card overflow-hidden">
      <ul className="divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3">
            <div className="h-3 w-32 animate-pulse rounded bg-bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="pb-card flex flex-col items-center justify-center gap-2 p-12 text-center">
      <h2 className="text-sm font-medium">No queues registered</h2>
      <p className="max-w-md text-xs text-fg-subtle">
        Start Pulseboard with <code className="font-mono text-fg-muted">--queues name1,name2</code> or{" "}
        <code className="font-mono text-fg-muted">--auto-discover</code> to register queues from your
        Redis instance.
      </p>
    </div>
  );
}
