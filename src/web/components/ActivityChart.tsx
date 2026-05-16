import { useMemo } from "react";
import type { Activity } from "../lib/api.js";

type Props = {
  data: Activity | undefined;
  isLoading?: boolean;
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ActivityChart({ data, isLoading }: Props): React.ReactElement {
  const { bars, max, dayLabels } = useMemo(() => {
    if (!data || data.buckets.length === 0) {
      return { bars: [] as Array<{ ts: number; completed: number; failed: number; total: number }>, max: 1, dayLabels: [] as string[] };
    }
    const bars = data.buckets.map((b) => ({ ...b, total: b.completed + b.failed }));
    const max = Math.max(1, ...bars.map((b) => b.total));
    const dayLabels = bars.map((b, i) =>
      i === bars.length - 1 ? "Today" : DAYS_OF_WEEK[new Date(b.ts).getDay()] ?? "",
    );
    return { bars, max, dayLabels };
  }, [data]);

  return (
    <div className="pb-card p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
            Activity
          </span>
          <span className="text-2xs text-fg-subtle">
            Last {data?.rangeDays ?? 7} days
          </span>
        </div>
        <div className="flex items-center gap-3 text-2xs">
          <LegendItem color="success" label={`${data?.totals.completed.toLocaleString() ?? "—"} completed`} />
          <LegendItem color="danger" label={`${data?.totals.failed.toLocaleString() ?? "—"} failed`} />
        </div>
      </div>

      <div className="relative h-24">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-2xs text-fg-subtle">
            Loading…
          </div>
        )}
        {!isLoading && bars.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-2xs text-fg-subtle">
            No events yet — run a worker to populate the timeline.
          </div>
        )}
        {!isLoading && bars.length > 0 && (
          <div className="flex h-full items-end gap-1">
            {bars.map((bar, i) => {
              const completedH = (bar.completed / max) * 100;
              const failedH = (bar.failed / max) * 100;
              return (
                <div key={bar.ts} className="group relative flex flex-1 flex-col items-stretch gap-px">
                  {bar.failed > 0 && (
                    <div
                      className="rounded-sm bg-danger transition-opacity group-hover:opacity-80"
                      style={{ height: `${failedH}%`, minHeight: failedH > 0 ? "2px" : 0 }}
                    />
                  )}
                  {bar.completed > 0 && (
                    <div
                      className="rounded-sm bg-success transition-opacity group-hover:opacity-80"
                      style={{ height: `${completedH}%`, minHeight: completedH > 0 ? "2px" : 0 }}
                    />
                  )}
                  {bar.total === 0 && <div className="h-px w-full bg-border" />}
                  <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1 text-2xs shadow-sm group-hover:block">
                    <div className="font-medium">{new Date(bar.ts).toLocaleDateString()}</div>
                    <div className="text-success">{bar.completed} completed</div>
                    <div className="text-danger">{bar.failed} failed</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {bars.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-2xs text-fg-subtle">
          {dayLabels.map((label, i) => (
            <div key={i} className="flex-1 text-center">
              {(i === 0 || i === Math.floor(dayLabels.length / 2) || i === dayLabels.length - 1) && label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: "success" | "danger"; label: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-subtle">
      <span className={`h-2 w-2 rounded-sm ${color === "success" ? "bg-success" : "bg-danger"}`} />
      {label}
    </span>
  );
}
