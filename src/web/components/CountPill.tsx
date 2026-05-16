import { cn } from "../lib/cn.js";
import { formatNumber } from "../lib/format.js";
import type { StatusTone } from "./StatusPill.js";

const dotByTone: Record<StatusTone, string> = {
  neutral: "bg-fg-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

type Props = {
  label: string;
  value: number;
  tone?: StatusTone;
};

export function CountPill({ label, value, tone = "neutral" }: Props): React.ReactElement {
  const isZero = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-subtle/60 px-1.5 py-0.5 text-2xs font-medium",
        isZero && "opacity-55",
      )}
      title={`${label}: ${value.toLocaleString()}`}
    >
      <span className={cn("pb-dot", dotByTone[tone], isZero && "opacity-50")} />
      <span className="text-fg-subtle">{label}</span>
      <span className="text-fg">{formatNumber(value)}</span>
    </span>
  );
}
