import { Key, ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import type { SignatureStatus } from "../lib/api.js";
import { cn } from "../lib/cn.js";

type Props = {
  status: SignatureStatus;
  notes?: string | null;
  size?: "sm" | "md";
};

const STYLES: Record<SignatureStatus, { label: string; icon: typeof ShieldCheck; classes: string }> = {
  valid: { label: "Signature valid", icon: ShieldCheck, classes: "bg-success/15 text-success" },
  invalid: { label: "Signature invalid", icon: ShieldX, classes: "bg-danger/15 text-danger" },
  no_secret: { label: "No secret", icon: Key, classes: "bg-warning/15 text-warning" },
  unverifiable: { label: "Unverifiable", icon: ShieldQuestion, classes: "bg-bg-muted text-fg-muted" },
  not_applicable: { label: "No signature", icon: ShieldAlert, classes: "bg-bg-muted text-fg-subtle" },
};

export function SignatureBadge({ status, notes, size = "md" }: Props): React.ReactElement | null {
  // Hide the "not_applicable" badge in compact (sm) contexts — it's noise on
  // the list rows for sources that simply don't sign.
  if (size === "sm" && status === "not_applicable") return null;

  const cfg = STYLES[status];
  const Icon = cfg.icon;
  const compact = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded font-medium",
        cfg.classes,
        compact ? "px-1 py-0 text-[10px]" : "px-1.5 py-0.5 text-2xs",
      )}
      title={notes ?? cfg.label}
    >
      <Icon className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {!compact && cfg.label}
    </span>
  );
}
