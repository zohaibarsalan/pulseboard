import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertCircle,
  GitBranch,
  LayoutGrid,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn.js";

type NavItem = { href: string; label: string; icon: LucideIcon };

const items: NavItem[] = [
  { href: "/", label: "Queues", icon: LayoutGrid },
  { href: "/failed", label: "Failed Jobs", icon: AlertCircle },
  { href: "/flows", label: "Flows", icon: GitBranch },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar(): React.ReactElement {
  const [location] = useLocation();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-subtle">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-fg text-bg">
          <span className="text-2xs font-bold">P</span>
        </div>
        <span className="text-sm font-medium tracking-tight">Pulseboard</span>
        <span className="ml-1 rounded border border-border px-1 py-0.5 text-2xs font-medium text-fg-subtle">
          0.1
        </span>
      </div>

      <div className="px-3 pt-3 pb-1.5 text-2xs font-medium uppercase tracking-wider text-fg-subtle">
        Instance
      </div>
      <div className="mx-3 mb-4 flex items-center justify-between rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm">
        <span className="font-medium">default</span>
        <span className="pb-dot bg-success" />
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {items.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("pb-nav-item", isActive && "pb-nav-item-active")}
            >
              <Icon className="h-3.5 w-3.5 stroke-[1.75]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
