import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Search } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { ActivityChart } from "../components/ActivityChart.js";
import { StatusPill, statusTone } from "../components/StatusPill.js";
import { JobDrawer } from "../components/JobDrawer.js";
import { api, type JobEvent } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";

const INSTANCE_ID = "default";

type Props = {
  queueName: string;
};

export function QueueDetailPage({ queueName }: Props): React.ReactElement {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: queues } = useQuery({
    queryKey: ["queues", INSTANCE_ID],
    queryFn: () => api.queues(INSTANCE_ID),
    refetchInterval: 3_000,
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", INSTANCE_ID, queueName],
    queryFn: () => api.events(INSTANCE_ID, queueName, 200),
    refetchInterval: 3_000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["activity", INSTANCE_ID, queueName, 7],
    queryFn: () => api.activity(INSTANCE_ID, 7, queueName),
    refetchInterval: 15_000,
  });

  const queue = queues?.queues.find((q) => q.name === queueName);

  return (
    <div className="flex h-full flex-col">
      <Topbar title={queueName} subtitle={queue ? `${totalCount(queue.counts)} jobs across all states` : undefined} />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex items-center gap-2 text-2xs">
            <Link href="/" className="inline-flex items-center gap-1 text-fg-subtle hover:text-fg">
              <ArrowLeft className="h-3 w-3" />
              All queues
            </Link>
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
