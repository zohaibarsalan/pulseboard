import { Search } from "lucide-react";
import { useCommandPalette } from "../lib/useCommandPalette.js";

type Props = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: Props): React.ReactElement {
  const { open } = useCommandPalette();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-medium tracking-tight">{title}</h1>
        {subtitle && (
          <span className="font-mono text-xs text-fg-subtle">{subtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={open}
          className="pb-search w-[280px] cursor-pointer text-left transition-colors hover:bg-bg-muted"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />
          <span className="flex-1 text-sm text-fg-subtle">Search anything…</span>
          <span className="flex items-center gap-0.5">
            <span className="pb-kbd">⌘</span>
            <span className="pb-kbd">K</span>
          </span>
        </button>
      </div>
    </header>
  );
}
