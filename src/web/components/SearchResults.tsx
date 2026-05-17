import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatusPill, statusTone } from "./StatusPill.js";
import { JobDrawer } from "./JobDrawer.js";
import { api, type IndexedJob, type ParsedQuerySerialized } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { cn } from "../lib/cn.js";

const INSTANCE_ID = "default";

type Props = {
  query: string;
  prefix?: string;
  onClear: () => void;
};

export function SearchResults({ query, prefix = "", onClear }: Props): React.ReactElement {
  const fullQuery = [prefix.trim(), query.trim()].filter(Boolean).join(" ");
  const [selected, setSelected] = useState<{ queue: string; jobId: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", INSTANCE_ID, fullQuery],
    queryFn: () => api.searchJobs(INSTANCE_ID, fullQuery, 200),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-3">
      {data && <FilterChips parsed={data.parsed} onClear={onClear} />}

      <div className="pb-card overflow-hidden">
        <table className="pb-table">
          <thead>
            <tr>
              <th>Job</th>
              <th className="hidden md:table-cell">Queue</th>
              <th className="hidden md:table-cell">Attempts</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-xs text-fg-subtle">
                  Searching…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-xs text-danger">
                  {(error as Error).message}
                </td>
              </tr>
            )}
            {data && data.jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-xs text-fg-subtle">
                  No jobs match this query. Try fewer filters, or check the syntax hint below the input.
                </td>
              </tr>
            )}
            {data?.jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onSelect={() => setSelected({ queue: job.queueName, jobId: job.jobId })}
              />
            ))}
          </tbody>
        </table>
      </div>

      {data && data.jobs.length > 0 && (
        <div className="text-2xs text-fg-subtle">
          Showing {data.jobs.length} match{data.jobs.length === 1 ? "" : "es"}
          {data.nextBefore ? " — more available, refine your query for fewer results" : ""}.
        </div>
      )}

      {selected && (
        <JobDrawer
          instanceId={INSTANCE_ID}
          queueName={selected.queue}
          jobId={selected.jobId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function JobRow({ job, onSelect }: { job: IndexedJob; onSelect: () => void }): React.ReactElement {
  const lastEvent = job.finishedOn ?? job.processedOn ?? job.createdAt ?? job.updatedAt;
  return (
    <tr className="cursor-pointer" onClick={onSelect}>
      <td>
        <div className="flex items-center gap-2.5">
          <StatusPill label={job.status} tone={statusTone(job.status)} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium text-fg">{job.jobName}</span>
            {job.failedReason && (
              <span className="truncate text-2xs text-fg-subtle">{job.failedReason}</span>
            )}
          </div>
        </div>
      </td>
      <td className="hidden md:table-cell">
        <span className="font-mono text-xs text-fg-muted">{job.queueName}</span>
        <span className="ml-2 font-mono text-2xs text-fg-subtle">#{job.jobId}</span>
      </td>
      <td className="hidden md:table-cell text-xs text-fg-muted tabular-nums">
        {job.attemptsMade ?? 0}
      </td>
      <td className="text-xs text-fg-muted">{formatRelativeTime(lastEvent)}</td>
    </tr>
  );
}

function FilterChips({
  parsed,
  onClear,
}: {
  parsed: ParsedQuerySerialized;
  onClear: () => void;
}): React.ReactElement | null {
  const chips: Array<{ label: string; tone: "neutral" | "danger" | "warning" | "info" }> = [];
  if (parsed.status) chips.push({ label: `status: ${parsed.status}`, tone: statusChipTone(parsed.status) });
  if (parsed.queue) chips.push({ label: `queue: ${parsed.queue}`, tone: "neutral" });
  if (parsed.name) chips.push({ label: `name: ${parsed.name}`, tone: "neutral" });
  if (parsed.id) chips.push({ label: `id: ${parsed.id}`, tone: "neutral" });
  if (parsed.reasonContains) chips.push({ label: `reason: ${parsed.reasonContains}`, tone: "danger" });
  if (parsed.errorHashPrefix) chips.push({ label: `hash: ${parsed.errorHashPrefix}`, tone: "danger" });
  if (parsed.attempts)
    chips.push({ label: `attempts ${parsed.attempts.op} ${parsed.attempts.value}`, tone: "warning" });
  for (const t of parsed.freeText) chips.push({ label: `“${t}”`, tone: "neutral" });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium",
            c.tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
            c.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
            c.tone === "info" && "border-info/30 bg-info/10 text-info",
            c.tone === "neutral" && "border-border bg-bg-subtle text-fg-muted",
          )}
        >
          {c.label}
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="text-2xs text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
      >
        clear
      </button>
    </div>
  );
}

function statusChipTone(status: string): "danger" | "warning" | "info" | "neutral" {
  if (status === "failed" || status === "stalled") return "danger";
  if (status === "delayed" || status === "paused") return "warning";
  if (status === "active") return "info";
  return "neutral";
}
