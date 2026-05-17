import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../lib/cn.js";

type Trend = {
  direction: "up" | "down";
  percent: number;
  good: "up" | "down";
};

type Props = {
  label: string;
  value: string;
  subtext?: string;
  icon?: LucideIcon;
  trend?: Trend;
  spark?: number[];
  sparkTone?: "success" | "danger" | "neutral";
};

export function KpiCard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  spark,
  sparkTone = "neutral",
}: Props): React.ReactElement {
  return (
    <div className="pb-card flex min-h-[120px] flex-col p-4">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
        {Icon && <Icon className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums text-fg">
          {value}
        </span>
        {trend && <TrendBadge trend={trend} />}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        {subtext && <span className="text-xs text-fg-subtle">{subtext}</span>}
        {spark && spark.length > 1 && <Sparkline values={spark} tone={sparkTone} />}
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: Trend }): React.ReactElement {
  const isGood = trend.direction === trend.good;
  const Arrow = trend.direction === "up" ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        isGood ? "text-success" : "text-danger",
      )}
    >
      <Arrow className="h-3 w-3 stroke-[2.25]" />
      {Math.round(trend.percent)}%
    </span>
  );
}

function Sparkline({
  values,
  tone,
}: {
  values: number[];
  tone: "success" | "danger" | "neutral";
}): React.ReactElement {
  const w = 72;
  const h = 26;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 2) - 1).toFixed(1)}`)
    .join(" ");

  const stroke =
    tone === "success" ? "hsl(var(--success))" : tone === "danger" ? "hsl(var(--danger))" : "hsl(var(--fg-muted))";

  const areaPath = `M0,${h} L${points.replace(/ /g, " L")} L${w},${h} Z`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={areaPath} fill={stroke} fillOpacity={0.12} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
