import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, Plus, Send, ShieldOff, X, XCircle } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { api } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { PRESETS, findPreset, type Preset } from "../lib/presets.js";
import { cn } from "../lib/cn.js";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field as CossField, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { PulseboardSelect as Select } from "../components/PulseboardSelect.js";

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
  const [editorTab, setEditorTab] = useState<"body" | "headers">("body");

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

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          {readonly && (
            <Alert variant="warning">
              <AlertDescription>Pulseboard is running in read-only mode — sending is disabled.</AlertDescription>
            </Alert>
          )}

          <Card className="overflow-hidden">
            <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-end">
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
              <Field label="Source">
                <Select value={source} options={SOURCE_SELECT_OPTIONS} onChange={setSource} className="w-full capitalize" ariaLabel="Webhook source" />
              </Field>
              <div className="pb-0.5 sm:col-span-2 lg:col-span-1">
                <CossField className="w-auto">
                  <FieldLabel className="h-8 cursor-pointer gap-2 whitespace-nowrap rounded-lg border px-3 text-xs">
                    <Checkbox checked={autoSign} onCheckedChange={(checked) => setAutoSign(checked === true)} />
                    Auto-sign
                  </FieldLabel>
                </CossField>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2">
                <Field label="Method">
                  <Select value={method} options={METHOD_OPTIONS} onChange={setMethod} className="w-full font-mono text-xs" ariaLabel="HTTP method" />
                </Field>
                <Field label="Path">
                  <Input aria-label="Request path" value={path} onChange={(event) => setPath(event.target.value)} className="font-mono" />
                </Field>
              </div>
              <Field label="Forward target">
                <Input
                  aria-label="Forward target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={targetPlaceholder}
                  className="font-mono text-xs"
                />
              </Field>

              {autoSign && source !== "unknown" && !sourceHasSecret && (
                <Alert variant="warning" className="py-2 text-xs">
                  <ShieldOff className="size-3" />
                  <AlertDescription>No <span className="font-mono">{source}</span> secret configured.</AlertDescription>
                </Alert>
              )}

              <Tabs value={editorTab} onValueChange={(value) => setEditorTab(value as "body" | "headers")} className="gap-0">
                <TabsList variant="underline" className="w-full justify-start rounded-none border-b">
                  <TabsTab value="body">Body</TabsTab>
                  <TabsTab value="headers">Headers <span className="text-muted-foreground">({headers.length})</span></TabsTab>
                </TabsList>
                <TabsPanel value="body" className="pt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Button onClick={formatJson} variant="outline" size="sm">Format JSON</Button>
                    <Button onClick={minifyJson} variant="outline" size="sm">Minify</Button>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{body.length} chars</span>
                  </div>
                  {parseError && (
                    <Alert id="compose-body-error" variant="error" className="mb-2 py-2 text-xs">
                      <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                  )}
                  <Textarea
                    aria-label="Webhook request body"
                    aria-invalid={parseError ? true : undefined}
                    aria-describedby={parseError ? "compose-body-error" : undefined}
                    value={body}
                    onChange={(event) => {
                      setBody(event.target.value);
                      if (parseError) setParseError(null);
                    }}
                    rows={9}
                    spellCheck={false}
                    className="min-h-44 resize-y font-mono text-xs leading-relaxed"
                  />
                </TabsPanel>
                <TabsPanel value="headers" className="space-y-2 pt-4">
                  {headers.map((row, index) => (
                    <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 sm:grid-cols-[minmax(9rem,0.4fr)_minmax(0,1fr)_2rem]">
                      <Input aria-label={`Header ${index + 1} name`} value={row.key} onChange={(event) => updateHeader(row.id, { key: event.target.value })} placeholder="Header" className="font-mono text-xs" />
                      <Input aria-label={`Header ${index + 1} value`} value={row.value} onChange={(event) => updateHeader(row.id, { value: event.target.value })} placeholder="Value" className="order-3 col-span-2 font-mono text-xs sm:order-none sm:col-span-1" />
                      <Button onClick={() => removeHeader(row.id)} variant="ghost" size="icon-xs" aria-label="Remove header"><X /></Button>
                    </div>
                  ))}
                  <Button onClick={addHeader} variant="outline" size="sm"><Plus />Add header</Button>
                </TabsPanel>
              </Tabs>
            </div>

            <div className="flex flex-col gap-3 border-t bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-pretty text-xs text-muted-foreground">
                {target.trim() || health?.forwardTargets[0] || "Choose a target before sending"}
              </p>
              <Button
                onClick={() => send.mutate()}
                disabled={!canSend || readonly}
                size="md"
                className="justify-center sm:min-w-32"
              >
                <Send className={cn("h-3.5 w-3.5", send.isPending && "animate-pulse")} />
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </Card>

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
          {send.error && <Alert variant="error"><AlertDescription>{(send.error as Error).message}</AlertDescription></Alert>}
        </div>
      </div>
    </div>
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
    <CossField>
      <FieldLabel className="text-xs text-muted-foreground">{label}</FieldLabel>
      {children}
    </CossField>
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
            <Badge variant="success" size="sm">
              signed with {signedWith}
            </Badge>
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
