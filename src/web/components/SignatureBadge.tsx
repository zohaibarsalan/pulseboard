import { Key, ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import type { SignatureStatus } from "../lib/api.js";
import { cn } from "../lib/cn.js";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type Props = {
  status: SignatureStatus;
  notes?: string | null;
  size?: "sm" | "md";
};

const STYLES: Record<SignatureStatus, { label: string; icon: typeof ShieldCheck; variant: BadgeProps["variant"] }> = {
  valid: { label: "Signature valid", icon: ShieldCheck, variant: "success" },
  invalid: { label: "Signature invalid", icon: ShieldX, variant: "error" },
  no_secret: { label: "No secret", icon: Key, variant: "warning" },
  unverifiable: { label: "Unverifiable", icon: ShieldQuestion, variant: "secondary" },
  not_applicable: { label: "No signature", icon: ShieldAlert, variant: "secondary" },
};

export function SignatureBadge({ status, notes, size = "md" }: Props): React.ReactElement | null {
  // Hide the "not_applicable" badge in compact (sm) contexts — it's noise on
  // the list rows for sources that simply don't sign.
  if (size === "sm" && status === "not_applicable") return null;

  const cfg = STYLES[status];
  const Icon = cfg.icon;
  const compact = size === "sm";

  return (
    <Badge
      variant={cfg.variant}
      size="sm"
      className={cn(
        compact && "px-1 text-[10px]",
      )}
      title={notes ?? cfg.label}
    >
      <Icon />
      {!compact && cfg.label}
    </Badge>
  );
}
