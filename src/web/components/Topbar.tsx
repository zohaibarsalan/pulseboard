import { Search } from "lucide-react";
import { useCommandPalette } from "../lib/useCommandPalette.js";
import { Button } from "./coss-ui/index.js";

type Props = {
  title: string;
  subtitle?: React.ReactNode;
};

export function Topbar({ title, subtitle }: Props): React.ReactElement {
  const { open } = useCommandPalette();

  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-border bg-bg px-4 py-2 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="shrink-0 text-lg font-medium text-balance">{title}</h1>
        {subtitle && (
          typeof subtitle === "string" ? (
            <span className="hidden truncate font-mono text-xs text-fg-subtle sm:inline">{subtitle}</span>
          ) : (
            subtitle
          )
        )}
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <Button
          onClick={open}
          variant="outline"
          className="pb-search w-[280px] cursor-pointer text-left transition-colors hover:bg-bg-muted"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />
          <span className="flex-1 text-sm text-fg-subtle">Go to page or action…</span>
          <span className="flex items-center gap-0.5">
            <span className="pb-kbd">⌘</span>
            <span className="pb-kbd">K</span>
          </span>
        </Button>
      </div>
    </header>
  );
}
