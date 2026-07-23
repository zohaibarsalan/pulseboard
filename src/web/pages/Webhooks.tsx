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
import { PulseboardSelect } from "../components/PulseboardSelect.js";
import { getWebhookRefreshInterval } from "../lib/refreshPreference.js";
import type { SignatureStatus } from "../lib/api.js";

type StatusFilter = "all" | "success" | "failed" | "pending";
type SignatureFilter = "all" | SignatureStatus;

export function WebhooksPage({ selectedId = null }: { selectedId?: string | null }): React.ReactElement {
  const [, navigate] = useLocation();
  const initialParams = new URLSearchParams(window.location.search);
  const [clearOpen, setClearOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const status = initialParams.get("status");
    return status === "success" || status === "failed" || status === "pending" ? status : "all";
  });
  const [sourceFilter, setSourceFilter] = useState<string | null>(() => initialParams.get("source"));
  const [methodFilter, setMethodFilter] = useState(() => initialParams.get("method") ?? "all");
  const [signatureFilter, setSignatureFilter] = useState<SignatureFilter>(() => {
    const signature = initialParams.get("signature");
    return signature === "valid" || signature === "invalid" || signature === "no_secret" ||
      signature === "unverifiable" || signature === "not_applicable" ? signature : "all";
  });
  const [search, setSearch] = useState(() => initialParams.get("q") ?? "");
  const [refreshInterval] = useState(getWebhookRefreshInterval);
  const live = useLiveEvents();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (selectedId) return;
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (methodFilter !== "all") params.set("method", methodFilter);
    if (signatureFilter !== "all") params.set("signature", signatureFilter);
    if (search.trim()) params.set("q", search.trim());
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/?${query}` : "/");
  }, [methodFilter, search, selectedId, signatureFilter, sourceFilter, statusFilter]);

  const filter: WebhookFilter = {
    status: statusFilter === "all" ? undefined : statusFilter,
    source: sourceFilter ?? undefined,
    method: methodFilter === "all" ? undefined : methodFilter,
    signature: signatureFilter === "all" ? undefined : signatureFilter,
    q: search.trim() || undefined,
  };

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 10_000 });
  const { data: stats } = useQuery({ queryKey: ["webhook-stats"], queryFn: api.stats, refetchInterval: 10_000 });
  const { data: sources } = useQuery({ queryKey: ["webhook-sources"], queryFn: api.sources, refetchInterval: 10_000 });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, isRefetching } = useInfiniteQuery({
    queryKey: ["webhooks", filter],
    queryFn: ({ pageParam }) => api.webhooks(filter, 100, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    refetchInterval: refreshInterval || false,
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
      setClearOpen(false);
      navigate("/");
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
    },
  });

  const refreshEvents = (): void => {
    live.acknowledge();
    void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
  };
  const showListOnMobile = selectedId == null;

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Webhooks" subtitle={<LiveBadge status={live.status} />} />

      <div className="flex min-h-0 flex-1">
        <aside className={cn(
          "w-full min-w-0 flex-col border-r border-border bg-bg-subtle/25 md:flex md:w-[400px] md:shrink-0 xl:w-[440px]",
          showListOnMobile ? "flex" : "hidden",
        )}>
          <div data-testid="webhook-summary" className="flex min-h-20 items-center gap-4 border-b border-border px-4 py-3 text-xs">
            <span><span className="font-semibold tabular-nums">{stats?.total ?? 0}</span> <span className="text-fg-subtle">total</span></span>
            <span className="text-success"><span className="font-semibold tabular-nums">{stats?.succeeded ?? 0}</span> ok</span>
            <span className="text-danger"><span className="font-semibold tabular-nums">{stats?.failed ?? 0}</span> failed</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                onClick={refreshEvents}
                disabled={isRefetching}
                variant="ghost"
                size="icon-sm"
                title={`Refresh webhooks${live.newEventCount ? ` · ${live.newEventCount} new` : ""}`}
                aria-label={`Refresh webhooks${live.newEventCount ? `, ${live.newEventCount} new events` : ""}`}
              >
                <RefreshCw className={cn(isRefetching && "animate-spin")} />
                {live.newEventCount > 0 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-success" />}
              </Button>
            {stats && stats.total > 0 && (
              <Button
                onClick={() => setClearOpen(true)}
                disabled={clearMutation.isPending || health?.readonly}
                variant="danger"
                size="icon"
                className="size-7"
                title={health?.readonly ? "Read-only mode" : "Clear all"}
                aria-label={health?.readonly ? "Clear all unavailable in read-only mode" : "Clear all webhooks"}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            </div>
          </div>

          <div data-testid="webhook-controls" className="min-h-40 space-y-2 border-b border-border p-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search webhooks…" />
              <div className="grid grid-cols-2 gap-2">
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
                <PulseboardSelect
                  value={methodFilter}
                  onChange={setMethodFilter}
                  ariaLabel="Filter by method"
                  className="min-w-0"
                  options={[
                    { value: "all", label: "All methods" },
                    ...["POST", "PUT", "PATCH", "DELETE", "GET"].map((method) => ({ value: method, label: method })),
                  ]}
                />
                <PulseboardSelect
                  value={signatureFilter}
                  onChange={(value) => setSignatureFilter(value as SignatureFilter)}
                  ariaLabel="Filter by signature"
                  className="min-w-0"
                  options={[
                    { value: "all", label: "All signatures" },
                    { value: "valid", label: "Valid signature" },
                    { value: "invalid", label: "Invalid signature" },
                    { value: "no_secret", label: "No secret" },
                    { value: "unverifiable", label: "Unverifiable" },
                    { value: "not_applicable", label: "Not applicable" },
                  ]}
                />
              </div>
          </div>

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
        </aside>

        <section className={cn("min-w-0 flex-1", showListOnMobile ? "hidden md:block" : "block")}>
          {selected ? (
            <WebhookDetail webhook={selected} readonly={health?.readonly ?? false} />
          ) : selectedLoading ? (
            <DetailSkeleton />
          ) : selectedError ? (
            <Alert variant="error" className="m-5"><AlertDescription>Could not load this webhook: {selectedError.message}</AlertDescription></Alert>
          ) : (
            <EmptyDetail />
          )}
        </section>
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
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex h-auto min-h-16 w-full items-center gap-3 rounded-none border-x-0 border-b border-t-0 border-border/60 bg-bg px-4 py-3.5 text-left last:border-b-0 hover:bg-bg-muted/50",
        selected && "bg-bg-muted hover:bg-bg-muted",
      )}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-primary" />}
      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot)} />
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 items-center gap-2">
          <SourceBadge source={webhook.source} />
          <SignatureBadge status={webhook.signatureStatus} notes={webhook.signatureNotes} size="sm" />
          {webhook.eventType && (
            <span className="truncate font-mono text-xs font-medium text-fg">{webhook.eventType}</span>
          )}
        </div>
        <div className="mt-1.5 truncate font-mono text-2xs leading-4 text-fg-subtle">
          {webhook.method} {webhook.path}
        </div>
      </div>
      <div className="shrink-0 space-y-1.5 text-right">
        <div className="text-2xs leading-4 text-fg-subtle">{formatRelativeTime(webhook.receivedAt)}</div>
        {webhook.forwardDurationMs != null && (
          <div className="text-2xs leading-4 text-fg-subtle">{formatDuration(webhook.forwardDurationMs)}</div>
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
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon"><WebhookIcon /></EmptyMedia>
        <EmptyTitle>Select a webhook</EmptyTitle>
        <EmptyDescription>Body, headers, and forwarding details will appear here.</EmptyDescription>
      </EmptyHeader>
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
