import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Activity,
  AlertCircle,
  ChevronRight,
  GitBranch,
  LayoutGrid,
  Moon,
  Pause,
  Play,
  Search,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { api, type QueueSummary } from "../lib/api.js";

const INSTANCE_ID = "default";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ open, onClose }: Props): React.ReactElement | null {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: queues } = useQuery({
    queryKey: ["queues", INSTANCE_ID],
    queryFn: () => api.queues(INSTANCE_ID),
    enabled: open,
  });

  // Reset search on open
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const go = (href: string): void => {
    setLocation(href);
    onClose();
  };

  const pauseMutation = useMutation({
    mutationFn: (name: string) => api.pauseQueue(INSTANCE_ID, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queues", INSTANCE_ID] }),
  });
  const resumeMutation = useMutation({
    mutationFn: (name: string) => api.resumeQueue(INSTANCE_ID, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queues", INSTANCE_ID] }),
  });

  const toggleTheme = (): void => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("pb-theme", next ? "dark" : "light");
    onClose();
  };

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const sortedQueues = useMemo<QueueSummary[]>(
    () => (queues?.queues ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [queues],
  );

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
        <Command
          shouldFilter
          label="Command palette"
          className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-bg shadow-2xl"
          loop
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-3.5 w-3.5 stroke-[1.75] text-fg-subtle" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search queues, jobs, actions…"
              autoFocus
              className="h-11 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <span className="pb-kbd">Esc</span>
          </div>

          <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
            <Command.Empty className="p-6 text-center text-xs text-fg-subtle">
              No matches.
            </Command.Empty>

            <Command.Group heading="Pages">
              <PaletteItem icon={LayoutGrid} label="Queues" onSelect={() => go("/")} />
              <PaletteItem icon={AlertCircle} label="Failed Jobs" onSelect={() => go("/failed")} />
              <PaletteItem icon={GitBranch} label="Flows" onSelect={() => go("/flows")} />
              <PaletteItem icon={Activity} label="Analytics" onSelect={() => go("/analytics")} />
              <PaletteItem icon={Settings} label="Settings" onSelect={() => go("/settings")} />
            </Command.Group>

            {sortedQueues.length > 0 && (
              <Command.Group heading="Go to queue">
                {sortedQueues.map((q) => (
                  <PaletteItem
                    key={`open-${q.name}`}
                    icon={ChevronRight}
                    label={q.name}
                    hint={`${q.counts.active}A · ${q.counts.waiting}W · ${q.counts.failed}F`}
                    onSelect={() => go(`/queue/${encodeURIComponent(q.name)}`)}
                  />
                ))}
              </Command.Group>
            )}

            {sortedQueues.length > 0 && (
              <Command.Group heading="Queue actions">
                {sortedQueues.map((q) =>
                  q.isPaused ? (
                    <PaletteItem
                      key={`resume-${q.name}`}
                      icon={Play}
                      label={`Resume ${q.name}`}
                      onSelect={() => {
                        resumeMutation.mutate(q.name);
                        onClose();
                      }}
                    />
                  ) : (
                    <PaletteItem
                      key={`pause-${q.name}`}
                      icon={Pause}
                      label={`Pause ${q.name}`}
                      onSelect={() => {
                        pauseMutation.mutate(q.name);
                        onClose();
                      }}
                    />
                  ),
                )}
              </Command.Group>
            )}

            <Command.Group heading="Preferences">
              <PaletteItem
                icon={isDark ? Sun : Moon}
                label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                onSelect={toggleTheme}
              />
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t border-border bg-bg-subtle px-3 py-1.5 text-[10px] text-fg-subtle">
            <div className="flex items-center gap-2">
              <span className="pb-kbd">↑</span>
              <span className="pb-kbd">↓</span>
              <span>navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="pb-kbd">↵</span>
              <span>select</span>
              <span className="pb-kbd">esc</span>
              <span>close</span>
            </div>
          </div>
        </Command>
      </div>
    </>
  );
}

function PaletteItem({
  icon: Icon,
  label,
  hint,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <Command.Item
      onSelect={onSelect}
      value={label}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted data-[selected=true]:bg-bg-muted data-[selected=true]:text-fg"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.75]" />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-2xs text-fg-subtle">{hint}</span>}
    </Command.Item>
  );
}
