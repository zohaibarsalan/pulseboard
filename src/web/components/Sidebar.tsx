import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Moon, Send, Settings, Sun, Webhook, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn.js";
import { api } from "../lib/api.js";
import { Button } from "./coss-ui/index.js";

type NavItem = { href: string; label: string; icon: LucideIcon; match?: (loc: string) => boolean };

const items: NavItem[] = [
  { href: "/", label: "Webhooks", icon: Webhook, match: (l) => l === "/" },
  { href: "/compose", label: "Compose", icon: Send },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar(): React.ReactElement {
  const [location] = useLocation();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5_000 });

  return (
    <>
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-bg-subtle md:flex">
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-fg text-bg">
          <Webhook className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold tracking-tight">Pulseboard</span>
        <span className="ml-auto rounded border border-border px-1 font-mono text-[10px] leading-4 text-fg-subtle">
          {health?.version ?? "0.1"}
        </span>
      </div>

      <nav className="flex-1 space-y-px px-2 pt-2">
        {items.map((item) => {
          const isActive = item.match ? item.match(location) : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg",
                isActive && "bg-bg-muted text-fg",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.75]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2.5">
        <ForwardInfo forwardTo={health?.forwardTo ?? null} />
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] items-start justify-around border-t border-border bg-bg px-2 pt-1.5 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Primary navigation">
      {items.map((item) => {
        const isActive = item.match ? item.match(location) : location.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-w-16 flex-col items-center gap-1 rounded-md px-2 py-1 text-[10px] text-fg-muted",
              isActive && "bg-bg-muted text-fg",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
    </>
  );
}

function ForwardInfo({ forwardTo }: { forwardTo: string | null }): React.ReactElement {
  return (
    <div className="flex items-start gap-1.5 rounded-md px-1 py-1">
      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 stroke-[1.75] text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Forwarding</span>
          <span className={cn("pb-dot h-1 w-1", forwardTo ? "bg-success" : "bg-fg-subtle")} />
        </div>
        <div className="truncate font-mono text-[11px] text-fg-muted">
          {forwardTo ?? "capture-only"}
        </div>
      </div>
    </div>
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
    <Button
      onClick={toggle}
      variant="ghost"
      size="icon"
      className="h-5 w-5"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="h-3 w-3 stroke-[1.75]" /> : <Moon className="h-3 w-3 stroke-[1.75]" />}
    </Button>
  );
}
