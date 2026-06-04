import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, Plus, Send, ShieldOff, X, XCircle } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { SourceBadge } from "../components/SourceBadge.js";
import { api } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { PRESETS, findPreset, type Preset } from "../lib/presets.js";
import { cn } from "../lib/cn.js";
import { Button, Card, Checkbox, Input, Select, Textarea } from "../components/coss-ui/index.js";

type HeaderRow = { id: number; key: string; value: string };
let headerRowCounter = 0;

const newRow = (key = "", value = ""): HeaderRow => ({ id: ++headerRowCounter, key, value });

const SOURCE_OPTIONS = [
  "unknown",
  "stripe",
  "github",
  "shopify",
  "clerk",
  "polar",
  "slack",
  "linear",
  "vercel",
  "paddle",
  "twilio",
  "discord",
];

const METHODS = ["POST", "PUT", "PATCH", "DELETE", "GET"];

export function ComposePage(): React.ReactElement {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [presetId, setPresetId] = useState("blank");
  const [method, setMethod] = useState("POST");
  const [path, setPath] = useState("/webhook");
  const [target, setTarget] = useState("");
  const [source, setSource] = useState("unknown");
  const [autoSign, setAutoSign] = useState(true);
  const [headers, setHeaders] = useState<HeaderRow[]>([newRow("content-type", "application/json")]);
  const [body, setBody] = useState("{}");
  const [parseError, setParseError] = useState<string | null>(null);

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const { data: secretsData } = useQuery({ queryKey: ["secrets"], queryFn: api.secrets });

  const sourceHasSecret = useMemo(() => {
    return secretsData?.secrets.some((s) => s.source === source && s.configured) ?? false;
  }, [secretsData, source]);

  // When the user picks a preset, populate form fields. Don't blow away their
  // edits to fields the preset doesn't speak to (e.g. target).
  const applyPreset = (preset: Preset): void => {
    setPresetId(preset.id);
    setSource(preset.source);
    setPath(preset.defaultPath);
    setBody(preset.sampleBody);
    setParseError(null);
    const next: HeaderRow[] = [newRow("content-type", "application/json")];
    if (preset.extraHeaders) {
      for (const [k, v] of Object.entries(preset.extraHeaders)) next.push(newRow(k, v));
    }
    setHeaders(next);
  };

  // If the user switches source and we'd auto-sign but have no secret, surface
  // that — but don't toggle their choice for them.
  useEffect(() => {
    if (autoSign && !sourceHasSecret && source !== "unknown") {
      // Just leave the toggle on; the UI will show a warning next to it.
    }
  }, [autoSign, sourceHasSecret, source]);

  const send = useMutation({
    mutationFn: () =>
      api.send({
        method,
        path,
        target: target.trim() || undefined,
        headers: headersToObject(headers),
        body,
        source,
        autoSign,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["webhook-sources"] });
    },
  });

  const updateHeader = (id: number, patch: Partial<HeaderRow>): void => {
    setHeaders((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeHeader = (id: number): void => {
    setHeaders((rows) => rows.filter((r) => r.id !== id));
  };
  const addHeader = (): void => setHeaders((rows) => [...rows, newRow()]);

  const formatJson = (): void => {
    try {
      setBody(JSON.stringify(JSON.parse(body), null, 2));
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };
  const minifyJson = (): void => {
    try {
      setBody(JSON.stringify(JSON.parse(body)));
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const targetPlaceholder = health?.forwardTo ?? "http://localhost:3000";
  const canSend = (target.trim() || health?.forwardTo) && !send.isPending;
  const readonly = health?.readonly ?? false;

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Compose" subtitle="Send a webhook to your local app" />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-5">
          {readonly && (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              Pulseboard is running in read-only mode — sending is disabled.
            </div>
          )}

          {/* Preset */}
          <Section title="Preset">
            <Select
              value={presetId}
              onChange={(e) => {
                const preset = findPreset(e.target.value);
                if (preset) applyPreset(preset);
              }}
              className="w-full"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
            <p className="mt-1.5 text-2xs text-fg-subtle">
              Picks a sample body, default path, and the right source for auto-signing.
            </p>
          </Section>

          {/* Request line */}
          <Section title="Request">
            <div className="flex items-center gap-2">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs focus:border-fg focus:outline-none"
              >
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
              <Input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path"
                className="flex-1 font-mono"
              />
            </div>

            <div className="mt-2">
              <label className="block text-2xs font-medium uppercase tracking-wider text-fg-subtle">Target</label>
              <Input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={targetPlaceholder}
                className="mt-1 w-full font-mono text-xs"
              />
              <p className="mt-1 text-2xs text-fg-subtle">
                Leave empty to use the configured forward target. Sender will POST to{" "}
                <code className="font-mono">{(target.trim() || targetPlaceholder)}{path}</code>.
              </p>
            </div>
          </Section>

          {/* Source + sign */}
          <Section title="Identity">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <SourceBadge source={source} />
                <Select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="text-xs"
                >
                  {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>

              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={autoSign}
                  onChange={(e) => setAutoSign(e.target.checked)}
                />
                <span>Auto-sign with stored secret</span>
              </label>
            </div>

            {autoSign && source !== "unknown" && !sourceHasSecret && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-2xs text-warning">
                <ShieldOff className="h-3 w-3" />
                No <span className="font-mono">{source}</span> secret in Settings — signature header won&apos;t be added.
              </div>
            )}
          </Section>

          {/* Headers */}
          <Section title={`Headers (${headers.length})`}>
            <div className="space-y-1.5">
              {headers.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateHeader(row.id, { key: e.target.value })}
                    placeholder="header name"
                    className="w-48 shrink-0 font-mono text-xs"
                  />
                  <Input
                    type="text"
                    value={row.value}
                    onChange={(e) => updateHeader(row.id, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    onClick={() => removeHeader(row.id)}
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
                onClick={addHeader}
                variant="outline"
                size="xs"
                className="mt-1 border-dashed"
              >
                <Plus className="h-3 w-3" />
                Add header
              </Button>
            </div>
            <p className="mt-2 text-2xs text-fg-subtle">
              Signature headers are added automatically when auto-sign is on.
            </p>
          </Section>

          {/* Body */}
          <Section title="Body">
            <div className="mb-2 flex items-center gap-2">
              <Button
                onClick={formatJson}
                variant="outline"
                size="xs"
              >
                Format JSON
              </Button>
              <Button
                onClick={minifyJson}
                variant="outline"
                size="xs"
              >
                Minify
              </Button>
              <span className="ml-auto text-2xs text-fg-subtle">{body.length} chars</span>
            </div>
            {parseError && (
              <div className="mb-2 rounded border border-danger/30 bg-danger/5 px-2 py-1 text-2xs text-danger">
                {parseError}
              </div>
            )}
            <Textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (parseError) setParseError(null);
              }}
              rows={14}
              spellCheck={false}
              className="font-mono text-xs leading-relaxed"
              placeholder="Request body"
            />
          </Section>

          {/* Send */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => send.mutate()}
              disabled={!canSend || readonly}
              variant="default"
              size="md"
            >
              <Send className={cn("h-3.5 w-3.5", send.isPending && "animate-pulse")} />
              {send.isPending ? "Sending…" : "Send"}
            </Button>
            {!health?.forwardTo && !target.trim() && (
              <span className="text-xs text-warning">Set a target or configure --forward to send.</span>
            )}
          </div>

          {/* Result */}
          {send.data && (
            <ResultPanel
              status={send.data.result.status}
              durationMs={send.data.result.durationMs}
              error={send.data.result.error}
              signedWith={send.data.signedWith}
              id={send.data.id}
              onInspect={() => navigate("/")}
            />
          )}
          {send.error && (
            <div className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
              {(send.error as Error).message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Card>
      <h2 className="mb-3 text-2xs font-medium uppercase tracking-wider text-fg-subtle">{title}</h2>
      {children}
    </Card>
  );
}

function ResultPanel({
  status,
  durationMs,
  error,
  signedWith,
  onInspect,
}: {
  status: number | null;
  durationMs: number;
  error: string | null;
  signedWith: string | null;
  id: string;
  onInspect: () => void;
}): React.ReactElement {
  const ok = status != null && status >= 200 && status < 300;
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        error || (status != null && status >= 400)
          ? "border-danger/30 bg-danger/5"
          : ok
            ? "border-success/30 bg-success/5"
            : "border-border bg-bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {error || (status != null && status >= 400) ? (
            <XCircle className="h-4 w-4 text-danger" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success" />
          )}
          <span className="text-sm font-medium">
            {error ? "Failed" : ok ? `Delivered → ${status}` : status != null ? `Response → ${status}` : "Sent"}
          </span>
          <span className="text-xs text-fg-subtle">{formatDuration(durationMs)}</span>
          {signedWith && (
            <span className="rounded bg-success/15 px-1.5 py-0.5 text-2xs text-success">
              signed with {signedWith}
            </span>
          )}
        </div>
        <Button
          onClick={onInspect}
          variant="ghost"
          size="sm"
        >
          Inspect in feed →
        </Button>
      </div>
      {error && (
        <div className="mt-2 rounded border border-danger/20 bg-bg p-2 font-mono text-2xs text-danger">{error}</div>
      )}
    </div>
  );
}

function headersToObject(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value;
  }
  return out;
}
