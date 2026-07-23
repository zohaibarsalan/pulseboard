import { Search } from "lucide-react";
import { useCommandPalette } from "../lib/useCommandPalette.js";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

type Props = {
  title: string;
  subtitle?: React.ReactNode;
};

export function Topbar({ title, subtitle }: Props): React.ReactElement {
  const { open } = useCommandPalette();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="shrink-0 text-lg font-medium text-balance">{title}</h1>
        {subtitle && (
          typeof subtitle === "string" ? (
            <span className="hidden truncate font-mono text-xs text-fg-subtle xl:inline">{subtitle}</span>
          ) : (
            subtitle
          )
        )}
      </div>
      <div className="hidden items-center gap-2 lg:flex">
        <Button
          onClick={open}
          variant="outline"
          className="w-[280px] justify-start"
          aria-label="Open command palette"
        >
          <Search />
          <span className="flex-1 text-sm text-fg-subtle">Go to page or action…</span>
          <KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
        </Button>
      </div>
    </header>
  );
}
