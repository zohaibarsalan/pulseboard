import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, Pause } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { StatusPill } from "../components/StatusPill.js";
import { api, type QueueSummary } from "../lib/api.js";
import { formatNumber } from "../lib/format.js";

const INSTANCE_ID = "default";

export function QueuesPage(): React.ReactElement {
  const { data, isLoading, error } = useQuery({
    queryKey: ["queues", INSTANCE_ID],
    queryFn: () => api.queues(INSTANCE_ID),
    refetchInterval: 3_000,
  });

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Queues" description="All BullMQ queues registered with this Pulseboard instance." />

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && <SkeletonList />}
        {error && (
          <div className="pb-card p-4 text-sm text-danger">
            Failed to load queues: {(error as Error).message}
          </div>
        )}
        {data && data.queues.length === 0 && <EmptyState />}
        {data && data.queues.length > 0 && (
          <div className="pb-card overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] items-center border-b border-border bg-bg px-4 py-2 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
              <span>Queue</span>
              <span>Status</span>
            </div>
            <ul className="divide-y divide-border">
              {data.queues.map((queue) => (
                <QueueRow key={queue.name} queue={queue} />
              ))}
            </ul>
          </div>
        )}
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
        className="group grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-bg-muted/60"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-sm font-medium">{queue.name}</span>
          {queue.isPaused && (
            <span className="pb-pill !text-warning">
              <Pause className="h-2.5 w-2.5 stroke-[2.5]" />
              paused
            </span>
          )}
          <span className="text-2xs text-fg-subtle">{formatNumber(total)} total</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusPill label="active" value={c.active} tone="active" />
          <StatusPill label="waiting" value={c.waiting} tone="neutral" />
          <StatusPill label="delayed" value={c.delayed} tone="muted" />
          <StatusPill label="failed" value={c.failed} tone="danger" />
          <StatusPill label="completed" value={c.completed} tone="success" />
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
