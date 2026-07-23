import { useDeferredValue, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Activity, ArrowRight, Moon, Send, Settings, Sun, Webhook, type LucideIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SourceBadge } from "./SourceBadge.js";
import { api, type Webhook as WebhookRecord } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { cn } from "../lib/cn.js";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ open, onClose }: Props): React.ReactElement {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const go = (href: string): void => {
    setLocation(href);
    onClose();
  };

  const toggleTheme = (): void => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("pb-theme", next ? "dark" : "light");
    onClose();
  };

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const normalizedSearch = search.trim().toLowerCase();
  const labels = ["webhooks", "compose", "analytics", "settings", isDark ? "switch to light mode" : "switch to dark mode"];
  const hasPageMatches = labels.some((label) => label.includes(normalizedSearch));
  const { data: webhookResults, isFetching } = useQuery({
    queryKey: ["command-webhooks", deferredSearch],
    queryFn: () => api.webhooks(deferredSearch ? { q: deferredSearch } : {}, 6),
    enabled: open,
    staleTime: 5_000,
  });
  const webhooks = webhookResults?.webhooks ?? [];
  const hasMatches = hasPageMatches || webhooks.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <CommandDialogPopup className="max-w-2xl">
        <Command>
          <CommandInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search webhooks, pages, and actions…"
            className="text-base"
          />
          <CommandPanel>
            <CommandList className="max-h-[28rem]">
              {normalizedSearch && !hasMatches && !isFetching ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium">No results for “{search.trim()}”</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try an event name, source, path, or request ID.</p>
                </div>
              ) : null}
              {(webhooks.length > 0 || isFetching) && (
                <CommandGroup>
                  <CommandGroupLabel>{normalizedSearch ? "Matching webhooks" : "Recent webhooks"}</CommandGroupLabel>
                  {webhooks.map((webhook) => (
                    <WebhookResult key={webhook.id} webhook={webhook} onSelect={() => go(`/webhooks/${webhook.id}`)} />
                  ))}
                  {isFetching && webhooks.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground">Searching webhooks…</div>
                  )}
                  {normalizedSearch && (
                    <CommandItem
                      value={`Search all webhooks ${search}`}
                      onClick={() => go(`/?q=${encodeURIComponent(search.trim())}`)}
                      className="mt-1 text-muted-foreground"
                    >
                      <ArrowRight className="size-4" />
                      <span>View all matching webhooks</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
              <CommandGroup>
                <CommandGroupLabel>Navigate</CommandGroupLabel>
                <PaletteItem icon={Webhook} label="Webhooks" onSelect={() => go("/")} />
                <PaletteItem icon={Send} label="Compose" onSelect={() => go("/compose")} />
                <PaletteItem icon={Activity} label="Analytics" onSelect={() => go("/analytics")} />
                <PaletteItem icon={Settings} label="Settings" onSelect={() => go("/settings")} />
              </CommandGroup>
              <CommandGroup>
                <CommandGroupLabel>Action</CommandGroupLabel>
                <PaletteItem
                  icon={isDark ? Sun : Moon}
                  label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  onSelect={toggleTheme}
                />
              </CommandGroup>
            </CommandList>
          </CommandPanel>
          <CommandFooter className="px-4 py-2.5">
            <KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd><span>navigate</span></KbdGroup>
            <KbdGroup><Kbd>↵</Kbd><span>select</span><Kbd>esc</Kbd><span>close</span></KbdGroup>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function WebhookResult({
  webhook,
  onSelect,
}: {
  webhook: WebhookRecord;
  onSelect: () => void;
}): React.ReactElement {
  const failed = webhook.forwardError || (webhook.forwardStatus != null && webhook.forwardStatus >= 400);
  const succeeded = webhook.forwardStatus != null && webhook.forwardStatus >= 200 && webhook.forwardStatus < 400;
  const eventLabel = webhook.eventType || webhook.path;

  return (
    <CommandItem
      value={`${eventLabel} ${webhook.source} ${webhook.method} ${webhook.path} ${webhook.id}`}
      onClick={onSelect}
      className="items-center gap-3 px-3 py-2.5"
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          failed ? "bg-danger" : succeeded ? "bg-success" : "bg-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SourceBadge source={webhook.source} />
          <span className="truncate font-mono text-sm font-medium">{eventLabel}</span>
        </div>
        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {webhook.method} {webhook.path}
        </div>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatRelativeTime(webhook.receivedAt)}
      </span>
    </CommandItem>
  );
}

function PaletteItem({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <CommandItem value={label} onClick={onSelect} className="gap-3 px-3 py-2.5">
      <Icon className="size-4" />
      <span className="flex-1 truncate">{label}</span>
    </CommandItem>
  );
}
