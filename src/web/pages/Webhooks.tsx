import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Check, Copy, Inbox, RefreshCw, Trash2, Webhook as WebhookIcon } from "lucide-react";
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

  const webhooks = data?.pages.flatMap((page) => page.webhooks) ?? [];
  const showListOnMobile = selectedId == null;

  const refreshEvents = (): void => {
    live.acknowledge();
    void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
  };

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Webhooks" subtitle={<LiveBadge status={live.status} />} />

      <div className="flex min-h-0 flex-1">
        {/* Left: list pane */}
        <div className={cn(
          "w-full flex-col border-r border-border bg-bg-subtle/35 md:flex md:w-[420px] xl:w-[500px]",
          showListOnMobile ? "flex" : "hidden",
        )}>
          {/* Stats bar */}
          <div className="flex items-center gap-4 border-b border-border px-4 py-3 text-xs">
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
              className="mx-3 mt-3"
            >
              <RefreshCw aria-hidden="true" />
              {live.newEventCount} new {live.newEventCount === 1 ? "event" : "events"} · refresh
            </Button>
          )}

          <div className="border-b border-border p-3">
            <div className="rounded-lg border border-border bg-bg p-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search payloads, paths…" />
              <div className="mt-3 grid gap-3">
                <FilterGroup label="Status">
                  {(["all", "success", "failed", "pending"] as StatusFilter[]).map((s) => (
                    <Button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      variant="pill"
                      size="xs"
                      active={statusFilter === s}
                      className="capitalize"
                    >
                      {s}
                    </Button>
                  ))}
                </FilterGroup>

                {sources && sources.sources.length > 0 && (
                  <FilterGroup label="Source">
                    <Button onClick={() => setSourceFilter(null)} variant="pill" size="xs" active={sourceFilter === null}>
                      all
                    </Button>
                    {sources.sources.map((s) => (
                      <Button
                        key={s.source}
                        onClick={() => setSourceFilter(s.source === sourceFilter ? null : s.source)}
                        variant="pill"
                        size="xs"
                        active={sourceFilter === s.source}
                        className="capitalize"
                      >
                        {s.source} <span className="text-fg-subtle">{s.count}</span>
                      </Button>
                    ))}
                  </FilterGroup>
                )}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && <WebhookListSkeleton />}
            {!isLoading && webhooks.length === 0 && <EmptyList captureUrl={health?.captureUrl} />}
            {webhooks.map((wh) => (
              <WebhookRow
                key={wh.id}
                webhook={wh}
                selected={wh.id === selectedId}
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

        {/* Right: detail pane */}
        <div className={cn("min-w-0 flex-1", showListOnMobile ? "hidden md:block" : "block")}>
          {selected ? (
            <WebhookDetail webhook={selected} readonly={health?.readonly ?? false} onBack={() => navigate("/")} />
          ) : selectedLoading ? (
            <DetailSkeleton />
          ) : selectedError ? (
            <Alert variant="error" className="m-5"><AlertDescription>Could not load this webhook: {selectedError.message}</AlertDescription></Alert>
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
      <span className="pt-1 text-2xs font-medium uppercase tracking-wider text-fg-subtle">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
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
    <Button
      onClick={onClick}
      variant="ghost"
      className={cn(
        "flex h-auto w-full items-center gap-3 rounded-none border-x-0 border-b border-t-0 border-border/60 bg-bg px-4 py-2.5 text-left hover:bg-bg-muted/50",
        selected && "bg-bg-muted/70",
      )}
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
        <div className="mt-1 truncate font-mono text-2xs text-fg-subtle">
          {webhook.method} {webhook.path}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-2xs text-fg-subtle">{formatRelativeTime(webhook.receivedAt)}</div>
        {webhook.forwardDurationMs != null && (
          <div className="text-2xs text-fg-subtle">{formatDuration(webhook.forwardDurationMs)}</div>
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

function EmptyDetail(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <WebhookIcon className="h-8 w-8 text-fg-subtle" />
      <p className="text-sm text-fg-muted">Select a webhook to inspect</p>
      <p className="text-xs text-fg-subtle">Headers, body, and forwarding details appear here</p>
    </div>
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
