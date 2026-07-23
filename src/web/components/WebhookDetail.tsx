import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Pencil, Plus, RefreshCw, Send, Terminal, X } from "lucide-react";
import { Link } from "wouter";
import { api, type DeliveryResult, type Webhook } from "../lib/api.js";
import { formatRelativeTime, formatDuration } from "../lib/format.js";
import { SourceBadge } from "./SourceBadge.js";
import { SignatureBadge } from "./SignatureBadge.js";
import { cn } from "../lib/cn.js";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

type Tab = "body" | "headers" | "forward";

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
}: {
  webhook: Webhook;
  readonly: boolean;
}): React.ReactElement {
  const [tab, setTab] = useState<Tab>("body");
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState<string>("");
  const [editedHeaders, setEditedHeaders] = useState<HeaderRow[]>([]);
  const queryClient = useQueryClient();

  const originalHeaders = JSON.parse(webhook.headersJson) as Record<string, string>;

  // Reset edit state whenever the inspected webhook changes.
  useEffect(() => {
    setEditing(false);
    setEditedBody(webhook.body ?? "");
    setEditedHeaders(toRows(originalHeaders));
    setTab("body");
    // Re-running this when headersJson changes covers replays/new captures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook.id]);

  const replay = useMutation({
    mutationFn: (overrides?: { body?: string; headers?: Record<string, string> }) =>
      api.replay(webhook.id, overrides),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
    },
  });

  const sendEdited = (): void => {
    const headers = fromRows(editedHeaders);
    // Only include keys that actually changed or were added — but for v1 we
    // just send everything edited. The server merges into the original, so
    // unchanged keys are still preserved if we don't send them. Keep it simple
    // by sending all current rows: the user's intent is "these are the headers".
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
    if (tab === "forward") setTab("body");
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
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-48 flex-1">
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
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
        className="min-h-40 border-b border-border bg-bg-subtle/30 px-5 py-3"
      >
        <h2 id="request-details-heading" className="mb-3 text-balance text-xs font-medium text-fg-muted">Request details</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
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
        onValueChange={(value) => setTab(value as Tab)}
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
          <BodyView body={webhook.body} contentType={webhook.contentType} onCopy={copy} copied={copied} />
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
            <ForwardView webhook={webhook} />
          </TabsPanel>
        )}
      </Tabs>
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
  contentType,
  onCopy,
  copied,
}: {
  body: string | null;
  contentType: string | null;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
}): React.ReactElement {
  if (!body) return <div className="text-sm text-fg-subtle">No body</div>;

  const isJson = contentType?.includes("json") ?? false;
  let display = body;
  if (isJson) {
    try {
      display = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      display = body;
    }
  }

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

function ForwardView({ webhook }: { webhook: Webhook }): React.ReactElement {
  if (!webhook.forwardedTo) {
    return (
      <div className="text-sm text-fg-subtle">
        Not forwarded — Pulseboard is running in capture-only mode. Start with{" "}
        <code className="font-mono text-fg-muted">--forward &lt;url&gt;</code> to proxy webhooks.
      </div>
    );
  }

  const deliveries: DeliveryResult[] = webhook.deliveriesJson
    ? JSON.parse(webhook.deliveriesJson) as DeliveryResult[]
    : [{
        target: webhook.forwardedTo,
        status: webhook.forwardStatus,
        durationMs: webhook.forwardDurationMs ?? 0,
        error: webhook.forwardError,
        responseHeaders: webhook.responseHeadersJson ? JSON.parse(webhook.responseHeadersJson) as Record<string, string> : {},
        responseBody: webhook.responseBody,
        responseContentType: webhook.responseContentType,
        responseBodyTruncated: webhook.responseBodyTruncated,
      }];

  return (
    <div className="space-y-4 text-sm">
      {deliveries.map((delivery, index) => {
        const ok = delivery.status != null && delivery.status >= 200 && delivery.status < 300;
        return (
          <section key={`${delivery.target}-${index}`} className="rounded-lg border border-border p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs break-all">{delivery.target}</span>
              <span className={cn("font-medium tabular-nums", ok ? "text-success" : "text-danger")}>
                {delivery.error ? "Error" : delivery.status}
              </span>
            </div>
            <Row label="Duration" value={formatDuration(delivery.durationMs)} />
            {delivery.error && (
              <Alert variant="error" className="mt-3 font-mono text-xs">
                <AlertDescription>{delivery.error}</AlertDescription>
              </Alert>
            )}
            {!delivery.error && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <div>
                  <div className="mb-1 text-2xs font-medium uppercase text-fg-subtle">Response headers</div>
                  {Object.keys(delivery.responseHeaders).length > 0 ? (
                    <HeadersView headers={delivery.responseHeaders} />
                  ) : (
                    <p className="text-xs text-fg-subtle">No response headers</p>
                  )}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-2xs font-medium uppercase text-fg-subtle">
                    <span>Response body</span>
                    {delivery.responseBodyTruncated && <span className="normal-case text-warning">First 64 KB shown</span>}
                  </div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-muted/40 p-3 font-mono text-xs text-fg">
                    {delivery.responseBody ?? "No response body"}
                  </pre>
                </div>
              </div>
            )}
          </section>
        );
      })}
      {webhook.replayCount > 0 && (
        <Row label="Replays" value={`${webhook.replayCount} · last ${formatRelativeTime(webhook.lastReplayedAt)}`} />
      )}
    </div>
  );
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
