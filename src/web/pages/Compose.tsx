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
              Studio is running in read-only mode — sending is disabled.
            </div>
          )}

          {/* Preset */}
          <Section title="Preset">
            <select
              value={presetId}
              onChange={(e) => {
                const preset = findPreset(e.target.value);
                if (preset) applyPreset(preset);
              }}
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-fg focus:outline-none"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-2xs text-fg-subtle">
              Picks a sample body, default path, and the right source for auto-signing.
            </p>
          </Section>

          {/* Request line */}
          <Section title="Request">
            <div className="flex items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs focus:border-fg focus:outline-none"
              >
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path"
                className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm focus:border-fg focus:outline-none"
              />
            </div>

            <div className="mt-2">
              <label className="block text-2xs font-medium uppercase tracking-wider text-fg-subtle">Target</label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={targetPlaceholder}
                className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs focus:border-fg focus:outline-none"
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
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs focus:border-fg focus:outline-none"
                >
                  {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={autoSign}
                  onChange={(e) => setAutoSign(e.target.checked)}
                  className="h-3.5 w-3.5"
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
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateHeader(row.id, { key: e.target.value })}
                    placeholder="header name"
                    className="w-48 shrink-0 rounded border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-fg focus:outline-none"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => updateHeader(row.id, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 rounded border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-fg focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeHeader(row.id)}
                    className="text-fg-subtle hover:text-danger"
                    aria-label="Remove header"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addHeader}
                className="mt-1 inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-2xs text-fg-muted hover:bg-bg-muted"
              >
                <Plus className="h-3 w-3" />
                Add header
              </button>
            </div>
            <p className="mt-2 text-2xs text-fg-subtle">
              Signature headers are added automatically when auto-sign is on.
            </p>
          </Section>

          {/* Body */}
          <Section title="Body">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={formatJson}
                className="rounded border border-border px-2 py-0.5 text-2xs text-fg-muted hover:bg-bg-muted"
              >
                Format JSON
              </button>
              <button
                type="button"
                onClick={minifyJson}
                className="rounded border border-border px-2 py-0.5 text-2xs text-fg-muted hover:bg-bg-muted"
              >
                Minify
              </button>
              <span className="ml-auto text-2xs text-fg-subtle">{body.length} chars</span>
            </div>
            {parseError && (
              <div className="mb-2 rounded border border-danger/30 bg-danger/5 px-2 py-1 text-2xs text-danger">
                {parseError}
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (parseError) setParseError(null);
              }}
              rows={14}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-border bg-bg-muted/40 p-3 font-mono text-xs leading-relaxed focus:border-fg focus:outline-none"
              placeholder="Request body"
            />
          </Section>

          {/* Send */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => send.mutate()}
              disabled={!canSend || readonly}
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-fg/90",
                (!canSend || readonly) && "cursor-not-allowed opacity-50",
              )}
            >
              <Send className={cn("h-3.5 w-3.5", send.isPending && "animate-pulse")} />
              {send.isPending ? "Sending…" : "Send"}
            </button>
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
    <div className="pb-card p-4">
      <h2 className="mb-3 text-2xs font-medium uppercase tracking-wider text-fg-subtle">{title}</h2>
      {children}
    </div>
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
        <button
          type="button"
          onClick={onInspect}
          className="text-xs text-fg-muted hover:underline"
        >
          Inspect in feed →
        </button>
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
