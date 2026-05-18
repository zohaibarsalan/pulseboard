import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import type { Activity } from "../lib/api.js";

type Props = {
  data: Activity | undefined;
  bucket: "hour" | "day";
};

export function ThroughputChart({ data, bucket }: Props): React.ReactElement {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const buckets = data?.buckets ?? [];
  const maxValue = useMemo(() => {
    if (buckets.length === 0) return 1;
    return Math.max(...buckets.map((b) => b.completed + b.failed), 1);
  }, [buckets]);

  const chartW = 100;
  const chartH = 40;

  const points = useMemo(() => {
    if (buckets.length === 0) return { completed: "", failed: "", completedArea: "", failedArea: "" };

    const step = chartW / Math.max(buckets.length - 1, 1);

    const completedPoints: string[] = [];
    const failedPoints: string[] = [];

    buckets.forEach((b, i) => {
      const x = i * step;
      const totalY = chartH - (((b.completed + b.failed) / maxValue) * (chartH - 4) + 2);
      const completedY = chartH - ((b.completed / maxValue) * (chartH - 4) + 2);

      failedPoints.push(`${x.toFixed(2)},${totalY.toFixed(2)}`);
      completedPoints.push(`${x.toFixed(2)},${completedY.toFixed(2)}`);
    });

    const completedArea = `M0,${chartH} L${completedPoints.join(" L")} L${chartW},${chartH} Z`;
    const lastBucket = buckets[buckets.length - 1];
    const lastCompletedY = lastBucket ? chartH - ((lastBucket.completed / maxValue) * (chartH - 4) + 2) : chartH;
    const failedArea = `M${completedPoints.join(" L")} L${chartW},${lastCompletedY} L${failedPoints.slice().reverse().join(" L")} Z`;

    return {
      completed: completedPoints.join(" "),
      failed: failedPoints.join(" "),
      completedArea,
      failedArea,
    };
  }, [buckets, maxValue]);

  const hoveredBucket = hoverIdx !== null ? buckets[hoverIdx] : null;

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    if (bucket === "hour") {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxValue / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(Math.round(step * i));
    }
    return ticks;
  }, [maxValue]);

  return (
    <div className="pb-card flex flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-fg-subtle" />
          <h3 className="text-sm font-medium">Job Throughput</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-fg-subtle">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger" />
            <span className="text-fg-subtle">Failed</span>
          </div>
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">No data yet</div>
      ) : (
        <div className="relative">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 flex h-48 flex-col justify-between text-right text-2xs text-fg-subtle">
            {yTicks.slice().reverse().map((tick, i) => (
              <span key={i}>{tick}</span>
            ))}
          </div>

          {/* Chart area */}
          <div className="ml-8">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              preserveAspectRatio="none"
              className="h-48 w-full"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Grid lines */}
              {yTicks.map((_, i) => (
                <line
                  key={i}
                  x1={0}
                  y1={(i / 4) * chartH}
                  x2={chartW}
                  y2={(i / 4) * chartH}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={0.2}
                />
              ))}

              {/* Completed area (green) */}
              <path d={points.completedArea} fill="hsl(var(--success))" fillOpacity={0.3} />
              <polyline
                points={points.completed}
                fill="none"
                stroke="hsl(var(--success))"
                strokeWidth={0.4}
                strokeLinejoin="round"
              />

              {/* Failed area (red, stacked on top) */}
              <path d={points.failedArea} fill="hsl(var(--danger))" fillOpacity={0.3} />
              <polyline
                points={points.failed}
                fill="none"
                stroke="hsl(var(--danger))"
                strokeWidth={0.4}
                strokeLinejoin="round"
              />

              {/* Hover zones */}
              {buckets.map((_, i) => {
                const step = chartW / Math.max(buckets.length - 1, 1);
                const x = i * step - step / 2;
                return (
                  <rect
                    key={i}
                    x={Math.max(0, x)}
                    y={0}
                    width={step}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                );
              })}

              {/* Hover indicator */}
              {hoverIdx !== null && (
                <line
                  x1={(hoverIdx * chartW) / Math.max(buckets.length - 1, 1)}
                  y1={0}
                  x2={(hoverIdx * chartW) / Math.max(buckets.length - 1, 1)}
                  y2={chartH}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  strokeWidth={0.3}
                />
              )}
            </svg>

            {/* X-axis labels */}
            <div className="mt-2 flex justify-between text-2xs text-fg-subtle">
              {buckets.length > 0 && buckets[0] && buckets[buckets.length - 1] && (
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

          {/* Tooltip */}
          {hoveredBucket && hoverIdx !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded border border-border bg-bg px-3 py-2 text-xs shadow-lg"
              style={{
                left: `${Math.min(Math.max(((hoverIdx / (buckets.length - 1)) * 100), 10), 85)}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="font-medium">{formatTime(hoveredBucket.ts)}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-success">{hoveredBucket.completed} completed</span>
                <span className="text-danger">{hoveredBucket.failed} failed</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
