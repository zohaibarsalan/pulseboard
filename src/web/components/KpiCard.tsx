import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../lib/cn.js";
import { Card } from "@/components/ui/card";

type Trend = {
  // "good" tells the card which direction is positive — for "error rate" up is
  // bad, for "throughput" up is good. The arrow's color follows that.
  direction: "up" | "down";
  percent: number;
  good: "up" | "down";
};

type Props = {
  label: string;
  value: string;
  subtext?: string;
  icon?: LucideIcon;
  trend?: Trend | null;
};

export function KpiCard({ label, value, subtext, icon: Icon, trend }: Props): React.ReactElement {
  return (
    <Card className="flex min-h-[100px] flex-col p-4">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums text-fg">{value}</span>
        {trend && <TrendBadge trend={trend} />}
      </div>
      {subtext && <span className="mt-auto pt-2 text-xs text-fg-subtle">{subtext}</span>}
    </Card>
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
      {Math.abs(Math.round(trend.percent))}%
    </span>
  );
}
