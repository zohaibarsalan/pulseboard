import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ChevronRight, Clock, Hourglass, Pause, Zap } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { CountPill } from "../components/CountPill.js";
import { SearchInput } from "../components/SearchInput.js";
import { SearchResults } from "../components/SearchResults.js";
import { api, type QueueSummary } from "../lib/api.js";
import { formatNumber } from "../lib/format.js";
import { totalsByQueue } from "../lib/kpi.js";
import { cn } from "../lib/cn.js";

const INSTANCE_ID = "default";

type Filter = "all" | "has-failures" | "has-backlog" | "paused";

export function QueuesPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["queues", INSTANCE_ID],
    queryFn: () => api.queues(INSTANCE_ID),
    refetchInterval: 3_000,
  });

  const totals = totalsByQueue(data?.queues ?? []);
  const searching = search.trim().length > 0;
  const hasIssues = totals.failed > 0;

  const filteredQueues = (data?.queues ?? []).filter((q) => {
    if (filter === "has-failures") return q.counts.failed > 0;
    if (filter === "has-backlog") return q.counts.waiting + q.counts.delayed > 0;
    if (filter === "paused") return q.isPaused;
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Queues" />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Status summary bar */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-6">
              <StatusItem icon={Zap} label="Active" value={totals.active} tone="info" />
              <StatusItem icon={Clock} label="Waiting" value={totals.waiting} tone="neutral" />
              <StatusItem icon={Hourglass} label="Delayed" value={totals.delayed} tone="warning" />
              <StatusItem icon={AlertTriangle} label="Failed" value={totals.failed} tone="danger" />
            </div>
            {hasIssues && (
              <Link href="/failed" className="text-xs text-danger hover:underline">
                View failures →
              </Link>
            )}
          </div>

          {/* Search + Filters */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search jobs…"
                hint='status:, queue:, name:, id:'
              />
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </FilterButton>
              <FilterButton active={filter === "has-failures"} onClick={() => setFilter("has-failures")} tone="danger">
                Has failures
              </FilterButton>
              <FilterButton active={filter === "has-backlog"} onClick={() => setFilter("has-backlog")} tone="warning">
                Has backlog
              </FilterButton>
              <FilterButton active={filter === "paused"} onClick={() => setFilter("paused")} tone="warning">
                Paused
              </FilterButton>
            </div>
          </div>

          {/* Content */}
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
              {data && data.queues.length > 0 && filteredQueues.length === 0 && (
                <div className="pb-card p-8 text-center text-sm text-fg-subtle">
                  No queues match the selected filter
                </div>
              )}
              {filteredQueues.length > 0 && (
                <div className="pb-card overflow-hidden">
                  <ul className="divide-y divide-border">
                    {filteredQueues.map((queue) => (
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

function StatusItem({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  value: number;
  tone: "info" | "neutral" | "warning" | "danger";
}): React.ReactElement {
  const colors = {
    info: "text-info",
    neutral: "text-fg-muted",
    warning: "text-warning",
    danger: "text-danger",
  };

  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${colors[tone]}`} />
      <span className="text-sm">
        <span className={`font-semibold tabular-nums ${value > 0 ? colors[tone] : "text-fg-muted"}`}>
          {formatNumber(value)}
        </span>
        <span className="ml-1 text-fg-subtle">{label}</span>
      </span>
    </div>
  );
}

function QueueRow({ queue }: { queue: QueueSummary }): React.ReactElement {
  const c = queue.counts;
  const hasFailures = c.failed > 0;
  const isHealthy = !hasFailures && !queue.isPaused;

  return (
    <li>
      <Link
        href={`/queue/${encodeURIComponent(queue.name)}`}
        className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-bg-muted/40"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Health indicator dot */}
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              queue.isPaused ? "bg-warning" : hasFailures ? "bg-danger" : "bg-success"
            }`}
          />
          <span className="truncate font-mono text-sm font-medium">{queue.name}</span>
          {queue.isPaused && (
            <span className="pb-pill pb-pill-warning">
              <Pause className="h-2.5 w-2.5 stroke-[2.5]" />
              paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <CountPill label="active" value={c.active} tone="info" />
          <CountPill label="waiting" value={c.waiting} tone="neutral" />
          <CountPill label="delayed" value={c.delayed} tone="warning" />
          <CountPill label="failed" value={c.failed} tone="danger" />
          <ChevronRight className="ml-1.5 h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </li>
  );
}

function SkeletonList(): React.ReactElement {
  return (
    <div className="pb-card overflow-hidden">
      <ul className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 animate-pulse rounded-full bg-bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-bg-muted" />
            </div>
            <div className="h-5 w-48 animate-pulse rounded bg-bg-muted" />
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

function FilterButton({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "danger" | "warning";
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? tone === "danger"
            ? "bg-danger/15 text-danger"
            : tone === "warning"
              ? "bg-warning/15 text-warning"
              : "bg-fg/10 text-fg"
          : "text-fg-muted hover:bg-bg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
