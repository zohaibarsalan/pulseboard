import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type { ProcessingTimeData } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";

type Props = {
  data: ProcessingTimeData | undefined;
};

export function ProcessingTimeChart({ data }: Props): React.ReactElement {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const buckets = data?.buckets ?? [];

  const maxValue = useMemo(() => {
    if (buckets.length === 0) return 1;
    return Math.max(...buckets.map((b) => b.avgProcessingMs + b.avgWaitMs), 1);
  }, [buckets]);

  const chartH = 40;
  const barGap = 0.5;

  const hoveredBucket = hoverIdx !== null ? buckets[hoverIdx] : null;

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    const bucket = data?.bucketSizeSeconds ?? 3600;
    if (bucket <= 3600) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const yTicks = useMemo(() => {
    const ticks: string[] = [];
    const step = maxValue / 4;
    for (let i = 4; i >= 0; i--) {
      ticks.push(formatDuration(Math.round(step * i)));
    }
    return ticks;
  }, [maxValue]);

  return (
    <div className="pb-card flex flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-fg-subtle" />
          <h3 className="text-sm font-medium">Processing Time</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-info" />
            <span className="text-fg-subtle">Duration</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" />
            <span className="text-fg-subtle">Wait Time</span>
          </div>
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">No data yet</div>
      ) : (
        <div className="relative">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 flex h-48 flex-col justify-between text-right text-2xs text-fg-subtle">
            {yTicks.map((tick, i) => (
              <span key={i}>{tick}</span>
            ))}
          </div>

          {/* Chart area */}
          <div className="ml-10">
            <svg
              viewBox={`0 0 100 ${chartH}`}
              preserveAspectRatio="none"
              className="h-48 w-full"
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1={0}
                  y1={(i / 4) * chartH}
                  x2={100}
                  y2={(i / 4) * chartH}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={0.2}
                />
              ))}

              {/* Bars */}
              {buckets.map((bucket, i) => {
                const barWidth = (100 - barGap * (buckets.length - 1)) / buckets.length;
                const x = i * (barWidth + barGap);
                const waitH = (bucket.avgWaitMs / maxValue) * chartH;
                const procH = (bucket.avgProcessingMs / maxValue) * chartH;
                const totalH = waitH + procH;

                return (
                  <g key={i} onMouseEnter={() => setHoverIdx(i)}>
                    {/* Wait time (yellow, bottom) */}
                    <rect
                      x={x}
                      y={chartH - waitH}
                      width={barWidth}
                      height={waitH}
                      fill="hsl(var(--warning))"
                      fillOpacity={hoverIdx === i ? 1 : 0.7}
                    />
                    {/* Processing time (blue, stacked on top) */}
                    <rect
                      x={x}
                      y={chartH - totalH}
                      width={barWidth}
                      height={procH}
                      fill="hsl(var(--info))"
                      fillOpacity={hoverIdx === i ? 1 : 0.7}
                    />
                    {/* Hover zone */}
                    <rect x={x} y={0} width={barWidth} height={chartH} fill="transparent" />
                  </g>
                );
              })}
            </svg>

            {/* X-axis labels */}
            <div className="mt-2 flex justify-between text-2xs text-fg-subtle">
              {buckets.length > 0 && buckets[0] && buckets[buckets.length - 1] && (
                <>
                  <span>{formatTime(buckets[0].ts)}</span>
                  {buckets.length > 6 && buckets[Math.floor(buckets.length / 2)] && (
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
                left: `${Math.min(Math.max(((hoverIdx / (buckets.length - 1)) * 100), 15), 85)}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="font-medium">{formatTime(hoveredBucket.ts)}</div>
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-info" />
                  <span>Processing: {formatDuration(hoveredBucket.avgProcessingMs)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <span>Wait: {formatDuration(hoveredBucket.avgWaitMs)}</span>
                </div>
                <div className="text-fg-subtle">{hoveredBucket.jobCount} jobs</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
