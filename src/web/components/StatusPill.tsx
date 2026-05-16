import { cn } from "../lib/cn.js";
import { formatNumber } from "../lib/format.js";

type Tone = "neutral" | "active" | "success" | "warning" | "danger" | "muted";

const dotByTone: Record<Tone, string> = {
  neutral: "bg-fg-subtle",
  active: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-fg-subtle/40",
};

type Props = {
  label: string;
  value: number;
  tone?: Tone;
};

export function StatusPill({ label, value, tone = "neutral" }: Props): React.ReactElement {
  const isZero = value === 0;
  return (
    <span
      className={cn(
        "pb-pill",
        isZero && "opacity-60",
      )}
      title={`${label}: ${value.toLocaleString()}`}
    >
      <span className={cn("pb-dot", dotByTone[tone], isZero && "opacity-50")} />
      <span className="text-fg-muted">{label}</span>
      <span className="tabular-nums text-fg">{formatNumber(value)}</span>
    </span>
  );
}
