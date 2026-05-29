import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, Terminal } from "lucide-react";
import { api, type Webhook } from "../lib/api.js";
import { formatRelativeTime, formatDuration } from "../lib/format.js";
import { SourceBadge } from "./SourceBadge.js";
import { cn } from "../lib/cn.js";

type Tab = "body" | "headers" | "forward";

export function WebhookDetail({
  webhook,
  readonly,
}: {
  webhook: Webhook;
  readonly: boolean;
}): React.ReactElement {
  const [tab, setTab] = useState<Tab>("body");
  const [copied, setCopied] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const replay = useMutation({
    mutationFn: () => api.replay(webhook.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
    },
  });

  const headers = JSON.parse(webhook.headersJson) as Record<string, string>;

  const copy = (text: string, key: string): void => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const asCurl = buildCurl(webhook, headers);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 font-mono text-2xs font-semibold", methodColor(webhook.method))}>
            {webhook.method}
          </span>
          <span className="font-mono text-sm font-medium">{webhook.path}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SourceBadge source={webhook.source} />
          {webhook.eventType && (
            <span className="rounded bg-bg-muted px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
              {webhook.eventType}
            </span>
          )}
          <span className="text-2xs text-fg-subtle">{formatRelativeTime(webhook.receivedAt)}</span>
          {webhook.replayOf && (
            <span className="rounded bg-info/15 px-1.5 py-0.5 text-2xs text-info">replay</span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          {!readonly && (
            <button
              type="button"
              onClick={() => replay.mutate()}
              disabled={replay.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-bg-muted",
                replay.isPending && "cursor-wait opacity-50",
              )}
            >
              <RefreshCw className={cn("h-3 w-3", replay.isPending && "animate-spin")} />
              Replay
            </button>
          )}
          <button
            type="button"
            onClick={() => copy(asCurl, "curl")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-bg-muted"
          >
            {copied === "curl" ? <Check className="h-3 w-3 text-success" /> : <Terminal className="h-3 w-3" />}
            {copied === "curl" ? "Copied!" : "Copy as cURL"}
          </button>
        </div>

        {replay.data && (
          <div className="mt-2 text-xs">
            {replay.data.result.error ? (
              <span className="text-danger">Replay failed: {replay.data.result.error}</span>
            ) : (
              <span className="text-success">
                Replayed → {replay.data.result.status} in {formatDuration(replay.data.result.durationMs)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-5">
        <TabButton active={tab === "body"} onClick={() => setTab("body")}>Body</TabButton>
        <TabButton active={tab === "headers"} onClick={() => setTab("headers")}>
          Headers <span className="text-fg-subtle">({Object.keys(headers).length})</span>
        </TabButton>
        <TabButton active={tab === "forward"} onClick={() => setTab("forward")}>Forwarding</TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "body" && <BodyView body={webhook.body} contentType={webhook.contentType} onCopy={copy} copied={copied} />}
        {tab === "headers" && <HeadersView headers={headers} />}
        {tab === "forward" && <ForwardView webhook={webhook} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-2 py-2.5 text-xs font-medium transition-colors",
        active ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
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
  if (!body) {
    return <div className="text-sm text-fg-subtle">No body</div>;
  }

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
      <button
        type="button"
        onClick={() => onCopy(body, "body")}
        className="absolute right-0 top-0 inline-flex items-center gap-1 rounded border border-border bg-bg px-1.5 py-1 text-2xs text-fg-muted hover:bg-bg-muted"
      >
        {copied === "body" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        {display}
      </pre>
    </div>
  );
}

function HeadersView({ headers }: { headers: Record<string, string> }): React.ReactElement {
  return (
    <div className="space-y-1">
      {Object.entries(headers).map(([key, value]) => (
        <div key={key} className="flex gap-3 border-b border-border/50 py-1.5 text-xs">
          <span className="w-48 shrink-0 font-mono font-medium text-fg-muted">{key}</span>
          <span className="break-all font-mono text-fg">{value}</span>
        </div>
      ))}
    </div>
  );
}

function ForwardView({ webhook }: { webhook: Webhook }): React.ReactElement {
  if (!webhook.forwardedTo) {
    return (
      <div className="text-sm text-fg-subtle">
        Not forwarded — Studio is running in capture-only mode. Start with{" "}
        <code className="font-mono text-fg-muted">--forward &lt;url&gt;</code> to proxy webhooks.
      </div>
    );
  }

  const ok = webhook.forwardStatus != null && webhook.forwardStatus >= 200 && webhook.forwardStatus < 300;

  return (
    <div className="space-y-3 text-sm">
      <Row label="Target" value={<span className="font-mono text-xs">{webhook.forwardedTo}</span>} />
      <Row
        label="Status"
        value={
          webhook.forwardError ? (
            <span className="text-danger">Error</span>
          ) : (
            <span className={ok ? "text-success" : "text-danger"}>{webhook.forwardStatus}</span>
          )
        }
      />
      {webhook.forwardDurationMs != null && (
        <Row label="Duration" value={formatDuration(webhook.forwardDurationMs)} />
      )}
      {webhook.forwardError && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 font-mono text-xs text-danger">
          {webhook.forwardError}
        </div>
      )}
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

function methodColor(method: string): string {
  switch (method) {
    case "GET": return "bg-info/15 text-info";
    case "POST": return "bg-success/15 text-success";
    case "PUT": return "bg-warning/15 text-warning";
    case "DELETE": return "bg-danger/15 text-danger";
    default: return "bg-bg-muted text-fg-muted";
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
