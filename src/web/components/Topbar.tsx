import { useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { cn } from "../lib/cn.js";

type Props = {
  title: string;
  description?: string;
};

export function Topbar({ title, description }: Props): React.ReactElement {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 5_000,
  });

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg px-6">
      <div className="flex flex-col">
        <h1 className="text-sm font-medium tracking-tight">{title}</h1>
        {description && <p className="text-xs text-fg-subtle">{description}</p>}
      </div>
      <div className="flex items-center gap-3 text-2xs">
        <ConnectionBadge status={health?.redis ?? "disconnected"} />
        <span className="text-fg-subtle">
          Last indexed{" "}
          <span className="text-fg-muted">{formatRelativeTime(health?.lastIndexedAt ?? null)}</span>
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}

function ConnectionBadge({ status }: { status: "connected" | "disconnected" }): React.ReactElement {
  const isOk = status === "connected";
  return (
    <span className="pb-pill">
      <span className={cn("pb-dot", isOk ? "bg-success" : "bg-danger")} />
      <span>Redis</span>
      <span className="text-fg">{isOk ? "live" : "down"}</span>
    </span>
  );
}

function ThemeToggle(): React.ReactElement {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggle = (): void => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("pb-theme", next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-3.5 w-3.5 stroke-[1.75]" /> : <Moon className="h-3.5 w-3.5 stroke-[1.75]" />}
    </button>
  );
}
