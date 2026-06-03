import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";

export type ThroughputBucket = {
  ts: number;
  succeeded: number;
  failed: number;
  pending: number;
};

type Props = {
  buckets: ThroughputBucket[];
  bucketSeconds: number;
  rangeControl?: React.ReactNode;
};

const CHART_W = 100;
const CHART_H = 38;

export function ThroughputChart({ buckets, bucketSeconds, rangeControl }: Props): React.ReactElement {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxValue = useMemo(() => {
    if (buckets.length === 0) return 1;
    return Math.max(...buckets.map((b) => b.succeeded + b.failed + b.pending), 1);
  }, [buckets]);

  const points = useMemo(() => {
    if (buckets.length === 0) return null;
    const step = buckets.length > 1 ? CHART_W / (buckets.length - 1) : CHART_W;

    // Build cumulative top edges for each stack layer (succeeded bottom, then
    // failed, then pending). y=0 is the top, y=CHART_H is the bottom — webhooks
    // grow upward, so we subtract from CHART_H.
    const cumSucceeded: [number, number][] = [];
    const cumFailed: [number, number][] = [];
    const cumPending: [number, number][] = [];

    buckets.forEach((b, i) => {
      const x = buckets.length > 1 ? i * step : CHART_W / 2;
      const s = (b.succeeded / maxValue) * CHART_H;
      const f = ((b.succeeded + b.failed) / maxValue) * CHART_H;
      const p = ((b.succeeded + b.failed + b.pending) / maxValue) * CHART_H;
      cumSucceeded.push([x, CHART_H - s]);
      cumFailed.push([x, CHART_H - f]);
      cumPending.push([x, CHART_H - p]);
    });

    // Build closed-area paths for each band: top edge forward, baseline back.
    const areaFromBaseline = (top: [number, number][]): string => {
      const fwd = top.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L");
      return `M${fwd} L${top[top.length - 1]![0].toFixed(2)},${CHART_H} L${top[0]![0].toFixed(2)},${CHART_H} Z`;
    };
    const areaBetween = (top: [number, number][], bottom: [number, number][]): string => {
      const fwd = top.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L");
      const back = bottom
        .slice()
        .reverse()
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" L");
      return `M${fwd} L${back} Z`;
    };

    return {
      succeededArea: areaFromBaseline(cumSucceeded),
      failedArea: areaBetween(cumFailed, cumSucceeded),
      pendingArea: areaBetween(cumPending, cumFailed),
      succeededLine: cumSucceeded.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
    };
  }, [buckets, maxValue]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(Math.round((maxValue / 4) * i));
    return ticks;
  }, [maxValue]);

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    if (bucketSeconds <= 3600) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const hovered = hoverIdx != null ? buckets[hoverIdx] : null;

  return (
    <div className="pb-card flex flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-fg-subtle" />
          <h3 className="text-sm font-medium">Throughput</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <Legend color="bg-success" label="Succeeded" />
          <Legend color="bg-danger" label="Failed" />
          <Legend color="bg-fg-subtle" label="Pending" />
          {rangeControl}
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">No data yet</div>
      ) : (
        <div className="relative">
          <div className="absolute left-0 top-0 flex h-48 flex-col justify-between text-right text-2xs text-fg-subtle">
            {yTicks
              .slice()
              .reverse()
              .map((t, i) => (
                <span key={i}>{t}</span>
              ))}
          </div>

          <div className="ml-8">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              className="h-48 w-full"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1={0}
                  y1={(i / 4) * CHART_H}
                  x2={CHART_W}
                  y2={(i / 4) * CHART_H}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={0.2}
                />
              ))}

              {points && (
                <>
                  {/* Order matters: paint from bottom of stack up so layers stack correctly */}
                  <path d={points.succeededArea} fill="hsl(var(--success))" fillOpacity={0.45} />
                  <path d={points.failedArea} fill="hsl(var(--danger))" fillOpacity={0.55} />
                  <path d={points.pendingArea} fill="hsl(var(--fg-subtle))" fillOpacity={0.35} />
                  <polyline
                    points={points.succeededLine}
                    fill="none"
                    stroke="hsl(var(--success))"
                    strokeWidth={0.4}
                    strokeLinejoin="round"
                  />
                </>
              )}

              {buckets.map((_, i) => {
                const step = buckets.length > 1 ? CHART_W / (buckets.length - 1) : CHART_W;
                const x = i * step - step / 2;
                return (
                  <rect
                    key={i}
                    x={Math.max(0, x)}
                    y={0}
                    width={step}
                    height={CHART_H}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                );
              })}

              {hoverIdx != null && buckets.length > 1 && (
                <line
                  x1={(hoverIdx * CHART_W) / Math.max(buckets.length - 1, 1)}
                  y1={0}
                  x2={(hoverIdx * CHART_W) / Math.max(buckets.length - 1, 1)}
                  y2={CHART_H}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  strokeWidth={0.3}
                />
              )}
            </svg>

            <div className="mt-2 flex justify-between text-2xs text-fg-subtle">
              {buckets[0] && buckets[buckets.length - 1] && (
                <>
                  <span>{formatTime(buckets[0].ts)}</span>
                  {buckets.length > 4 && buckets[Math.floor(buckets.length / 2)] && (
                    <span>{formatTime(buckets[Math.floor(buckets.length / 2)]!.ts)}</span>
                  )}
                  <span>{formatTime(buckets[buckets.length - 1]!.ts)}</span>
                </>
              )}
            </div>
          </div>

          {hovered && hoverIdx != null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded border border-border bg-bg px-3 py-2 text-xs shadow-lg"
              style={{
                left: `${Math.min(Math.max(((hoverIdx / Math.max(buckets.length - 1, 1)) * 100), 10), 85)}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="font-medium">{formatTime(hovered.ts)}</div>
              <div className="mt-1 space-y-0.5">
                <Row dot="bg-success" label="Succeeded" value={hovered.succeeded} />
                <Row dot="bg-danger" label="Failed" value={hovered.failed} />
                <Row dot="bg-fg-subtle" label="Pending" value={hovered.pending} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ dot, label, value }: { dot: string; label: string; value: number }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-fg-muted">{label}</span>
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }): React.ReactElement {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-fg-subtle">{label}</span>
    </span>
  );
}
