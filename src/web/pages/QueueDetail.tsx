import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, Clock, Hourglass, Pause, Play, TrendingUp, Zap } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { ActivityChart } from "../components/ActivityChart.js";
import { RangeSelector, RANGES, rangeConfig, type Range } from "../components/RangeSelector.js";
import { StatusPill, statusTone } from "../components/StatusPill.js";
import { JobDrawer } from "../components/JobDrawer.js";
import { SearchInput } from "../components/SearchInput.js";
import { SearchResults } from "../components/SearchResults.js";
import { api, type JobEvent, type QueueCounts } from "../lib/api.js";
import { formatRelativeTime, formatDuration, formatNumber } from "../lib/format.js";
import { useLiveEvents, type LiveStatus } from "../lib/useLiveEvents.js";
import { cn } from "../lib/cn.js";

const INSTANCE_ID = "default";
const RANGE_KEY = "pb-queue-detail-range";

function loadRange(): Range {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(RANGE_KEY) : null;
  return stored === "24h" || stored === "7d" || stored === "30d" ? stored : "24h";
}

type Props = {
  queueName: string;
};

export function QueueDetailPage({ queueName }: Props): React.ReactElement {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(loadRange);
  const [search, setSearch] = useState("");
  const cfg = rangeConfig(range);
  const queryClient = useQueryClient();

  const liveStatus = useLiveEvents(INSTANCE_ID, queueName);

  const { data: queues } = useQuery({
    queryKey: ["queues", INSTANCE_ID],
    queryFn: () => api.queues(INSTANCE_ID),
    refetchInterval: liveStatus === "live" ? false : 3_000,
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", INSTANCE_ID, queueName],
    queryFn: () => api.events(INSTANCE_ID, queueName, 200),
    refetchInterval: liveStatus === "live" ? false : 3_000,
  });

  const { data: activity } = useQuery({
    queryKey: ["activity", INSTANCE_ID, queueName, cfg.days, cfg.bucket],
    queryFn: () => api.activity(INSTANCE_ID, cfg.days, queueName, cfg.bucket),
    refetchInterval: liveStatus === "live" ? false : 15_000,
    placeholderData: keepPreviousData,
  });

  const { data: perf } = useQuery({
    queryKey: ["analytics-perf", INSTANCE_ID, cfg.days, queueName],
    queryFn: () => api.analyticsPerformance(INSTANCE_ID, cfg.days, queueName),
    refetchInterval: 30_000,
  });

  // Warm the other ranges so flipping the selector is a cache hit.
  useEffect(() => {
    for (const r of RANGES) {
      void queryClient.prefetchQuery({
        queryKey: ["activity", INSTANCE_ID, queueName, r.days, r.bucket],
        queryFn: () => api.activity(INSTANCE_ID, r.days, queueName, r.bucket),
        staleTime: 15_000,
      });
    }
  }, [queryClient, queueName]);

  const queue = queues?.queues.find((q) => q.name === queueName);
  const searching = search.trim().length > 0;

  const updateRange = (next: Range): void => {
    setRange(next);
    localStorage.setItem(RANGE_KEY, next);
  };

  const pauseMutation = useMutation({
    mutationFn: () => api.pauseQueue(INSTANCE_ID, queueName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queues", INSTANCE_ID] }),
  });
  const resumeMutation = useMutation({
    mutationFn: () => api.resumeQueue(INSTANCE_ID, queueName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queues", INSTANCE_ID] }),
  });

  const togglePause = (): void => {
    if (queue?.isPaused) resumeMutation.mutate();
    else pauseMutation.mutate();
  };

  // Compute metrics from activity data
  const totals = activity?.totals ?? { completed: 0, failed: 0 };
  const total = totals.completed + totals.failed;
  const errorRate = total === 0 ? 0 : (totals.failed / total) * 100;
  const throughputPerHour = total > 0 && activity ? Math.round(total / (cfg.days * 24)) : 0;

  return (
    <div className="flex h-full flex-col">
      <Topbar title={queueName} subtitle={queue?.isPaused ? "Paused" : undefined} />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-1 text-2xs text-fg-subtle hover:text-fg">
              <ArrowLeft className="h-3 w-3" />
              All queues
            </Link>
            <div className="flex items-center gap-2">
              <LiveBadge status={liveStatus} />
              <button
                type="button"
                onClick={togglePause}
                disabled={pauseMutation.isPending || resumeMutation.isPending || !queue}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors",
                  queue?.isPaused
                    ? "text-success hover:bg-bg-muted"
                    : "text-fg-muted hover:bg-bg-muted hover:text-fg",
                  (pauseMutation.isPending || resumeMutation.isPending) && "cursor-wait opacity-50",
                )}
              >
                {queue?.isPaused ? (
                  <>
                    <Play className="h-3 w-3 stroke-[2]" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3 w-3 stroke-[2]" />
                    Pause
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {/* Current state */}
            {queue && <StatCard icon={Zap} label="Active" value={queue.counts.active} tone="info" />}
            {queue && <StatCard icon={Clock} label="Waiting" value={queue.counts.waiting} tone="neutral" />}
            {queue && <StatCard icon={Hourglass} label="Delayed" value={queue.counts.delayed} tone="warning" />}
            {queue && <StatCard icon={AlertTriangle} label="Failed" value={queue.counts.failed} tone="danger" />}

            {/* Performance metrics */}
            <StatCard icon={TrendingUp} label="Throughput" value={`${throughputPerHour}/h`} />
            <StatCard icon={AlertTriangle} label="Error rate" value={`${errorRate.toFixed(1)}%`} tone={errorRate > 5 ? "danger" : undefined} />
            <StatCard icon={Clock} label="Avg time" value={perf?.avgProcessingTimeMs ? formatDuration(perf.avgProcessingTimeMs) : "—"} />
            <StatCard icon={Clock} label="p95 time" value={perf?.p95ProcessingTimeMs ? formatDuration(perf.p95ProcessingTimeMs) : "—"} />
          </div>

          {/* Activity chart */}
          <ActivityChart
            data={activity}
            bucket={cfg.bucket}
            rangeControl={<RangeSelector value={range} onChange={updateRange} />}
          />

          {/* Search */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Search jobs in ${queueName}…`}
            hint='status:, name:, id:, reason:, attempts:>N'
          />

          {/* Events table */}
          {searching ? (
            <SearchResults
              query={search}
              prefix={`queue:${queueName}`}
              onClear={() => setSearch("")}
            />
          ) : (
            <div className="pb-card overflow-hidden">
              <table className="pb-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Job ID</th>
                    <th className="hidden md:table-cell">Status</th>
                    <th className="hidden md:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-fg-subtle">
                        Loading events…
                      </td>
                    </tr>
                  )}
                  {!isLoading && events?.events.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-fg-subtle">
                        No events indexed yet for this queue.
                      </td>
                    </tr>
                  )}
                  {events?.events.map((event) => (
                    <EventRow key={event.id} event={event} onSelect={(id) => setSelectedJobId(id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <JobDrawer
        instanceId={INSTANCE_ID}
        queueName={queueName}
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  value: number | string;
  tone?: "info" | "neutral" | "warning" | "danger";
}): React.ReactElement {
  const colors = {
    info: "text-info",
    neutral: "text-fg-muted",
    warning: "text-warning",
    danger: "text-danger",
  };
  const valueColor = tone ? colors[tone] : "text-fg";

  return (
    <div className="rounded-lg border border-border bg-bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-2xs text-fg-subtle">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", valueColor)}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
    </div>
  );
}

function LiveBadge({ status }: { status: LiveStatus }): React.ReactElement {
  const cfg =
    status === "live"
      ? { label: "Live", dotClass: "bg-success animate-pulse" }
      : status === "error"
        ? { label: "Reconnecting", dotClass: "bg-warning animate-pulse" }
        : { label: "Connecting", dotClass: "bg-fg-subtle" };
  return (
    <span className="pb-pill pb-pill-neutral">
      <span className={cn("pb-dot", cfg.dotClass)} />
      {cfg.label}
    </span>
  );
}

function EventRow({ event, onSelect }: { event: JobEvent; onSelect: (jobId: string) => void }): React.ReactElement {
  return (
    <tr className="cursor-pointer" onClick={() => onSelect(event.jobId)}>
      <td>
        <div className="flex items-center gap-2.5">
          <StatusPill label={event.eventType} tone={statusTone(event.eventType)} />
          <span className="text-2xs text-fg-subtle">{formatRelativeTime(event.createdAt)}</span>
        </div>
      </td>
      <td className="font-mono text-xs text-fg-muted">{event.jobId}</td>
      <td className="hidden md:table-cell text-xs text-fg-muted capitalize">{event.eventType}</td>
      <td className="hidden md:table-cell text-xs text-fg-muted">
        {new Date(event.createdAt).toLocaleTimeString()}
      </td>
    </tr>
  );
}
