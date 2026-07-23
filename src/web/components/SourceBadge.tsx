import { cn } from "../lib/cn.js";
import { Badge } from "@/components/ui/badge";

// Per-source accent colors. Unknown falls back to neutral.
const SOURCE_STYLES: Record<string, string> = {
  stripe: "bg-[#635bff]/15 text-[#635bff]",
  github: "bg-fg/10 text-fg",
  shopify: "bg-[#95bf47]/15 text-[#7ab55c]",
  twilio: "bg-[#f22f46]/15 text-[#f22f46]",
  slack: "bg-[#4a154b]/15 text-[#cd4b6f]",
  discord: "bg-[#5865f2]/15 text-[#5865f2]",
  linear: "bg-[#5e6ad2]/15 text-[#5e6ad2]",
  polar: "bg-[#0062ff]/15 text-[#3b82f6]",
  clerk: "bg-[#6c47ff]/15 text-[#6c47ff]",
  vercel: "bg-fg/10 text-fg",
  paddle: "bg-[#ffdd00]/15 text-[#d4a900]",
  generic: "bg-bg-muted text-fg-muted",
  unknown: "bg-bg-muted text-fg-muted",
};

export function SourceBadge({ source }: { source: string }): React.ReactElement {
  const style = SOURCE_STYLES[source] ?? SOURCE_STYLES.unknown;
  return (
    <Badge variant="secondary" size="sm" className={cn("capitalize", style)}>
      {source}
    </Badge>
  );
}
