import { useMemo, useState } from "react";
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
const METHOD_OPTIONS = METHODS.map((method) => ({ value: method, label: method }));
const SOURCE_SELECT_OPTIONS = SOURCE_OPTIONS.map((source) => ({ value: source, label: source }));

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

  const targetPlaceholder = health?.forwardTargets[0] ?? "http://localhost:3000";
  const canSend = (target.trim() || health?.forwardTargets.length) && !send.isPending;
  const readonly = health?.readonly ?? false;

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Compose" subtitle="Send a webhook to your local app" />

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {readonly && (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning xl:col-span-2">
              Pulseboard is running in read-only mode — sending is disabled.
            </div>
          )}

          <div className="space-y-5">
            <Section title="Request">
              <div className="grid gap-3">
                <Field label="Preset">
                  <Select
                    value={presetId}
                    options={PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
                    onChange={(next) => {
                      const preset = findPreset(next);
                      if (preset) applyPreset(preset);
                    }}
                    className="w-full"
                    ariaLabel="Webhook preset"
                  />
                </Field>
                <div className="grid grid-cols-[7rem_1fr] gap-2">
                  <Select value={method} options={METHOD_OPTIONS} onChange={setMethod} className="font-mono text-xs" ariaLabel="HTTP method" />
                  <Input
                    aria-label="Request path"
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="/path"
                    className="font-mono"
                  />
                </div>

                <Field label="Target">
                  <Input
                    aria-label="Forward target"
                    type="text"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={targetPlaceholder}
                    className="w-full font-mono text-xs"
                  />
                  <p className="mt-1 text-2xs text-fg-subtle">
                    Leave empty to use configured routing. Custom targets must match a configured or allowlisted host.
                  </p>
                </Field>
              </div>
            </Section>

            <Section title={`Headers (${headers.length})`}>
              <div className="space-y-1.5">
                {headers.map((row, index) => (
                  <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      aria-label={`Header ${index + 1} name`}
                      type="text"
                      value={row.key}
                      onChange={(e) => updateHeader(row.id, { key: e.target.value })}
                      placeholder="header name"
                      className="w-full shrink-0 font-mono text-xs sm:w-48"
                    />
                    <Input
                      aria-label={`Header ${index + 1} value`}
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
                <Button onClick={addHeader} variant="outline" size="xs" className="mt-1 border-dashed">
                  <Plus className="h-3 w-3" />
                  Add header
                </Button>
              </div>
              <p className="mt-2 text-2xs text-fg-subtle">
                Signature headers are added automatically when auto-sign is on.
              </p>
            </Section>

            <Section title="Body">
              <div className="mb-2 flex items-center gap-2">
                <Button onClick={formatJson} variant="outline" size="xs">
                  Format JSON
                </Button>
                <Button onClick={minifyJson} variant="outline" size="xs">
                  Minify
                </Button>
                <span className="ml-auto text-2xs text-fg-subtle">{body.length} chars</span>
              </div>
              {parseError && (
                <div id="compose-body-error" role="alert" className="mb-2 rounded border border-danger/30 bg-danger/5 px-2 py-1 text-2xs text-danger">
                  {parseError}
                </div>
              )}
              <Textarea
                aria-label="Webhook request body"
                aria-invalid={parseError ? true : undefined}
                aria-describedby={parseError ? "compose-body-error" : undefined}
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
          </div>

          <div className="space-y-5">
            <Section title="Identity">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <SourceBadge source={source} />
                  <Select
                    value={source}
                    options={SOURCE_SELECT_OPTIONS}
                    onChange={setSource}
                    className="w-40 text-xs"
                    ariaLabel="Webhook source"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-bg-muted/30 px-3 py-2 text-xs">
                  <span>Auto-sign with stored secret</span>
                  <Checkbox checked={autoSign} onChange={(e) => setAutoSign(e.target.checked)} />
                </label>
              </div>

              {autoSign && source !== "unknown" && !sourceHasSecret && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-2xs text-warning">
                  <ShieldOff className="h-3 w-3" />
                  No <span className="font-mono">{source}</span> secret in Settings.
                </div>
              )}
            </Section>

            <Section title="Send">
              <Button
                onClick={() => send.mutate()}
                disabled={!canSend || readonly}
                variant="default"
                size="md"
                className="w-full justify-center"
              >
                <Send className={cn("h-3.5 w-3.5", send.isPending && "animate-pulse")} />
                {send.isPending ? "Sending…" : "Send"}
              </Button>
              {!health?.forwardTargets.length && !target.trim() && (
                <div className="mt-3 text-xs text-warning">Set a target or configure --forward to send.</div>
              )}
            </Section>

            {send.data && (
              <ResultPanel
                status={send.data.result.status}
                durationMs={send.data.result.durationMs}
                error={send.data.result.error}
                signedWith={send.data.signedWith}
                id={send.data.id}
                onInspect={() => navigate(`/webhooks/${send.data.id}`)}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-fg-subtle">{label}</span>
      {children}
    </label>
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
