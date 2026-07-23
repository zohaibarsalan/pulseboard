import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Check, Copy, Inbox, RefreshCw, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { Topbar } from "../components/Topbar.js";
import { SourceBadge } from "../components/SourceBadge.js";
import { SignatureBadge } from "../components/SignatureBadge.js";
import { WebhookDetail } from "../components/WebhookDetail.js";
import { SearchInput } from "../components/SearchInput.js";
import { api, type Webhook, type WebhookFilter } from "../lib/api.js";
import { formatRelativeTime, formatDuration } from "../lib/format.js";
import { useLiveEvents } from "../lib/useLiveEvents.js";
import { cn } from "../lib/cn.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PulseboardSelect } from "../components/PulseboardSelect.js";

type StatusFilter = "all" | "success" | "failed" | "pending";

export function WebhooksPage({ selectedId = null }: { selectedId?: string | null }): React.ReactElement {
  const [, navigate] = useLocation();
  const initialParams = new URLSearchParams(window.location.search);
  const [clearOpen, setClearOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const status = initialParams.get("status");
    return status === "success" || status === "failed" || status === "pending" ? status : "all";
  });
  const [sourceFilter, setSourceFilter] = useState<string | null>(() => initialParams.get("source"));
  const [search, setSearch] = useState(() => initialParams.get("q") ?? "");
  const live = useLiveEvents();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (selectedId) return;
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (search.trim()) params.set("q", search.trim());
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/?${query}` : "/");
  }, [search, selectedId, sourceFilter, statusFilter]);

  const filter: WebhookFilter = {
    status: statusFilter === "all" ? undefined : statusFilter,
    source: sourceFilter ?? undefined,
    q: search.trim() || undefined,
  };

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 10_000 });
  const { data: stats } = useQuery({ queryKey: ["webhook-stats"], queryFn: api.stats, refetchInterval: 10_000 });
  const { data: sources } = useQuery({ queryKey: ["webhook-sources"], queryFn: api.sources, refetchInterval: 10_000 });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["webhooks", filter],
    queryFn: ({ pageParam }) => api.webhooks(filter, 100, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    refetchInterval: live.status === "live" ? false : 3_000,
  });

  const webhooks = data?.pages.flatMap((page) => page.webhooks) ?? [];
  const { data: selected, isLoading: selectedLoading, error: selectedError } = useQuery({
    queryKey: ["webhook", selectedId],
    queryFn: () => api.webhook(selectedId!),
    enabled: selectedId != null,
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clear(),
    onSuccess: () => {
      navigate("/");
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
    },
  });

  const refreshEvents = (): void => {
    live.acknowledge();
    void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
  };

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Webhooks" subtitle={<LiveBadge status={live.status} />} />

      {selectedId ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected ? (
            <WebhookDetail webhook={selected} readonly={health?.readonly ?? false} onBack={() => navigate("/")} />
          ) : selectedLoading ? (
            <DetailSkeleton />
          ) : selectedError ? (
            <Alert variant="error" className="m-5"><AlertDescription>Could not load this webhook: {selectedError.message}</AlertDescription></Alert>
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
          {/* Stats bar */}
          <div className="flex items-center gap-4 border-b border-border pb-4 text-xs">
            <span><span className="font-semibold tabular-nums">{stats?.total ?? 0}</span> <span className="text-fg-subtle">total</span></span>
            <span className="text-success"><span className="font-semibold tabular-nums">{stats?.succeeded ?? 0}</span> ok</span>
            <span className="text-danger"><span className="font-semibold tabular-nums">{stats?.failed ?? 0}</span> failed</span>
            {stats && stats.total > 0 && (
              <Button
                onClick={() => setClearOpen(true)}
                disabled={clearMutation.isPending || health?.readonly}
                variant="danger"
                size="icon"
                className="ml-auto h-6 w-6"
                title={health?.readonly ? "Read-only mode" : "Clear all"}
                aria-label={health?.readonly ? "Clear all unavailable in read-only mode" : "Clear all webhooks"}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>

          {live.newEventCount > 0 && (
            <Button
              onClick={refreshEvents}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              <RefreshCw aria-hidden="true" />
              {live.newEventCount} new {live.newEventCount === 1 ? "event" : "events"} · refresh
            </Button>
          )}

          <div className="grid grid-cols-1 gap-2 border-b border-border py-3 sm:grid-cols-[minmax(0,1fr)_9rem_11rem]">
            <SearchInput value={search} onChange={setSearch} placeholder="Search webhooks…" />
            <PulseboardSelect
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              ariaLabel="Filter by status"
              className="min-w-0 capitalize"
              options={[
                { value: "all", label: "All status" },
                { value: "success", label: "Success" },
                { value: "failed", label: "Failed" },
                { value: "pending", label: "Pending" },
              ]}
            />
            <PulseboardSelect
              value={sourceFilter ?? "all"}
              onChange={(value) => setSourceFilter(value === "all" ? null : value)}
              ariaLabel="Filter by source"
              className="min-w-0 capitalize"
              options={[
                { value: "all", label: "All sources" },
                ...(sources?.sources ?? []).map((source) => ({
                  value: source.source,
                  label: `${source.source} · ${source.count}`,
                })),
              ]}
            />
          </div>

          {/* List */}
          <div className="overflow-hidden rounded-lg border border-border">
            {webhooks.length > 0 && (
              <div className="hidden grid-cols-[minmax(14rem,1.2fr)_minmax(12rem,1fr)_7rem_6rem] gap-4 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground md:grid">
                <span>Event</span>
                <span>Endpoint</span>
                <span>Received</span>
                <span className="text-right">Latency</span>
              </div>
            )}
            {isLoading && <WebhookListSkeleton />}
            {!isLoading && webhooks.length === 0 && <EmptyList captureUrl={health?.captureUrl} />}
            {webhooks.map((wh) => (
              <WebhookRow
                key={wh.id}
                webhook={wh}
                onClick={() => navigate(`/webhooks/${wh.id}`)}
              />
            ))}
            {hasNextPage && (
              <Button
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                variant="outline"
                className="m-3 w-[calc(100%-1.5rem)] justify-center"
              >
                {isFetchingNextPage ? "Loading…" : "Load older webhooks"}
              </Button>
            )}
          </div>
        </div>
        </div>
      )}
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all webhooks?"
        description={`This permanently deletes ${stats?.total ?? "all"} captured webhooks and cannot be undone.`}
        confirmLabel="Clear all"
        pending={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
      />
      {clearMutation.error && (
        <Alert variant="error" className="fixed bottom-20 right-4 z-30 w-auto shadow-lg md:bottom-4">
          <AlertDescription>Could not clear webhooks: {clearMutation.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function WebhookRow({
  webhook,
  onClick,
}: {
  webhook: Webhook;
  onClick: () => void;
}): React.ReactElement {
  const statusDot =
    webhook.forwardError || (webhook.forwardStatus != null && webhook.forwardStatus >= 400)
      ? "bg-danger"
      : webhook.forwardStatus != null && webhook.forwardStatus >= 200
        ? "bg-success"
        : "bg-fg-subtle";

  return (
    <Button
      onClick={onClick}
      variant="ghost"
      className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-none border-x-0 border-b border-t-0 border-border/60 bg-bg px-4 py-3 text-left last:border-b-0 hover:bg-bg-muted/50 md:grid-cols-[auto_minmax(14rem,1.2fr)_minmax(12rem,1fr)_7rem_6rem]"
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SourceBadge source={webhook.source} />
          <SignatureBadge status={webhook.signatureStatus} notes={webhook.signatureNotes} size="sm" />
          {webhook.eventType && (
            <span className="truncate font-mono text-xs font-medium text-fg">{webhook.eventType}</span>
          )}
        </div>
      </div>
      <div className="hidden truncate font-mono text-xs text-fg-muted md:block">
          {webhook.method} {webhook.path}
      </div>
      <div className="hidden text-xs text-fg-subtle md:block">{formatRelativeTime(webhook.receivedAt)}</div>
      <div className="hidden text-right text-xs text-fg-subtle md:block">
        {webhook.forwardDurationMs != null && (
          <span>{formatDuration(webhook.forwardDurationMs)}</span>
        )}
      </div>
    </Button>
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
    <Badge variant="outline">
      <span className={cn("size-1.5 rounded-full", cfg.dotClass)} />
      {cfg.label}
    </Badge>
  );
}

function EmptyList({ captureUrl }: { captureUrl?: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const testUrl = `${captureUrl ?? "http://localhost:4500/hook"}/test`;
  const curl = `curl -X POST '${testUrl}' -H 'content-type: application/json' -d '{"hello":"pulseboard"}'`;

  const copyTest = async (): Promise<void> => {
    await navigator.clipboard.writeText(curl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Empty className="m-3 rounded-lg border border-dashed py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
        <EmptyTitle className="text-base">Capture your first webhook</EmptyTitle>
        <EmptyDescription>Point a provider at this URL, or copy the test command below.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {captureUrl && (
          <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            {captureUrl}/...
          </code>
        )}
        <Button onClick={() => void copyTest()} variant="outline" size="sm">
          {copied ? <Check className="text-success" aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied test cURL" : "Copy test cURL"}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function WebhookListSkeleton(): React.ReactElement {
  return (
    <div aria-label="Loading webhooks" role="status" className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}

function DetailSkeleton(): React.ReactElement {
  return (
    <div aria-label="Loading webhook details" role="status" className="flex flex-col gap-4 p-5">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-10" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}
