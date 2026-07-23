import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Topbar } from "../components/Topbar.js";
import { SourceBadge } from "../components/SourceBadge.js";
import { SignatureBadge } from "../components/SignatureBadge.js";
import { WebhookCompare } from "../components/WebhookCompare.js";
import { WebhookComparePicker } from "../components/WebhookComparePicker.js";
import { api, type Webhook } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";

type PairSide = "left" | "right";
type OrderedPair = [
  { webhook: Webhook; side: PairSide },
  { webhook: Webhook; side: PairSide },
];

export function ComparePage(): React.ReactElement {
  const [location, navigate] = useLocation();
  const [pickerSide, setPickerSide] = useState<PairSide | null>(null);
  const params = new URLSearchParams(window.location.search);
  const leftId = params.get("left");
  const rightId = params.get("right");

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

  const left = leftQuery.data ?? null;
  const right = rightQuery.data ?? null;
  const loading = (leftId != null && leftQuery.isLoading) || (rightId != null && rightQuery.isLoading);
  const error = leftQuery.error ?? rightQuery.error;

  const updatePair = (nextLeft: string | null, nextRight: string | null): void => {
    const next = new URLSearchParams();
    if (nextLeft) next.set("left", nextLeft);
    if (nextRight) next.set("right", nextRight);
    navigate(`/compare?${next.toString()}`);
  };

  const choose = (side: PairSide, webhook: Webhook): void => {
    updatePair(side === "left" ? webhook.id : leftId, side === "right" ? webhook.id : rightId);
    setPickerSide(null);
  };

  const ordered: OrderedPair | null =
    left && right
      ? left.receivedAt <= right.receivedAt
        ? [{ webhook: left, side: "left" as const }, { webhook: right, side: "right" as const }]
        : [{ webhook: right, side: "right" as const }, { webhook: left, side: "left" as const }]
      : null;
  const pickerReference = pickerSide === "left" ? right : left;

  // Accessing location keeps this page synchronized when the query string changes.
  void location;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Topbar title="Compare" subtitle="Request and delivery changes" />

      {!leftId ? (
        <Empty className="min-h-0 flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
            <EmptyTitle>Start from a captured webhook</EmptyTitle>
            <EmptyDescription>
              Open a webhook and choose Compare to use it as the first request.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate("/")} variant="outline">Browse webhooks</Button>
          </EmptyContent>
        </Empty>
      ) : loading ? (
        <ComparePageSkeleton />
      ) : error || !left ? (
        <Alert variant="error" className="m-5">
          <AlertDescription>
            Could not load this comparison: {error?.message ?? "The first webhook no longer exists."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="shrink-0 border-b bg-bg-subtle/20 px-4 py-5 sm:px-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-balance text-sm font-medium">Choose two captures</h2>
                  <p className="mt-1 text-pretty text-xs text-muted-foreground">
                    Pulseboard orders them by received time, then compares request and delivery data.
                  </p>
                </div>
                {right && (
                  <Badge variant="secondary" size="sm">
                    Earlier → later
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <WebhookSlot
                  label={ordered ? "Earlier" : "Base request"}
                  webhook={ordered?.[0].webhook ?? left}
                  onChange={() => setPickerSide(ordered?.[0].side ?? "left")}
                />
                <div className="hidden items-center justify-center text-muted-foreground lg:flex">
                  <ArrowRight className="size-4" aria-hidden="true" />
                </div>
                {ordered ? (
                  <WebhookSlot
                    label="Later"
                    webhook={ordered[1].webhook}
                    onChange={() => setPickerSide(ordered[1].side)}
                  />
                ) : (
                  <Card className="min-h-36 border-dashed">
                    <CardHeader>
                      <CardTitle className="text-sm">Comparison request</CardTitle>
                      <CardDescription className="text-xs">
                        Pick another capture. Matching provider and event types are ranked first.
                      </CardDescription>
                    </CardHeader>
                    <CardPanel>
                      <Button onClick={() => setPickerSide("right")} variant="outline" size="sm">
                        <GitCompareArrows data-icon="inline-start" />
                        Choose comparison
                      </Button>
                    </CardPanel>
                  </Card>
                )}
              </div>
            </div>
          </section>

          {ordered ? (
            <div className="min-h-0 flex-1">
              <WebhookCompare current={ordered[0].webhook} comparison={ordered[1].webhook} />
            </div>
          ) : (
            <Empty className="min-h-0 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
                <EmptyTitle>Choose a second webhook</EmptyTitle>
                <EmptyDescription>
                  The diff workspace will appear here without changing the webhook inspector.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setPickerSide("right")}>Choose comparison</Button>
              </EmptyContent>
            </Empty>
          )}

          {pickerReference && pickerSide && (
            <WebhookComparePicker
              open
              current={pickerReference}
              onClose={() => setPickerSide(null)}
              onSelect={(webhook) => choose(pickerSide, webhook)}
            />
          )}
        </>
      )}
    </div>
  );
}

function WebhookSlot({
  label,
  webhook,
  onChange,
}: {
  label: string;
  webhook: Webhook;
  onChange: () => void;
}): React.ReactElement {
  return (
    <Card className="min-w-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
        <CardDescription className="font-mono text-xs">
          {new Date(webhook.receivedAt).toLocaleString()}
        </CardDescription>
        <CardAction>
          <Button onClick={onChange} variant="ghost" size="sm">Change</Button>
        </CardAction>
      </CardHeader>
      <CardPanel className="flex min-w-0 flex-col gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <SourceBadge source={webhook.source} />
          <span className="truncate font-mono text-sm font-medium">
            {webhook.eventType || webhook.path}
          </span>
          <SignatureBadge status={webhook.signatureStatus} notes={webhook.signatureNotes} />
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <code className="truncate font-mono">{webhook.method} {webhook.path}</code>
          <span className="shrink-0 tabular-nums">{formatRelativeTime(webhook.receivedAt)}</span>
        </div>
      </CardPanel>
    </Card>
  );
}

function ComparePageSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-14" />
      <Skeleton className="min-h-72 flex-1" />
    </div>
  );
}
