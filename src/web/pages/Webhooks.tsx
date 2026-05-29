import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { SourceBadge } from "../components/SourceBadge.js";
import { WebhookDetail } from "../components/WebhookDetail.js";
import { SearchInput } from "../components/SearchInput.js";
import { api, type Webhook, type WebhookFilter } from "../lib/api.js";
import { formatRelativeTime, formatDuration } from "../lib/format.js";
import { useLiveEvents } from "../lib/useLiveEvents.js";
import { cn } from "../lib/cn.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type StatusFilter = "all" | "success" | "failed" | "pending";

export function WebhooksPage(): React.ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const liveStatus = useLiveEvents();
  const queryClient = useQueryClient();

  const filter: WebhookFilter = {
    status: statusFilter === "all" ? undefined : statusFilter,
    source: sourceFilter ?? undefined,
    q: search.trim() || undefined,
  };

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 10_000 });
  const { data: stats } = useQuery({ queryKey: ["webhook-stats"], queryFn: api.stats, refetchInterval: 10_000 });
  const { data: sources } = useQuery({ queryKey: ["webhook-sources"], queryFn: api.sources, refetchInterval: 10_000 });

  const { data, isLoading } = useQuery({
    queryKey: ["webhooks", filter],
    queryFn: () => api.webhooks(filter, 100),
    refetchInterval: liveStatus === "live" ? false : 3_000,
  });

  const { data: selected } = useQuery({
    queryKey: ["webhook", selectedId],
    queryFn: () => api.webhook(selectedId!),
    enabled: selectedId != null,
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clear(),
    onSuccess: () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
    },
  });

  const webhooks = data?.webhooks ?? [];

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Webhooks" subtitle={<LiveBadge status={liveStatus} />} />

      <div className="flex min-h-0 flex-1">
        {/* Left: list pane */}
        <div className="flex w-[420px] shrink-0 flex-col border-r border-border">
          {/* Stats bar */}
          <div className="flex items-center gap-4 border-b border-border px-4 py-2.5 text-xs">
            <span><span className="font-semibold tabular-nums">{stats?.total ?? 0}</span> <span className="text-fg-subtle">total</span></span>
            <span className="text-success"><span className="font-semibold tabular-nums">{stats?.succeeded ?? 0}</span> ok</span>
            <span className="text-danger"><span className="font-semibold tabular-nums">{stats?.failed ?? 0}</span> failed</span>
            {stats && stats.total > 0 && (
              <button
                type="button"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending || health?.readonly}
                className="ml-auto inline-flex items-center gap-1 text-fg-subtle hover:text-danger disabled:opacity-40"
                title={health?.readonly ? "Read-only mode" : "Clear all"}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Search */}
          <div className="border-b border-border p-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search payloads, paths…" />
          </div>

          {/* Status filter */}
          <div className="flex gap-1 border-b border-border px-2 py-2">
            {(["all", "success", "failed", "pending"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium capitalize transition-colors",
                  statusFilter === s ? "bg-fg/10 text-fg" : "text-fg-muted hover:bg-bg-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Source filter */}
          {sources && sources.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
              <button
                type="button"
                onClick={() => setSourceFilter(null)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-2xs font-medium transition-colors",
                  sourceFilter === null ? "bg-fg/10 text-fg" : "text-fg-subtle hover:bg-bg-muted",
                )}
              >
                all sources
              </button>
              {sources.sources.map((s) => (
                <button
                  key={s.source}
                  type="button"
                  onClick={() => setSourceFilter(s.source === sourceFilter ? null : s.source)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-2xs capitalize transition-colors",
                    sourceFilter === s.source ? "bg-fg/10 text-fg" : "text-fg-subtle hover:bg-bg-muted",
                  )}
                >
                  {s.source} {s.count}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && <div className="p-4 text-xs text-fg-subtle">Loading…</div>}
            {!isLoading && webhooks.length === 0 && <EmptyList captureUrl={health?.captureUrl} />}
            {webhooks.map((wh) => (
              <WebhookRow
                key={wh.id}
                webhook={wh}
                selected={wh.id === selectedId}
                onClick={() => setSelectedId(wh.id)}
              />
            ))}
          </div>
        </div>

        {/* Right: detail pane */}
        <div className="min-w-0 flex-1">
          {selected ? (
            <WebhookDetail webhook={selected} readonly={health?.readonly ?? false} />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}

function WebhookRow({
  webhook,
  selected,
  onClick,
}: {
  webhook: Webhook;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const statusDot =
    webhook.forwardError || (webhook.forwardStatus != null && webhook.forwardStatus >= 400)
      ? "bg-danger"
      : webhook.forwardStatus != null && webhook.forwardStatus >= 200
        ? "bg-success"
        : "bg-fg-subtle";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-bg-muted/40",
        selected && "bg-bg-muted/60",
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SourceBadge source={webhook.source} />
          {webhook.eventType && (
            <span className="truncate font-mono text-xs text-fg">{webhook.eventType}</span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-2xs text-fg-subtle">
          {webhook.method} {webhook.path}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-2xs text-fg-subtle">{formatRelativeTime(webhook.receivedAt)}</div>
        {webhook.forwardDurationMs != null && (
          <div className="text-2xs text-fg-subtle">{formatDuration(webhook.forwardDurationMs)}</div>
        )}
      </div>
    </button>
  );
}

function LiveBadge({ status }: { status: "connecting" | "live" | "error" }): React.ReactElement {
  const cfg =
    status === "live"
      ? { label: "Live", dotClass: "bg-success animate-pulse" }
      : status === "error"
        ? { label: "Reconnecting", dotClass: "bg-warning animate-pulse" }
        : { label: "Connecting", dotClass: "bg-fg-subtle" };
  return (
    <span className="pb-pill pb-pill-neutral">
      <span className={cn("pb-dot", cfg.dotClass)} />
      {cfg.label}
    </span>
  );
}

function EmptyList({ captureUrl }: { captureUrl?: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center">
      <Inbox className="h-6 w-6 text-fg-subtle" />
      <p className="text-sm font-medium">No webhooks yet</p>
      <p className="text-xs text-fg-subtle">
        Point your provider at:
      </p>
      {captureUrl && (
        <code className="break-all rounded bg-bg-muted px-2 py-1 font-mono text-2xs text-fg-muted">
          {captureUrl}/...
        </code>
      )}
    </div>
  );
}

function EmptyDetail(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <WebhookIcon className="h-8 w-8 text-fg-subtle" />
      <p className="text-sm text-fg-muted">Select a webhook to inspect</p>
      <p className="text-xs text-fg-subtle">Headers, body, and forwarding details appear here</p>
    </div>
  );
}
