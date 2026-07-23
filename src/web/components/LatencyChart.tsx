import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { formatDuration } from "../lib/format.js";
import { Card } from "@/components/ui/card";

export type LatencyBucket = {
  ts: number;
  avgForwardMs: number | null;
};

type Props = {
  buckets: LatencyBucket[];
  bucketSeconds: number;
};

const CHART_W = 100;
const CHART_H = 38;

export function LatencyChart({ buckets, bucketSeconds }: Props): React.ReactElement {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Only buckets with data participate in scaling. If all are null, we render
  // an empty state below.
  const valuesPresent = buckets.filter((b) => b.avgForwardMs != null);
  const maxValue = useMemo(() => {
    if (valuesPresent.length === 0) return 1;
    return Math.max(...valuesPresent.map((b) => b.avgForwardMs!), 1);
  }, [valuesPresent]);

  const points = useMemo(() => {
    if (buckets.length === 0) return "";
    const step = buckets.length > 1 ? CHART_W / (buckets.length - 1) : CHART_W;
    // For null buckets we collapse to baseline so the line drops to 0 — visually
    // honest about "no traffic" gaps rather than smoothing across them.
    return buckets
      .map((b, i) => {
        const x = buckets.length > 1 ? i * step : CHART_W / 2;
        const v = b.avgForwardMs ?? 0;
        const y = CHART_H - (v / maxValue) * CHART_H;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [buckets, maxValue]);

  const yTicks = useMemo(() => {
    const ticks: string[] = [];
    for (let i = 4; i >= 0; i--) ticks.push(formatDuration(Math.round((maxValue / 4) * i)));
    return ticks;
  }, [maxValue]);

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    if (bucketSeconds <= 3600) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const hovered = hoverIdx != null ? buckets[hoverIdx] : null;

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-fg-subtle" />
        <h3 className="text-sm font-medium">Forwarding latency</h3>
        <span className="ml-1 text-xs text-fg-subtle">avg per bucket</span>
      </div>

      {valuesPresent.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">
          No forwarding data yet
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-0 top-0 flex h-48 flex-col justify-between text-right text-2xs text-fg-subtle">
            {yTicks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>

          <div className="ml-10">
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

              <polyline
                points={points}
                fill="none"
                stroke="var(--info)"
                strokeWidth={0.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

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
              <div className="mt-1">
                {hovered.avgForwardMs != null ? (
                  <span className="font-mono tabular-nums">{formatDuration(hovered.avgForwardMs)}</span>
                ) : (
                  <span className="text-fg-subtle">no data</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
