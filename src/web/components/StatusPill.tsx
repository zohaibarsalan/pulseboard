import { cn } from "../lib/cn.js";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const pillByTone: Record<StatusTone, string> = {
  neutral: "pb-pill-neutral",
  success: "pb-pill-success",
  warning: "pb-pill-warning",
  danger: "pb-pill-danger",
  info: "pb-pill-info",
};

const dotByTone: Record<StatusTone, string> = {
  neutral: "bg-fg-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

type Props = {
  label: string;
  tone?: StatusTone;
  withDot?: boolean;
};

export function StatusPill({ label, tone = "neutral", withDot = true }: Props): React.ReactElement {
  return (
    <span className={cn("pb-pill", pillByTone[tone])}>
      {withDot && <span className={cn("pb-dot", dotByTone[tone])} />}
      <span className="capitalize">{label}</span>
    </span>
  );
}

const toneByStatus: Record<string, StatusTone> = {
  active: "info",
  waiting: "neutral",
  delayed: "warning",
  paused: "warning",
  completed: "success",
  failed: "danger",
  stalled: "danger",
  "waiting-children": "neutral",
};

export function statusTone(status: string): StatusTone {
  return toneByStatus[status] ?? "neutral";
}
