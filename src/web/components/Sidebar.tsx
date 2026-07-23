import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Moon, PlugZap, Send, Settings, Sun, Webhook, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn.js";
import { api } from "../lib/api.js";
import { Button } from "@/components/ui/button";
import { PulseboardMark } from "./PulseboardMark.js";

type NavItem = { href: string; label: string; icon: LucideIcon; match?: (loc: string) => boolean };

const items: NavItem[] = [
  {
    href: "/",
    label: "Webhooks",
    icon: Webhook,
    match: (location) =>
      location === "/" ||
      location === "/webhooks" ||
      location.startsWith("/webhooks/") ||
      location === "/compare",
  },
  { href: "/connect", label: "Connect", icon: PlugZap },
  { href: "/compose", label: "Compose", icon: Send },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar(): React.ReactElement {
  const [location] = useLocation();
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5_000 });

  return (
    <>
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-subtle md:flex">
      <div className="flex h-16 items-center gap-2.5 px-4">
        <PulseboardMark className="size-7" />
        <span className="text-sm font-semibold">Pulseboard</span>
        <span className="ml-auto rounded border border-border px-1.5 font-mono text-[11px] leading-5 text-fg-subtle">
          {health?.version ?? "0.1"}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 pt-2">
        {items.map((item) => {
          const isActive = item.match ? item.match(location) : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg",
                isActive && "bg-bg-muted text-fg",
              )}
            >
              <Icon className="size-4 shrink-0 stroke-[1.75]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <ForwardInfo forwardTo={health?.forwardTargets[0] ?? null} count={health?.forwardTargets.length ?? 0} />
        <div className="mt-3 flex items-center justify-between px-1">
          <span className="text-xs text-fg-subtle">Theme</span>
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
            aria-current={isActive ? "page" : undefined}
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

function ForwardInfo({ forwardTo, count }: { forwardTo: string | null; count: number }): React.ReactElement {
  return (
    <div className="flex items-start gap-2 rounded-md px-1 py-1.5">
      <ArrowRight className="mt-0.5 size-4 shrink-0 stroke-[1.75] text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-fg-subtle">Forwarding</span>
          <span className={cn("size-1.5 rounded-full", forwardTo ? "bg-success" : "bg-fg-subtle")} />
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-fg-muted">
          {forwardTo ? `${forwardTo}${count > 1 ? ` +${count - 1}` : ""}` : "capture-only"}
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
      className="size-8"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="size-4 stroke-[1.75]" /> : <Moon className="size-4 stroke-[1.75]" />}
    </Button>
  );
}
