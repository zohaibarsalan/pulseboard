import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, ChevronRight } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { StatusPill, statusTone } from "../components/StatusPill.js";
import { JobDrawer } from "../components/JobDrawer.js";
import { api, type ErrorGroup, type IndexedJob } from "../lib/api.js";
import { formatRelativeTime, formatNumber } from "../lib/format.js";

const INSTANCE_ID = "default";

type View =
  | { kind: "groups" }
  | { kind: "group"; group: ErrorGroup };

export function FailedJobsPage(): React.ReactElement {
  const [view, setView] = useState<View>({ kind: "groups" });
  const [selectedJob, setSelectedJob] = useState<{ queue: string; jobId: string } | null>(null);

  const subtitle =
    view.kind === "group"
      ? `${formatNumber(view.group.count)} failures · hash ${view.group.errorHash.slice(0, 10)}`
      : undefined;

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Failed Jobs" subtitle={subtitle} />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          {view.kind === "groups" && (
            <GroupsList onSelect={(group) => setView({ kind: "group", group })} />
          )}
          {view.kind === "group" && (
            <GroupDetail
              group={view.group}
              onBack={() => setView({ kind: "groups" })}
              onOpenJob={(queue, jobId) => setSelectedJob({ queue, jobId })}
            />
          )}
        </div>
      </div>

      {selectedJob && (
        <JobDrawer
          instanceId={INSTANCE_ID}
          queueName={selectedJob.queue}
          jobId={selectedJob.jobId}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}

function GroupsList({ onSelect }: { onSelect: (group: ErrorGroup) => void }): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["error-groups", INSTANCE_ID],
    queryFn: () => api.errorGroups(INSTANCE_ID),
    refetchInterval: 5_000,
  });

  if (isLoading) return <div className="text-xs text-fg-subtle">Loading…</div>;

  if (data && data.groups.length === 0) {
    return (
      <div className="pb-card flex flex-col items-center gap-2 p-12 text-center">
        <AlertCircle className="h-5 w-5 text-fg-subtle" />
        <h2 className="text-sm font-medium">No failures recorded</h2>
        <p className="max-w-md text-xs text-fg-subtle">
          Failures are grouped by a normalized error hash. They&apos;ll show up here as soon as a job
          fails and the indexer captures the stack.
        </p>
      </div>
    );
  }

  const total = data?.groups.reduce((acc, g) => acc + g.count, 0) ?? 0;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
          {data?.groups.length ?? 0} error group{data?.groups.length === 1 ? "" : "s"}
        </h2>
        <span className="text-2xs text-fg-subtle">
          {formatNumber(total)} total failures · click a row to drill in
        </span>
      </div>

      <div className="pb-card overflow-hidden">
        <table className="pb-table">
          <thead>
            <tr>
              <th>Error</th>
              <th className="hidden md:table-cell">Queue</th>
              <th className="text-right">Count</th>
              <th className="hidden md:table-cell">First seen</th>
              <th className="hidden md:table-cell">Last seen</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {data?.groups.map((group) => (
              <GroupRow key={group.id} group={group} onSelect={() => onSelect(group)} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GroupRow({
  group,
  onSelect,
}: {
  group: ErrorGroup;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <tr className="group cursor-pointer" onClick={onSelect}>
      <td>
        <div className="flex flex-col gap-0.5">
          <span className="line-clamp-1 text-xs font-medium text-fg">
            {group.failedReason ?? "(no reason recorded)"}
          </span>
          <span className="font-mono text-2xs text-fg-subtle">
            {group.jobName ?? "—"} · {group.errorHash.slice(0, 10)}
          </span>
        </div>
      </td>
      <td className="hidden md:table-cell font-mono text-xs text-fg-muted">{group.queueName}</td>
      <td className="text-right">
        <span className="pb-pill pb-pill-danger">{formatNumber(group.count)}</span>
      </td>
      <td className="hidden md:table-cell text-xs text-fg-subtle">{formatRelativeTime(group.firstSeenAt)}</td>
      <td className="hidden md:table-cell text-xs text-fg-subtle">{formatRelativeTime(group.lastSeenAt)}</td>
      <td className="w-6 text-right">
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </td>
    </tr>
  );
}

function GroupDetail({
  group,
  onBack,
  onOpenJob,
}: {
  group: ErrorGroup;
  onBack: () => void;
  onOpenJob: (queue: string, jobId: string) => void;
}): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["error-group-jobs", INSTANCE_ID, group.errorHash],
    queryFn: () => api.errorGroupJobs(INSTANCE_ID, group.errorHash),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-2xs text-fg-subtle hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" />
        All error groups
      </button>

      <div className="pb-card p-4">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">
              {group.failedReason ?? "(no reason recorded)"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
              <span className="font-mono">{group.jobName ?? "—"}</span>
              <span>·</span>
              <span className="font-mono">queue: {group.queueName}</span>
              <span>·</span>
              <span className="font-mono">hash: {group.errorHash}</span>
              <span>·</span>
              <span>first seen {formatRelativeTime(group.firstSeenAt)}</span>
              <span>·</span>
              <span>last seen {formatRelativeTime(group.lastSeenAt)}</span>
            </div>
          </div>
          <span className="pb-pill pb-pill-danger">{formatNumber(group.count)} failures</span>
        </div>
      </div>

      <div className="pb-card overflow-hidden">
        <table className="pb-table">
          <thead>
            <tr>
              <th>Job</th>
              <th className="hidden md:table-cell">Attempts</th>
              <th className="hidden md:table-cell">Duration</th>
              <th>Last seen</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-fg-subtle">
                  Loading…
                </td>
              </tr>
            )}
            {data && data.jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-fg-subtle">
                  No matching jobs in the index. They may have been removed from Redis after failing.
                </td>
              </tr>
            )}
            {data?.jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onSelect={() => onOpenJob(job.queueName, job.jobId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JobRow({ job, onSelect }: { job: IndexedJob; onSelect: () => void }): React.ReactElement {
  const lastEvent = job.finishedOn ?? job.processedOn ?? job.createdAt ?? job.updatedAt;
  return (
    <tr className="group cursor-pointer" onClick={onSelect}>
      <td>
        <div className="flex items-center gap-2.5">
          <StatusPill label={job.status} tone={statusTone(job.status)} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium text-fg">{job.jobName}</span>
            <span className="font-mono text-2xs text-fg-subtle">
              {job.queueName} · #{job.jobId}
            </span>
          </div>
        </div>
      </td>
      <td className="hidden md:table-cell text-xs text-fg-muted tabular-nums">
        {job.attemptsMade ?? 0}
      </td>
      <td className="hidden md:table-cell text-xs text-fg-muted tabular-nums">
        {job.processingTimeMs !== null ? `${job.processingTimeMs}ms` : "—"}
      </td>
      <td className="text-xs text-fg-muted">{formatRelativeTime(lastEvent)}</td>
      <td className="w-6 text-right">
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </td>
    </tr>
  );
}
