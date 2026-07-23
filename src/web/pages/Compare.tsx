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
        <aside className="flex max-h-[44%] min-h-0 w-full shrink-0 flex-col border-b bg-bg-subtle/20 xl:max-h-none xl:w-[380px] xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-3 border-b p-4">
            <div>
              <h2 className="text-balance text-sm font-medium">Webhook selector</h2>
              <p className="mt-1 text-pretty text-xs text-muted-foreground">
                Choose a slot, then select a webhook from the list.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
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

          <div className="border-b p-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={`Search for Webhook ${activeSide === "left" ? "A" : "B"}…`}
            />
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
                      "h-auto w-full justify-start rounded-none border-b px-4 py-3 text-left",
                      selectedSide && "bg-bg-muted",
                    )}
                    data-webhook-id={webhook.id}
                  >
                    <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <SourceBadge source={webhook.source} />
                        <span className="truncate font-mono text-xs font-medium">
                          {webhook.eventType || webhook.path}
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center justify-between gap-3 font-mono text-2xs text-muted-foreground">
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
        "h-auto min-w-0 justify-start px-3 py-2.5 text-left",
        active && "ring-1 ring-ring",
      )}
      aria-pressed={active}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-2xs text-muted-foreground">{label}</span>
        <span className="truncate font-mono text-xs font-medium">
          {webhook?.eventType || webhook?.path || "Not selected"}
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
    <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch border-b bg-bg-subtle/15">
      <SummaryWebhook label="Earlier" webhook={earlier} />
      <div className="flex items-center border-x px-3 text-muted-foreground">
        <ArrowRight className="size-4" aria-hidden="true" />
      </div>
      <SummaryWebhook label="Later" webhook={later} />
    </div>
  );
}

function SummaryWebhook({ label, webhook }: { label: string; webhook: Webhook }): React.ReactElement {
  return (
    <div className="min-w-0 px-5 py-3">
      <span className="text-2xs text-muted-foreground">{label}</span>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <SourceBadge source={webhook.source} />
        <span className="truncate font-mono text-xs font-medium">
          {webhook.eventType || webhook.path}
        </span>
        <SignatureBadge status={webhook.signatureStatus} notes={webhook.signatureNotes} />
      </div>
      <p className="mt-1 truncate font-mono text-2xs text-muted-foreground">
        {new Date(webhook.receivedAt).toLocaleString()}
      </p>
    </div>
  );
}

function SelectorSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-1 p-3">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-14" />
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
