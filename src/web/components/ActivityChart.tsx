import { useMemo, useState, type ReactNode } from "react";
import type { Activity } from "../lib/api.js";

type Props = {
  data: Activity | undefined;
  isLoading?: boolean;
  bucket?: "hour" | "day";
  rangeControl?: ReactNode;
};

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const VIEWBOX_W = 1000;
const VIEWBOX_H = 140;
const PADDING_T = 12;
const PADDING_B = 22;
const PADDING_L = 0;
const PADDING_R = 0;
const PLOT_H = VIEWBOX_H - PADDING_T - PADDING_B;

export function ActivityChart({ data, isLoading, bucket = "day", rangeControl }: Props): React.ReactElement {
  const [hover, setHover] = useState<number | null>(null);

  const { bars, max, labels, tickIndices } = useMemo(() => {
    if (!data || data.buckets.length === 0) {
      return {
        bars: [] as Array<{ ts: number; completed: number; failed: number; total: number }>,
        max: 1,
        labels: [] as string[],
        tickIndices: [] as number[],
      };
    }
    const bars = data.buckets.map((b) => ({ ...b, total: b.completed + b.failed }));
    const max = Math.max(1, ...bars.map((b) => b.total));
    const labels = bars.map((b, i) => formatLabel(b.ts, i === bars.length - 1, bucket));
    const tickIndices = pickTicks(bars.length, bucket);
    return { bars, max, labels, tickIndices };
  }, [data, bucket]);

  const rangeLabel = bucket === "hour" ? "Last 24 hours" : `Last ${data?.rangeDays ?? 7} days`;
  const completedTotal = data?.totals.completed ?? 0;
  const failedTotal = data?.totals.failed ?? 0;
  const totalAll = completedTotal + failedTotal;
  const avgPerBucket = bars.length > 0 ? Math.round(totalAll / bars.length) : 0;
  const peak = max;

  // Geometry
  const barCount = bars.length;
  const innerW = VIEWBOX_W - PADDING_L - PADDING_R;
  const barSlot = barCount > 0 ? innerW / barCount : innerW;
  const barW = Math.max(2, Math.min(barSlot - 2, 24));

  return (
    <div className="pb-card p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-3">
            <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
              Activity
            </span>
            <span className="text-2xs text-fg-subtle">{rangeLabel}</span>
          </div>
          <div className="flex items-center gap-3 text-2xs text-fg-subtle">
            <span>
              <span className="font-medium text-fg">{totalAll.toLocaleString()}</span> events
            </span>
            <span>
              avg <span className="font-medium text-fg-muted">{avgPerBucket.toLocaleString()}</span>/
              {bucket === "hour" ? "h" : "d"}
            </span>
            <span>
              peak <span className="font-medium text-fg-muted">{peak.toLocaleString()}</span>/
              {bucket === "hour" ? "h" : "d"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-2xs">
          <LegendItem color="success" label={`${completedTotal.toLocaleString()} completed`} />
          <LegendItem color="danger" label={`${failedTotal.toLocaleString()} failed`} />
          {rangeControl}
        </div>
      </div>

      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-2xs text-fg-subtle">
            Loading…
          </div>
        )}
        {!isLoading && bars.length === 0 && (
          <div className="flex h-[140px] items-center justify-center text-2xs text-fg-subtle">
            No events in this window yet.
          </div>
        )}

        {bars.length > 0 && (
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            className="block h-[140px] w-full overflow-visible"
            preserveAspectRatio="none"
            onMouseLeave={() => setHover(null)}
          >
            {/* Horizontal grid lines */}
            {[1, 0.5].map((frac) => {
              const y = PADDING_T + PLOT_H * (1 - frac);
              return (
                <line
                  key={frac}
                  x1={PADDING_L}
                  x2={VIEWBOX_W - PADDING_R}
                  y1={y}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeWidth={0.5}
                  strokeDasharray={frac === 1 ? "0" : "2 3"}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {/* Bars */}
            {bars.map((bar, i) => {
              const slotX = PADDING_L + i * barSlot + (barSlot - barW) / 2;
              const baseline = PADDING_T + PLOT_H;
              const failedH = (bar.failed / max) * PLOT_H;
              const completedH = (bar.completed / max) * PLOT_H;
              const totalH = failedH + completedH;
              const minH = bar.total > 0 ? 3 : 0;
              const visibleTotalH = Math.max(totalH, minH);
              // Distribute the visible height proportionally between failed and completed
              const completedShown =
                bar.total > 0 ? (bar.completed / bar.total) * visibleTotalH : 0;
              const failedShown = visibleTotalH - completedShown;

              return (
                <g
                  key={bar.ts}
                  onMouseEnter={() => setHover(i)}
                  className="cursor-default"
                >
                  {/* Hover hit area (full column) */}
                  <rect
                    x={PADDING_L + i * barSlot}
                    y={PADDING_T}
                    width={barSlot}
                    height={PLOT_H}
                    fill="transparent"
                  />
                  {bar.completed > 0 && (
                    <rect
                      x={slotX}
                      y={baseline - completedShown}
                      width={barW}
                      height={completedShown}
                      rx={1}
                      fill="hsl(var(--success))"
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {bar.failed > 0 && (
                    <rect
                      x={slotX}
                      y={baseline - completedShown - failedShown}
                      width={barW}
                      height={failedShown}
                      rx={1}
                      fill="hsl(var(--danger))"
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {/* X-axis tick labels (only at chosen indices) */}
                  {tickIndices.includes(i) && (
                    <text
                      x={slotX + barW / 2}
                      y={VIEWBOX_H - 6}
                      fontSize={10}
                      textAnchor={i === 0 ? "start" : i === bars.length - 1 ? "end" : "middle"}
                      fill="hsl(var(--fg-subtle))"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {labels[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Tooltip — overlay positioned by hover index */}
        {hover !== null && bars[hover] && (
          <TooltipOverlay
            index={hover}
            barCount={bars.length}
            bar={bars[hover]!}
            bucket={bucket}
          />
        )}
      </div>
    </div>
  );
}

function TooltipOverlay({
  index,
  barCount,
  bar,
  bucket,
}: {
  index: number;
  barCount: number;
  bar: { ts: number; completed: number; failed: number; total: number };
  bucket: "hour" | "day";
}): React.ReactElement {
  // Position as % of width so it tracks the bar regardless of viewport
  const xPct = ((index + 0.5) / barCount) * 100;
  const ts = new Date(bar.ts);
  const label =
    bucket === "hour"
      ? `${ts.toLocaleDateString([], { month: "short", day: "numeric" })} · ${ts.getHours().toString().padStart(2, "0")}:00`
      : ts.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div
      className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1.5 text-2xs shadow-md"
      style={{ left: `${xPct}%` }}
    >
      <div className="font-medium text-fg">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-sm bg-success" />
        <span className="text-fg-muted">{bar.completed.toLocaleString()} completed</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-sm bg-danger" />
        <span className="text-fg-muted">{bar.failed.toLocaleString()} failed</span>
      </div>
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

function formatLabel(ts: number, isLast: boolean, bucket: "hour" | "day"): string {
  if (isLast) return "Now";
  const d = new Date(ts);
  if (bucket === "hour") return `${d.getHours().toString().padStart(2, "0")}:00`;
  return DAYS_OF_WEEK[d.getDay()] ?? "";
}

function pickTicks(n: number, bucket: "hour" | "day"): number[] {
  if (n <= 1) return [0];
  if (bucket === "hour") {
    // 24h with 25 buckets — show every 6 hours plus first/last (~5 labels)
    const stride = Math.max(1, Math.round(n / 5));
    const ticks: number[] = [];
    for (let i = 0; i < n; i += stride) ticks.push(i);
    if (ticks[ticks.length - 1] !== n - 1) ticks.push(n - 1);
    return ticks;
  }
  // Day buckets: show ~7 labels for any range
  if (n <= 8) return Array.from({ length: n }, (_, i) => i);
  const stride = Math.max(1, Math.round(n / 6));
  const ticks: number[] = [];
  for (let i = 0; i < n; i += stride) ticks.push(i);
  if (ticks[ticks.length - 1] !== n - 1) ticks.push(n - 1);
  return ticks;
}
