import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { api, type ErrorGroup } from "../lib/api.js";
import { formatRelativeTime, formatNumber } from "../lib/format.js";

const INSTANCE_ID = "default";

export function FailedJobsPage(): React.ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ["error-groups", INSTANCE_ID],
    queryFn: () => api.errorGroups(INSTANCE_ID),
    refetchInterval: 5_000,
  });

  const total = data?.groups.reduce((acc, g) => acc + g.count, 0) ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Failed Jobs" subtitle={data ? `${formatNumber(total)} failures in ${data.groups.length} groups` : undefined} />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          {isLoading && <div className="text-xs text-fg-subtle">Loading…</div>}

          {data && data.groups.length === 0 && (
            <div className="pb-card flex flex-col items-center gap-2 p-12 text-center">
              <AlertCircle className="h-5 w-5 text-fg-subtle" />
              <h2 className="text-sm font-medium">No failures recorded</h2>
              <p className="max-w-md text-xs text-fg-subtle">
                Failures are grouped by a normalized error hash. They&apos;ll show up here as soon as a job fails and the indexer captures the stack.
              </p>
            </div>
          )}

          {data && data.groups.length > 0 && (
            <div className="pb-card overflow-hidden">
              <table className="pb-table">
                <thead>
                  <tr>
                    <th>Error</th>
                    <th className="hidden md:table-cell">Queue</th>
                    <th className="text-right">Count</th>
                    <th className="hidden md:table-cell">First seen</th>
                    <th className="hidden md:table-cell">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((group) => (
                    <GroupRow key={group.id} group={group} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupRow({ group }: { group: ErrorGroup }): React.ReactElement {
  return (
    <tr>
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
    </tr>
  );
}
