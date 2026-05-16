import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Database,
  GitBranch,
  LayoutGrid,
  Moon,
  Settings,
  Sun,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn.js";
import { api } from "../lib/api.js";

type NavItem = { href: string; label: string; icon: LucideIcon; match?: (loc: string) => boolean };

const items: NavItem[] = [
  { href: "/", label: "Queues", icon: LayoutGrid, match: (l) => l === "/" || l.startsWith("/queue/") },
  { href: "/failed", label: "Failed Jobs", icon: AlertCircle },
  { href: "/flows", label: "Flows", icon: GitBranch },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar(): React.ReactElement {
  const [location] = useLocation();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5_000 });

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-subtle">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-fg text-bg">
          <span className="text-2xs font-bold">P</span>
        </div>
        <span className="text-sm font-medium tracking-tight">Pulseboard</span>
        <span className="ml-1 rounded border border-border px-1 py-0.5 text-2xs font-medium text-fg-subtle">
          {health?.version ?? "0.1"}
        </span>
      </div>

      <div className="px-3 pt-3 pb-1.5 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
        Instance
      </div>
      <div className="mx-3 mb-4 flex items-center justify-between rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm">
        <span className="font-medium">{health?.instanceId ?? "default"}</span>
        <span className={cn("pb-dot", health?.redis === "connected" ? "bg-success" : "bg-danger")} />
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {items.map((item) => {
          const isActive = item.match ? item.match(location) : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg",
                isActive && "bg-bg-muted text-fg",
              )}
            >
              <Icon className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <RedisInfo
          connected={health?.redis === "connected"}
          host={health?.redisHost ?? "—"}
          url={health?.redisUrl ?? ""}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-2xs text-fg-subtle">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function RedisInfo({
  connected,
  host,
  url,
}: {
  connected: boolean;
  host: string;
  url: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="group flex w-full items-start gap-2 rounded-md px-1 py-1 text-left hover:bg-bg-muted/50"
      title={url}
    >
      <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-[1.75] text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">Redis</span>
          <span className={cn("pb-dot", connected ? "bg-success" : "bg-danger")} />
        </div>
        <div className="truncate font-mono text-2xs text-fg-muted">{host}</div>
        {open && url && (
          <div className="mt-1 break-all rounded border border-border bg-bg p-1.5 font-mono text-2xs text-fg-subtle">
            {url}
          </div>
        )}
      </div>
    </button>
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
      className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-3 w-3 stroke-[1.75]" /> : <Moon className="h-3 w-3 stroke-[1.75]" />}
    </button>
  );
}
