import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, Pencil, Plus, RefreshCw, Send, Terminal, X } from "lucide-react";
import { api, type Webhook } from "../lib/api.js";
import { formatRelativeTime, formatDuration } from "../lib/format.js";
import { SourceBadge } from "./SourceBadge.js";
import { SignatureBadge } from "./SignatureBadge.js";
import { cn } from "../lib/cn.js";
import { Button, Input, Textarea } from "./coss-ui/index.js";

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
  onBack,
}: {
  webhook: Webhook;
  readonly: boolean;
  onBack?: () => void;
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-5 py-4">
        {onBack && (
          <Button onClick={onBack} variant="ghost" size="sm" className="mb-3 md:hidden">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to webhooks
          </Button>
        )}
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
          <SignatureBadge status={webhook.signatureStatus} notes={webhook.signatureNotes} />
          <span className="text-2xs text-fg-subtle">{formatRelativeTime(webhook.receivedAt)}</span>
          {webhook.replayOf && (
            <span className="rounded bg-info/15 px-1.5 py-0.5 text-2xs text-info">
              {webhook.sourceIp === "replay-edited" ? "edited replay" : "replay"}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
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
              <span className="ml-1 text-2xs text-fg-subtle">
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

        {replay.data && !editing && (
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
        {replay.error && (
          <div role="alert" className="mt-2 text-xs text-danger">
            Replay failed: {replay.error.message}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-5">
        <TabButton active={tab === "body"} onClick={() => setTab("body")}>
          Body {editing && <EditedDot />}
        </TabButton>
        <TabButton active={tab === "headers"} onClick={() => setTab("headers")}>
          Headers <span className="text-fg-subtle">({editing ? editedHeaders.length : Object.keys(originalHeaders).length})</span>
          {editing && <EditedDot />}
        </TabButton>
        {!editing && (
          <TabButton active={tab === "forward"} onClick={() => setTab("forward")}>Forwarding</TabButton>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "body" && (editing ? (
          <BodyEditor body={editedBody} onChange={setEditedBody} />
        ) : (
          <BodyView body={webhook.body} contentType={webhook.contentType} onCopy={copy} copied={copied} />
        ))}
        {tab === "headers" && (editing ? (
          <HeadersEditor rows={editedHeaders} onChange={setEditedHeaders} />
        ) : (
          <HeadersView headers={originalHeaders} />
        ))}
        {tab === "forward" && !editing && <ForwardView webhook={webhook} />}
      </div>
    </div>
  );
}

function EditedDot(): React.ReactElement {
  return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warning" title="Editable" />;
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
    <Button
      onClick={onClick}
      variant="ghost"
      className={cn(
        "border-b-2 px-2 py-2.5 text-xs font-medium transition-colors",
        active ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </Button>
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
        className="absolute right-0 top-0 bg-bg"
        aria-label={copied === "body" ? "Body copied" : "Copy webhook body"}
      >
        {copied === "body" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </Button>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-bg-muted/40 p-3 font-mono text-xs leading-relaxed">
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
        <div className="rounded border border-danger/30 bg-danger/5 px-2 py-1 text-2xs text-danger">
          {parseError}
        </div>
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
        <div key={key} className="flex gap-3 border-b border-border/50 py-1.5 text-xs">
          <span className="w-48 shrink-0 font-mono font-medium text-fg-muted">{key}</span>
          <span className="break-all font-mono text-fg">{value}</span>
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
