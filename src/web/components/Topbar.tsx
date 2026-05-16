import { Search } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: Props): React.ReactElement {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-medium tracking-tight">{title}</h1>
        {subtitle && (
          <span className="font-mono text-xs text-fg-subtle">{subtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="pb-search w-[280px]">
          <Search className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />
          <input
            type="search"
            placeholder="Search anything..."
            className="flex-1 bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none"
            disabled
          />
          <span className="flex items-center gap-0.5">
            <span className="pb-kbd">⌘</span>
            <span className="pb-kbd">K</span>
          </span>
        </div>
      </div>
    </header>
  );
}
