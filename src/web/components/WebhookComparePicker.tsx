import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogPrimitive,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { api, type Webhook } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { SourceBadge } from "./SourceBadge.js";

export function WebhookComparePicker({
  open,
  current,
  onClose,
  onSelect,
}: {
  open: boolean;
  current: Webhook;
  onClose: () => void;
  onSelect: (webhook: Webhook) => void;
}): React.ReactElement {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["compare-webhooks", deferredSearch],
    queryFn: () => api.webhooks(deferredSearch ? { q: deferredSearch } : {}, 30),
    enabled: open,
    staleTime: 5_000,
  });
  const candidates = useMemo(
    () =>
      (data?.webhooks ?? [])
        .filter((webhook) => webhook.id !== current.id)
        .sort((left, right) => candidateScore(right, current) - candidateScore(left, current)),
    [current, data?.webhooks],
  );

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <CommandDialogPopup className="max-w-2xl">
        <CommandDialogPrimitive.Title className="sr-only">Choose a webhook to compare</CommandDialogPrimitive.Title>
        <Command>
          <CommandInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search by event, source, path, or request ID…"
            className="text-base"
          />
          <CommandPanel>
            <CommandList className="max-h-[30rem]">
              <CommandGroup>
                <CommandGroupLabel>
                  {deferredSearch ? "Matching webhooks" : "Recent webhooks"}
                </CommandGroupLabel>
                {candidates.map((webhook) => (
                  <CommandItem
                    key={webhook.id}
                    value={`${webhook.eventType ?? ""} ${webhook.source} ${webhook.method} ${webhook.path} ${webhook.id}`}
                    onClick={() => {
                      onSelect(webhook);
                      onClose();
                    }}
                    className="items-center gap-3 px-3 py-3"
                  >
                    <SourceBadge source={webhook.source} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-medium">
                        {webhook.eventType || webhook.path}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {webhook.method} {webhook.path}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {webhook.eventType === current.eventType && (
                        <p className="text-2xs text-success">same event type</p>
                      )}
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatRelativeTime(webhook.receivedAt)}
                      </p>
                    </div>
                  </CommandItem>
                ))}
                {!isFetching && candidates.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm font-medium">No other webhooks found</p>
                    <p className="mt-1 text-pretty text-xs text-muted-foreground">
                      Capture or replay another event, then compare it with this request.
                    </p>
                  </div>
                )}
                {isFetching && candidates.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Loading webhooks…
                  </div>
                )}
              </CommandGroup>
            </CommandList>
          </CommandPanel>
          <CommandFooter className="px-4 py-2.5">
            <span>Same event type and provider are ranked first.</span>
            <KbdGroup><Kbd>↑</Kbd><Kbd>↓</Kbd><span>navigate</span><Kbd>↵</Kbd><span>compare</span></KbdGroup>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function candidateScore(candidate: Webhook, current: Webhook): number {
  let score = candidate.receivedAt / 1_000_000_000_000;
  if (candidate.source === current.source) score += 10;
  if (candidate.eventType && candidate.eventType === current.eventType) score += 20;
  if (candidate.path === current.path) score += 5;
  return score;
}
