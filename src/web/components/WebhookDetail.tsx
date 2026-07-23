import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, ChevronDown, Clock3, Copy, GitCompareArrows, Pencil, Plus, RefreshCw, RotateCcw, Send, Terminal, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { api, type DeliveryAttempt, type DeliveryTarget, type Webhook } from "../lib/api.js";
import { formatRelativeTime, formatDuration } from "../lib/format.js";
import { SourceBadge } from "./SourceBadge.js";
import { SignatureBadge } from "./SignatureBadge.js";
import { cn } from "../lib/cn.js";
import { formatJsonForDisplay } from "../lib/formatJson.js";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { diagnoseDelivery } from "../../shared/deliveryDiagnostics.js";
import { DeliveryDiagnostic } from "./DeliveryDiagnostic.js";
import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

export type WebhookDetailTab = "body" | "headers" | "forward";

type HeaderRow = { id: number; key: string; value: string };

let headerRowCounter = 0;
const toRows = (headers: Record<string, string>): HeaderRow[] =>
  Object.entries(headers).map(([key, value]) => ({ id: ++headerRowCounter, key, value }));
const fromRows = (rows: HeaderRow[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value;
  }
  return out;
};

export function WebhookDetail({
  webhook,
  readonly,
  tab,
  onTabChange,
}: {
  webhook: Webhook;
  readonly: boolean;
  tab: WebhookDetailTab;
  onTabChange: (tab: WebhookDetailTab) => void;
}): React.ReactElement {
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState<string>("");
  const [editedHeaders, setEditedHeaders] = useState<HeaderRow[]>([]);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const originalHeaders = JSON.parse(webhook.headersJson) as Record<string, string>;

  // Reset edit state whenever the inspected webhook changes.
  useEffect(() => {
    setEditing(false);
    setEditedBody(webhook.body ?? "");
    setEditedHeaders(toRows(originalHeaders));
    // Re-running this when headersJson changes covers replays/new captures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook.id]);

  const replay = useMutation({
    mutationFn: (overrides?: { body?: string; headers?: Record<string, string> }) =>
      api.replay(webhook.id, overrides),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook", webhook.id] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const sendEdited = (): void => {
    const headers = fromRows(editedHeaders);
    // The current rows are authoritative, so removing a row removes that
    // header from the replay. Redacted values are restored server-side.
    replay.mutate(
      { body: editedBody, headers },
      {
        onSuccess: () => {
          setEditing(false);
        },
      },
    );
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setEditedBody(webhook.body ?? "");
    setEditedHeaders(toRows(originalHeaders));
    replay.reset();
  };

  const startEdit = (): void => {
    setEditing(true);
    setEditedBody(webhook.body ?? "");
    setEditedHeaders(toRows(originalHeaders));
    if (tab === "forward") onTabChange("body");
    replay.reset();
  };

  const copy = (text: string, key: string): void => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const asCurl = buildCurl(webhook, originalHeaders);
  const forwardTargetCount = getForwardTargetCount(webhook);
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div data-testid="webhook-identity" className="min-h-20 border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div data-testid="webhook-metadata" className="min-w-48 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Badge variant={methodVariant(webhook.method)} size="sm" className="font-mono">
                {webhook.method}
              </Badge>
              <span className="min-w-0 break-all font-mono text-sm font-medium">{webhook.path}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SourceBadge source={webhook.source} />
              {webhook.eventType && (
                <Badge variant="secondary" size="sm" className="font-mono">
                  {webhook.eventType}
                </Badge>
              )}
              <SignatureBadge status={webhook.signatureStatus} notes={webhook.signatureNotes} />
              <span className="text-2xs text-fg-subtle">{formatRelativeTime(webhook.receivedAt)}</span>
              {webhook.replayOf && (
                <Badge variant="info" size="sm">
                  {webhook.sourceIp === "replay-edited" ? "edited replay" : "replay"}
                </Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div data-testid="webhook-actions" className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {editing ? (
              <>
                <Button
                  onClick={sendEdited}
                  disabled={replay.isPending}
                  variant="default"
                  size="sm"
                >
                  <Send className={cn("h-3 w-3", replay.isPending && "animate-pulse")} />
                  {replay.isPending ? "Sending…" : "Send edited"}
                </Button>
                <Button
                  onClick={cancelEdit}
                  disabled={replay.isPending}
                  variant="outline"
                  size="sm"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </Button>
                <span className="basis-full text-right text-2xs text-fg-subtle">
                  Editing — signature will be marked invalid
                </span>
              </>
            ) : (
              <>
                <Button
                  onClick={() => navigate(`/compare?left=${encodeURIComponent(webhook.id)}`)}
                  variant="outline"
                  size="sm"
                >
                  <GitCompareArrows data-icon="inline-start" />
                  Compare
                </Button>
                {!readonly && (
                  <>
                    <Button
                      onClick={() => replay.mutate(undefined)}
                      disabled={replay.isPending}
                      variant="outline"
                      size="sm"
                    >
                      <RefreshCw className={cn("h-3 w-3", replay.isPending && "animate-spin")} />
                      Replay
                    </Button>
                    <Button
                      onClick={startEdit}
                      variant="outline"
                      size="sm"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit & Replay
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => copy(asCurl, "curl")}
                  variant="outline"
                  size="sm"
                >
                  {copied === "curl" ? <Check className="h-3 w-3 text-success" /> : <Terminal className="h-3 w-3" />}
                  {copied === "curl" ? "Copied!" : "Copy as cURL"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <section
        aria-labelledby="request-details-heading"
        data-testid="request-details"
        className="flex min-h-40 flex-col justify-center border-b border-border bg-bg-subtle/30 px-5 py-3"
      >
        <h2 id="request-details-heading" className="mb-3 text-balance text-xs font-medium text-fg-muted">Request details</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 2xl:grid-cols-4">
          <DetailItem label="Received" value={formatExactTime(webhook.receivedAt)} />
          <DetailItem
            label="Request ID"
            value={
              <span className="flex min-w-0 items-center gap-1">
                <code className="truncate font-mono">{webhook.id}</code>
                <Button
                  onClick={() => copy(webhook.id, "id")}
                  variant="ghost"
                  size="icon-xs"
                  aria-label={copied === "id" ? "Request ID copied" : "Copy request ID"}
                >
                  {copied === "id" ? <Check className="text-success" /> : <Copy />}
                </Button>
              </span>
            }
          />
          <DetailItem label="Source IP" value={<code className="font-mono">{webhook.sourceIp ?? "Not captured"}</code>} />
          <DetailItem
            label="Content"
            value={`${webhook.contentType ?? "Unknown type"} · ${formatBytes(webhook.contentLength)}`}
          />
          <DetailItem
            label="Query"
            value={
              webhook.queryParams
                ? <code className="break-all font-mono">{webhook.queryParams}</code>
                : "No query parameters"
            }
          />
          <DetailItem
            label="Forward targets"
            value={`${forwardTargetCount} ${forwardTargetCount === 1 ? "target" : "targets"}`}
          />
          <DetailItem
            label="Replays"
            value={
              webhook.replayCount > 0
                ? `${webhook.replayCount} · last ${formatRelativeTime(webhook.lastReplayedAt)}`
                : "None"
            }
          />
          <DetailItem
            label="Replay origin"
            value={
              webhook.replayOf ? (
                <Link href={`/webhooks/${webhook.replayOf}`} className="font-mono text-foreground underline underline-offset-4">
                  Open original
                </Link>
              ) : "Original request"
            }
          />
        </dl>
      </section>

      <DeliveryDiagnosticStrip webhook={webhook} />

      {replay.data && !editing && (
        <div className="border-b border-border px-5 py-2 text-xs">
          {replay.data.result.error ? (
            <span className="text-danger">Replay failed: {replay.data.result.error}</span>
          ) : (
            <span className="text-success">
              Replayed → {replay.data.result.status} in {formatDuration(replay.data.result.durationMs)}
            </span>
          )}
        </div>
      )}
      {replay.error && (
        <div className="border-b border-border px-5 py-2">
          <Alert variant="error" className="py-2 text-xs">
            <AlertDescription>Replay failed: {replay.error.message}</AlertDescription>
          </Alert>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as WebhookDetailTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="underline"
          data-testid="webhook-tabs"
          className="h-16 w-full justify-start overflow-x-auto rounded-none border-b px-5 py-0"
        >
          <TabsTab value="body" className="h-16 rounded-none sm:h-16">Body {editing && <EditedDot />}</TabsTab>
          <TabsTab value="headers" className="h-16 rounded-none sm:h-16">
            Headers <span className="text-muted-foreground">({editing ? editedHeaders.length : Object.keys(originalHeaders).length})</span>
            {editing && <EditedDot />}
          </TabsTab>
          {!editing && <TabsTab value="forward" className="h-16 rounded-none sm:h-16">Forwarding</TabsTab>}
        </TabsList>

        <TabsPanel value="body" className="min-w-0 overflow-y-auto p-4 sm:p-5">
          {editing ? (
          <BodyEditor body={editedBody} onChange={setEditedBody} />
        ) : (
          <BodyView body={webhook.body} onCopy={copy} copied={copied} />
          )}
        </TabsPanel>
        <TabsPanel value="headers" className="min-w-0 overflow-y-auto p-4 sm:p-5">
          {editing ? (
          <HeadersEditor rows={editedHeaders} onChange={setEditedHeaders} />
        ) : (
          <HeadersView headers={originalHeaders} />
          )}
        </TabsPanel>
        {!editing && (
          <TabsPanel value="forward" className="min-w-0 overflow-y-auto p-4 sm:p-5">
            <ForwardView webhook={webhook} readonly={readonly} />
          </TabsPanel>
        )}
      </Tabs>
    </div>
  );
}

function DeliveryDiagnosticStrip({ webhook }: { webhook: Webhook }): React.ReactElement | null {
  const delivery = {
    forwardedTo: webhook.forwardedTo,
    forwardStatus: webhook.forwardStatus,
    forwardDurationMs: webhook.forwardDurationMs,
    forwardError: webhook.forwardError,
    signatureStatus: webhook.signatureStatus,
    signatureNotes: webhook.signatureNotes,
    path: webhook.path,
  };
  const diagnosis = diagnoseDelivery(delivery);
  if (diagnosis.severity === "success") return null;

  return (
    <div data-testid="delivery-diagnostic" className="border-b border-border px-5 py-3">
      <DeliveryDiagnostic delivery={delivery} />
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-xs text-fg-muted">
        {value}
      </dd>
    </div>
  );
}

function formatExactTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(timestamp));
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getForwardTargetCount(webhook: Webhook): number {
  if (webhook.deliveriesJson) {
    try {
      const deliveries = JSON.parse(webhook.deliveriesJson) as unknown;
      if (Array.isArray(deliveries)) return deliveries.length;
    } catch {
      // Fall back to the legacy single-target field.
    }
  }
  return webhook.forwardedTo ? 1 : 0;
}

function EditedDot(): React.ReactElement {
  return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warning" title="Editable" />;
}

function BodyView({
  body,
  onCopy,
  copied,
}: {
  body: string | null;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}): React.ReactElement {
  if (!body) return <div className="text-sm text-fg-subtle">No body</div>;

  const display = formatJsonForDisplay(body);

  return (
    <div className="relative">
      <Button
        onClick={() => onCopy(body, "body")}
        variant="outline"
        size="xs"
        className="absolute right-2 top-2 bg-bg"
        aria-label={copied === "body" ? "Body copied" : "Copy webhook body"}
      >
        {copied === "body" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </Button>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-bg-muted/40 p-3 pr-12 font-mono text-xs leading-relaxed">
        {display}
      </pre>
    </div>
  );
}

function BodyEditor({
  body,
  onChange,
}: {
  body: string;
  onChange: (next: string) => void;
}): React.ReactElement {
  const [parseError, setParseError] = useState<string | null>(null);

  const format = (): void => {
    try {
      const parsed = JSON.parse(body);
      onChange(JSON.stringify(parsed, null, 2));
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const minify = (): void => {
    try {
      const parsed = JSON.parse(body);
      onChange(JSON.stringify(parsed));
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          onClick={format}
          variant="outline"
          size="xs"
        >
          Format JSON
        </Button>
        <Button
          onClick={minify}
          variant="outline"
          size="xs"
        >
          Minify
        </Button>
        <span className="ml-auto text-2xs text-fg-subtle">{body.length} chars</span>
      </div>
      {parseError && (
        <Alert variant="error" className="py-2 text-xs">
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}
      <Textarea
        value={body}
        onChange={(e) => {
          onChange(e.target.value);
          if (parseError) setParseError(null);
        }}
        rows={20}
        spellCheck={false}
        className="font-mono text-xs leading-relaxed"
        placeholder="Body (raw)"
      />
    </div>
  );
}

function HeadersView({ headers }: { headers: Record<string, string> }): React.ReactElement {
  return (
    <div className="space-y-1">
      {Object.entries(headers).map(([key, value]) => (
        <div key={key} className="flex min-w-0 flex-col gap-1 border-b border-border/50 py-1.5 text-xs sm:flex-row sm:gap-3">
          <span className="break-all font-mono font-medium text-fg-muted sm:w-40 sm:shrink-0 lg:w-48">{key}</span>
          <span className="min-w-0 break-all font-mono text-fg">{value}</span>
        </div>
      ))}
    </div>
  );
}

function HeadersEditor({
  rows,
  onChange,
}: {
  rows: HeaderRow[];
  onChange: (next: HeaderRow[]) => void;
}): React.ReactElement {
  const update = (id: number, patch: Partial<HeaderRow>): void => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const remove = (id: number): void => {
    onChange(rows.filter((r) => r.id !== id));
  };
  const add = (): void => {
    onChange([...rows, { id: ++headerRowCounter, key: "", value: "" }]);
  };

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="text"
            value={row.key}
            onChange={(e) => update(row.id, { key: e.target.value })}
            placeholder="header name"
            className="w-full shrink-0 font-mono text-xs sm:w-48"
          />
          <Input
            type="text"
            value={row.value}
            onChange={(e) => update(row.id, { value: e.target.value })}
            placeholder="value"
            className="flex-1 font-mono text-xs"
          />
          <Button
            onClick={() => remove(row.id)}
            variant="danger"
            size="icon"
            className="h-7 w-7"
            aria-label="Remove header"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        onClick={add}
        variant="outline"
        size="xs"
        className="mt-2 border-dashed"
      >
        <Plus className="h-3 w-3" />
        Add header
      </Button>
    </div>
  );
}

function ForwardView({ webhook, readonly }: { webhook: Webhook; readonly: boolean }): React.ReactElement {
  const queryClient = useQueryClient();
  const deliveries = useQuery({
    queryKey: ["delivery-attempts", webhook.id],
    queryFn: () => api.deliveries(webhook.id),
    refetchInterval: (query) => query.state.data?.targets.some(
      (target) => target.state === "queued" || target.state === "retrying" || target.state === "sending",
    ) ? 1_000 : false,
  });
  const retry = useMutation({
    mutationFn: (attemptId: string) => api.retryDelivery(webhook.id, attemptId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["delivery-attempts", webhook.id] });
      void queryClient.invalidateQueries({ queryKey: ["webhook", webhook.id] });
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
      void queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("analytics-"),
      });
    },
  });
  const cancel = useMutation({
    mutationFn: (attemptId: string) => api.cancelDelivery(webhook.id, attemptId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["delivery-attempts", webhook.id] });
    },
  });

  if (!webhook.forwardedTo) {
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Send /></EmptyMedia>
          <EmptyTitle>Capture-only mode</EmptyTitle>
          <EmptyDescription>
            Start Pulseboard with <code className="font-mono">--forward &lt;url&gt;</code> to deliver captured webhooks.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (deliveries.isLoading) {
    return <div className="flex min-h-40 items-center justify-center"><Spinner aria-label="Loading delivery attempts" /></div>;
  }
  if (deliveries.error) {
    return (
      <Alert variant="error">
        <AlertDescription>Could not load delivery attempts: {deliveries.error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="delivery-timeline">
      {(deliveries.data?.targets ?? []).map((target) => (
        <DeliveryTargetCard
          key={target.attempts.at(-1)?.id ?? target.target}
          webhook={webhook}
          target={target}
          readonly={readonly}
          retrying={retry.isPending && retry.variables === target.attempts[0]?.id}
          cancelling={cancel.isPending && cancel.variables === target.attempts[0]?.id}
          onRetry={(attemptId) => retry.mutate(attemptId)}
          onCancel={(attemptId) => cancel.mutate(attemptId)}
        />
      ))}
      {retry.error && (
        <Alert variant="error"><AlertDescription>Retry failed: {retry.error.message}</AlertDescription></Alert>
      )}
      {cancel.error && (
        <Alert variant="error"><AlertDescription>Could not cancel retry: {cancel.error.message}</AlertDescription></Alert>
      )}
    </div>
  );
}

function DeliveryTargetCard({
  webhook,
  target,
  readonly,
  retrying,
  cancelling,
  onRetry,
  onCancel,
}: {
  webhook: Webhook;
  target: DeliveryTarget;
  readonly: boolean;
  retrying: boolean;
  cancelling: boolean;
  onRetry: (attemptId: string) => void;
  onCancel: (attemptId: string) => void;
}): React.ReactElement {
  const latest = target.attempts[0]!;
  const active = target.state === "queued" || target.state === "retrying" || target.state === "sending";
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="min-w-0">
          <CardTitle className="break-all font-mono text-sm">{target.target}</CardTitle>
          <CardDescription className="mt-1">
            {target.attempts.length} {target.attempts.length === 1 ? "attempt" : "attempts"}
            {target.nextAttemptAt ? ` · next retry ${formatRelativeTime(target.nextAttemptAt)}` : ""}
          </CardDescription>
        </div>
        <CardAction className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <DeliveryStateBadge state={target.state} />
          {!readonly && active && latest.state === "queued" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={() => onCancel(latest.id)}
            >
              <Ban data-icon="inline-start" />
              {cancelling ? "Cancelling…" : "Cancel retry"}
            </Button>
          ) : !readonly ? (
            <Button
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={() => onRetry(latest.id)}
            >
              <RotateCcw data-icon="inline-start" />
              {retrying ? "Retrying…" : "Retry target"}
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardPanel className="p-0">
        <div className="divide-y">
          {target.attempts.map((attempt, index) => (
            <DeliveryAttemptRow
              key={attempt.id}
              webhook={webhook}
              attempt={attempt}
              latest={index === 0}
            />
          ))}
        </div>
      </CardPanel>
    </Card>
  );
}

function DeliveryAttemptRow({
  webhook,
  attempt,
  latest,
}: {
  webhook: Webhook;
  attempt: DeliveryAttempt;
  latest: boolean;
}): React.ReactElement {
  const headers = attempt.responseHeadersJson
    ? JSON.parse(attempt.responseHeadersJson) as Record<string, string>
    : {};
  return (
    <Collapsible defaultOpen={latest}>
      <CollapsibleTrigger className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-bg-subtle/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={cn(
          "size-2 shrink-0 rounded-full",
          attempt.state === "delivered" && "bg-success",
          attempt.state === "failed" && "bg-danger",
          (attempt.state === "queued" || attempt.state === "sending") && "bg-warning",
          attempt.state === "cancelled" && "bg-fg-subtle",
        )} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Attempt {attempt.attemptNumber}</span>
            <Badge variant="secondary" size="sm">{attempt.trigger}</Badge>
            <span className="font-mono text-xs tabular-nums text-fg-muted">
              {attempt.statusCode ?? attempt.state}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
            <span>{formatExactTime(attempt.startedAt ?? attempt.scheduledAt)}</span>
            {attempt.durationMs != null && <span className="tabular-nums">{formatDuration(attempt.durationMs)}</span>}
          </span>
        </span>
        <ChevronDown className="shrink-0 text-fg-subtle" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="flex flex-col gap-4 border-t bg-bg-subtle/20 px-4 py-4">
          {(attempt.state === "queued" || attempt.state === "sending") ? (
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Clock3 className="size-4" aria-hidden="true" />
              {attempt.state === "queued"
                ? `Scheduled for ${formatExactTime(attempt.scheduledAt)}`
                : "Delivery is in progress"}
            </div>
          ) : (
            <>
              <DeliveryDiagnostic
                showSuccess
                delivery={{
                  forwardedTo: attempt.target,
                  forwardStatus: attempt.statusCode,
                  forwardDurationMs: attempt.durationMs,
                  forwardError: attempt.error,
                  signatureStatus: "not_applicable",
                  path: webhook.path,
                }}
              />
              {attempt.error && (
                <Alert variant="error" className="font-mono text-xs">
                  <AlertDescription>{attempt.error}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-balance text-xs font-medium">Response headers</h3>
                  <div className="mt-2">
                    {Object.keys(headers).length > 0
                      ? <HeadersView headers={headers} />
                      : <p className="text-xs text-fg-subtle">No response headers</p>}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-balance text-xs font-medium">Response body</h3>
                    {attempt.responseBodyTruncated && <Badge variant="warning" size="sm">First 64 KB</Badge>}
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-muted/40 p-3 font-mono text-xs text-fg">
                    {attempt.responseBody ? formatJsonForDisplay(attempt.responseBody) : "No response body"}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function DeliveryStateBadge({ state }: { state: DeliveryTarget["state"] }): React.ReactElement {
  const config: Record<DeliveryTarget["state"], {
    label: string;
    variant: "success" | "error" | "warning" | "secondary";
  }> = {
    queued: { label: "Queued", variant: "warning" },
    sending: { label: "Sending", variant: "warning" },
    delivered: { label: "Delivered", variant: "success" },
    failed: { label: "Failed", variant: "error" },
    retrying: { label: "Retrying", variant: "warning" },
    exhausted: { label: "Exhausted", variant: "error" },
    cancelled: { label: "Cancelled", variant: "secondary" },
  };
  return <Badge variant={config[state].variant}>{config[state].label}</Badge>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function methodVariant(method: string): "info" | "success" | "warning" | "error" | "secondary" {
  switch (method) {
    case "GET": return "info";
    case "POST": return "success";
    case "PUT": return "warning";
    case "DELETE": return "error";
    default: return "secondary";
  }
}

function buildCurl(webhook: Webhook, headers: Record<string, string>): string {
  const lines = [`curl -X ${webhook.method} '${webhook.forwardedTo ?? "http://localhost:3000"}${webhook.path}'`];
  for (const [key, value] of Object.entries(headers)) {
    if (key === "host" || key === "content-length") continue;
    lines.push(`  -H '${key}: ${value.replace(/'/g, "'\\''")}'`);
  }
  if (webhook.body) {
    lines.push(`  -d '${webhook.body.replace(/'/g, "'\\''")}'`);
  }
  return lines.join(" \\\n");
}
