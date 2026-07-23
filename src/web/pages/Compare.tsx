import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, GitCompareArrows } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Topbar } from "../components/Topbar.js";
import { SearchInput } from "../components/SearchInput.js";
import { SourceBadge } from "../components/SourceBadge.js";
import { SignatureBadge } from "../components/SignatureBadge.js";
import { WebhookCompare } from "../components/WebhookCompare.js";
import { api, type Webhook } from "../lib/api.js";
import { cn } from "../lib/cn.js";
import { formatRelativeTime } from "../lib/format.js";

type PairSide = "left" | "right";
type OrderedPair = [Webhook, Webhook];

export function ComparePage(): React.ReactElement {
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const leftId = params.get("left");
  const rightId = params.get("right");
  const [activeSide, setActiveSide] = useState<PairSide>(() => leftId ? "right" : "left");
  const [search, setSearch] = useState("");

  const leftQuery = useQuery({
    queryKey: ["webhook", leftId],
    queryFn: () => api.webhook(leftId!),
    enabled: leftId != null,
  });
  const rightQuery = useQuery({
    queryKey: ["webhook", rightId],
    queryFn: () => api.webhook(rightId!),
    enabled: rightId != null,
  });
  const candidatesQuery = useQuery({
    queryKey: ["compare-webhooks", search.trim()],
    queryFn: () => api.webhooks(search.trim() ? { q: search.trim() } : {}, 100),
    staleTime: 5_000,
  });

  const left = leftQuery.data ?? null;
  const right = rightQuery.data ?? null;
  const loadingSelection =
    (leftId != null && leftQuery.isLoading) || (rightId != null && rightQuery.isLoading);
  const selectionError = leftQuery.error ?? rightQuery.error;
  const candidates = useMemo(
    () => candidatesQuery.data?.webhooks ?? [],
    [candidatesQuery.data?.webhooks],
  );
  const ordered: OrderedPair | null =
    left && right
      ? left.receivedAt <= right.receivedAt
        ? [left, right]
        : [right, left]
      : null;

  const updatePair = (nextLeft: string | null, nextRight: string | null): void => {
    const next = new URLSearchParams();
    if (nextLeft) next.set("left", nextLeft);
    if (nextRight) next.set("right", nextRight);
    const query = next.toString();
    navigate(query ? `/compare?${query}` : "/compare");
  };

  const selectWebhook = (webhook: Webhook): void => {
    if (activeSide === "left") {
      updatePair(webhook.id, rightId);
      if (!rightId) setActiveSide("right");
    } else {
      updatePair(leftId, webhook.id);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar title="Compare" subtitle="Select two captures, then inspect what changed" />

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <aside className={cn(
          "flex min-h-0 w-full shrink-0 flex-col border-b bg-bg-subtle/20 xl:max-h-none xl:w-[420px] xl:border-b-0 xl:border-r",
          ordered ? "max-h-[48%]" : "max-h-[65%]",
        )}>
          <div className="flex shrink-0 flex-col justify-center border-b p-4 xl:h-28">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectionSlot
                label="Webhook A"
                webhook={left}
                active={activeSide === "left"}
                onClick={() => setActiveSide("left")}
              />
              <SelectionSlot
                label="Webhook B"
                webhook={right}
                active={activeSide === "right"}
                onClick={() => setActiveSide("right")}
              />
            </div>
          </div>

          <div className="flex min-h-16 shrink-0 items-center border-b px-4">
            <div className="w-full">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={`Search for Webhook ${activeSide === "left" ? "A" : "B"}…`}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="compare-selector-list">
            {candidatesQuery.isLoading ? (
              <SelectorSkeleton />
            ) : candidates.length === 0 ? (
              <Empty className="min-h-52 py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
                  <EmptyTitle className="text-sm">No webhooks found</EmptyTitle>
                  <EmptyDescription>Try another event, provider, path, or request ID.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              candidates.map((webhook) => {
                const selectedSide =
                  webhook.id === leftId ? "A" : webhook.id === rightId ? "B" : null;
                const unavailable =
                  (activeSide === "left" && webhook.id === rightId) ||
                  (activeSide === "right" && webhook.id === leftId);
                return (
                  <Button
                    key={webhook.id}
                    onClick={() => selectWebhook(webhook)}
                    disabled={unavailable}
                    variant="ghost"
                    className={cn(
                      "min-h-16 w-full justify-start rounded-none border-b px-5 py-4 text-left",
                      selectedSide && "bg-bg-muted",
                    )}
                    data-webhook-id={webhook.id}
                  >
                    <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <SourceBadge source={webhook.source} />
                        <span className="truncate font-mono text-sm font-medium">
                          {webhook.eventType || webhook.path}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
                        <span className="truncate">{webhook.method} {webhook.path}</span>
                        <span className="shrink-0 tabular-nums">{formatRelativeTime(webhook.receivedAt)}</span>
                      </span>
                    </span>
                    {selectedSide && (
                      <Badge variant="secondary" size="sm">
                        <Check data-icon="inline-start" />
                        {selectedSide}
                      </Badge>
                    )}
                  </Button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selectionError ? (
            <Alert variant="error" className="m-5">
              <AlertDescription>
                Could not load this comparison: {selectionError.message}
              </AlertDescription>
            </Alert>
          ) : loadingSelection ? (
            <CompareCanvasSkeleton />
          ) : ordered ? (
            <>
              <ComparisonSummary earlier={ordered[0]} later={ordered[1]} />
              <div className="min-h-0 flex-1">
                <WebhookCompare current={ordered[0]} comparison={ordered[1]} />
              </div>
            </>
          ) : (
            <Empty className="min-h-0 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
                <EmptyTitle>Select two webhooks</EmptyTitle>
                <EmptyDescription>
                  Choose Webhook A and Webhook B from the selector. The comparison appears here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function SelectionSlot({
  label,
  webhook,
  active,
  onClick,
}: {
  label: string;
  webhook: Webhook | null;
  active: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Button
      onClick={onClick}
      variant={active ? "outline" : "ghost"}
      className={cn(
        "min-h-20 min-w-0 justify-start px-4 py-3 text-left",
      )}
      aria-pressed={active}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="flex min-w-0 items-center gap-2">
          {webhook && <SourceBadge source={webhook.source} />}
          <span className="truncate font-mono text-sm font-medium">
            {webhook?.eventType || webhook?.path || "Not selected"}
          </span>
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {webhook ? `${webhook.method} ${webhook.path}` : "Select from the list below"}
        </span>
      </span>
    </Button>
  );
}

function ComparisonSummary({
  earlier,
  later,
}: {
  earlier: Webhook;
  later: Webhook;
}): React.ReactElement {
  return (
    <div className="grid shrink-0 items-stretch border-b bg-bg-subtle/15 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:h-28">
      <SummaryWebhook label="Earlier" webhook={earlier} />
      <div className="flex items-center justify-center border-y py-2 text-muted-foreground sm:border-x sm:border-y-0 sm:px-4 sm:py-0">
        <ArrowRight className="size-4 rotate-90 sm:rotate-0" aria-hidden="true" />
      </div>
      <SummaryWebhook label="Later" webhook={later} />
    </div>
  );
}

function SummaryWebhook({ label, webhook }: { label: string; webhook: Webhook }): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-col justify-center px-6 py-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <SourceBadge source={webhook.source} />
        <span className="truncate font-mono text-sm font-medium">
          {webhook.eventType || webhook.path}
        </span>
        <SignatureBadge status={webhook.signatureStatus} notes={webhook.signatureNotes} />
      </div>
      <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
        {new Date(webhook.receivedAt).toLocaleString()}
      </p>
    </div>
  );
}

function SelectorSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-16" />
      ))}
    </div>
  );
}

function CompareCanvasSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-5 p-5">
      <Skeleton className="h-20" />
      <Skeleton className="h-14" />
      <Skeleton className="min-h-72 flex-1" />
    </div>
  );
}
