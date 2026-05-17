import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Pause, Play, Search } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { ActivityChart } from "../components/ActivityChart.js";
import { StatusPill, statusTone } from "../components/StatusPill.js";
import { JobDrawer } from "../components/JobDrawer.js";
import { api, type JobEvent } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { useLiveEvents, type LiveStatus } from "../lib/useLiveEvents.js";
import { cn } from "../lib/cn.js";

const INSTANCE_ID = "default";

type Props = {
  queueName: string;
};

export function QueueDetailPage({ queueName }: Props): React.ReactElement {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // SSE — invalidates events/queues/activity queries on each event (debounced).
  // We drop the polling refetchInterval since the live stream handles it.
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

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["activity", INSTANCE_ID, queueName, 7],
    queryFn: () => api.activity(INSTANCE_ID, 7, queueName),
    refetchInterval: liveStatus === "live" ? false : 15_000,
  });

  const queue = queues?.queues.find((q) => q.name === queueName);

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

  return (
    <div className="flex h-full flex-col">
      <Topbar title={queueName} subtitle={queue ? `${totalCount(queue.counts)} jobs across all states` : undefined} />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
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
                    Resume queue
                  </>
                ) : (
                  <>
                    <Pause className="h-3 w-3 stroke-[2]" />
                    Pause queue
                  </>
                )}
              </button>
            </div>
          </div>

          <ActivityChart data={activity} isLoading={activityLoading} />

          <div className="flex items-center justify-between">
            <div className="pb-search w-full max-w-md">
              <Search className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />
              <input
                type="search"
                placeholder={`${events?.events.length ?? 0} recent events…`}
                className="flex-1 bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none"
                disabled
              />
            </div>
            <div className="text-2xs text-fg-subtle">
              Showing latest indexed events. Older history may have been trimmed.
            </div>
          </div>

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

function totalCount(c: { waiting: number; active: number; completed: number; failed: number; delayed: number }): string {
  return (c.waiting + c.active + c.completed + c.failed + c.delayed).toLocaleString();
}
