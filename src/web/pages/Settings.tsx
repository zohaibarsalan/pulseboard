import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Database, RefreshCw, RotateCcw, Server, Shield, ShieldCheck } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { SecretsManager } from "../components/SecretsManager.js";
import { api } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { PulseboardSelect } from "../components/PulseboardSelect.js";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  getWebhookRefreshInterval,
  isWebhookRefreshPreset,
  MAX_WEBHOOK_REFRESH_INTERVAL,
  MIN_WEBHOOK_REFRESH_INTERVAL,
  setWebhookRefreshInterval,
  WEBHOOK_REFRESH_OPTIONS,
} from "../lib/refreshPreference.js";

export function SettingsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const { data: health, error } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5_000 });
  const policy = useQuery({ queryKey: ["delivery-policy"], queryFn: api.deliveryPolicy });
  const updatePolicy = useMutation({
    mutationFn: api.updateDeliveryPolicy,
    onSuccess: (data) => {
      queryClient.setQueryData(["delivery-policy"], data);
    },
  });
  const [copied, setCopied] = useState(false);
  const [refreshInterval, setRefreshIntervalState] = useState(getWebhookRefreshInterval);
  const [customRefreshSeconds, setCustomRefreshSeconds] = useState(() => {
    const initial = getWebhookRefreshInterval();
    return String(initial > 0 && !isWebhookRefreshPreset(initial) ? initial / 1_000 : 120);
  });
  const refreshOption =
    refreshInterval === 0 || isWebhookRefreshPreset(refreshInterval)
      ? String(refreshInterval)
      : "custom";
  const customSeconds = Number(customRefreshSeconds);
  const customRefreshInvalid =
    !Number.isFinite(customSeconds) ||
    customSeconds < MIN_WEBHOOK_REFRESH_INTERVAL / 1_000 ||
    customSeconds > MAX_WEBHOOK_REFRESH_INTERVAL / 1_000;

  const updateRefreshInterval = (value: number): void => {
    setRefreshIntervalState(value);
    setWebhookRefreshInterval(value);
  };

  const copyCaptureUrl = (): void => {
    if (!health?.captureUrl) return;
    void navigator.clipboard.writeText(`${health.captureUrl}/...`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Settings" subtitle="Capture endpoints, signing secrets, routing, and local instance details" />

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-5xl space-y-4">
          {error && (
            <Alert variant="error"><AlertDescription>Could not load settings: {error.message}</AlertDescription></Alert>
          )}
          <Card className="overflow-hidden">
          {/* Capture URL */}
          <Section title="Capture URL" icon={Server}>
            <p className="mb-2 text-sm text-fg-muted">
              Point your webhook provider (or tunnel) at this URL. Everything after{" "}
              <code className="font-mono text-fg">/hook</code> is captured and forwarded.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-bg-muted px-3 py-2 font-mono text-sm">
                {health?.captureUrl ?? "—"}/...
              </code>
              <Button
                onClick={copyCaptureUrl}
                size="icon"
                aria-label="Copy capture URL"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              Example with ngrok: <code className="font-mono">https://xxx.ngrok.io/hook/stripe</code>
            </p>
          </Section>

          {/* Signing secrets */}
          <Section title="Signing Secrets" icon={ShieldCheck}>
            <SecretsManager readonly={health?.readonly ?? false} />
          </Section>

          {/* Forwarding */}
          <Section title="Forwarding" icon={ArrowRight}>
            <div className="space-y-2">
              {(health?.forwardTargets.length ?? 0) > 0 ? health?.forwardTargets.map((target, index) => (
                <InfoRow key={target} label={`Target ${index + 1}`} value={<span className="font-mono text-sm break-all">{target}</span>} />
              )) : <InfoRow label="Targets" value={<span className="text-fg-muted">Capture-only mode</span>} />}
            </div>
            {(health?.routingRules.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <h3 className="mb-2 text-xs font-medium">Routing rules</h3>
                <div className="space-y-2">
                  {health?.routingRules.map((rule, index) => (
                    <div key={index} className="rounded-md bg-bg-muted/40 px-3 py-2 text-xs">
                      <span className="font-mono">{rule.source ? `source=${rule.source}` : ""}{rule.source && rule.pathPrefix ? " · " : ""}{rule.pathPrefix ? `path=${rule.pathPrefix}*` : ""}</span>
                      <span className="ml-2 text-fg-subtle">→ {rule.targets.length} {rule.targets.length === 1 ? "target" : "targets"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-fg-subtle">
              {health?.forwardTargets.length
                ? "Captured webhooks are routed to every matching target with the original raw body preserved."
                : "Webhooks are captured but not forwarded. Start with --forward <url> to proxy them."}
            </p>
          </Section>

          <Section title="Feed refresh" icon={RefreshCw}>
            <div className="flex max-w-xl flex-wrap items-start gap-2">
              <PulseboardSelect
                value={refreshOption}
                onChange={(value) => {
                  if (value === "custom") {
                    updateRefreshInterval(Number(customRefreshSeconds) * 1_000);
                    return;
                  }
                  updateRefreshInterval(Number(value));
                }}
                options={WEBHOOK_REFRESH_OPTIONS}
                ariaLabel="Webhook auto-refresh interval"
                className="w-64"
              />
              {refreshOption === "custom" && (
                <div>
                  <div className="flex items-center gap-2">
                    <Input
                      nativeInput
                      type="number"
                      min={MIN_WEBHOOK_REFRESH_INTERVAL / 1_000}
                      max={MAX_WEBHOOK_REFRESH_INTERVAL / 1_000}
                      step={1}
                      value={customRefreshSeconds}
                      aria-label="Custom refresh interval in seconds"
                      aria-invalid={customRefreshInvalid || undefined}
                      className="w-28"
                      onChange={(event) => {
                        const value = event.target.value;
                        setCustomRefreshSeconds(value);
                        const seconds = Number(value);
                        if (
                          Number.isFinite(seconds) &&
                          seconds >= MIN_WEBHOOK_REFRESH_INTERVAL / 1_000 &&
                          seconds <= MAX_WEBHOOK_REFRESH_INTERVAL / 1_000
                        ) {
                          updateRefreshInterval(Math.round(seconds) * 1_000);
                        }
                      }}
                    />
                    <span className="text-sm text-fg-muted">seconds</span>
                  </div>
                  {customRefreshInvalid && (
                    <p className="mt-1 text-xs text-danger">Enter between 5 and 3,600 seconds.</p>
                  )}
                </div>
              )}
            </div>
            <p className="mt-2 text-pretty text-xs text-fg-subtle">
              The webhook feed refreshes automatically at this interval. Live events remain indicated until the next refresh.
            </p>
          </Section>

          <Section title="Delivery retries" icon={RotateCcw}>
            {policy.error ? (
              <Alert variant="error">
                <AlertDescription>Could not load the retry policy: {policy.error.message}</AlertDescription>
              </Alert>
            ) : policy.data ? (
              <div className="flex max-w-3xl flex-col gap-4">
                <Field className="flex-row items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <FieldLabel htmlFor="automatic-delivery-retries">Automatic retries</FieldLabel>
                    <FieldDescription>
                      Retry network errors, timeouts, rate limits, and 5xx responses. Off by default to avoid unexpected duplicate side effects.
                    </FieldDescription>
                  </div>
                  <Checkbox
                    id="automatic-delivery-retries"
                    checked={policy.data.automaticRetries}
                    disabled={health?.readonly || updatePolicy.isPending}
                    onCheckedChange={(checked) => updatePolicy.mutate({
                      ...policy.data,
                      automaticRetries: checked,
                    })}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field>
                    <FieldLabel>Total attempts</FieldLabel>
                    <PulseboardSelect
                      value={String(policy.data.maxAttempts)}
                      onChange={(value) => updatePolicy.mutate({
                        ...policy.data,
                        maxAttempts: Number(value),
                      })}
                      options={[1, 2, 3, 4, 5].map((value) => ({
                        value: String(value),
                        label: value === 1 ? "1 · no retries" : `${value} · ${value - 1} retries`,
                      }))}
                      ariaLabel="Maximum delivery attempts"
                      disabled={health?.readonly || updatePolicy.isPending}
                      className="w-full"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Initial delay</FieldLabel>
                    <PulseboardSelect
                      value={String(policy.data.baseDelayMs)}
                      onChange={(value) => updatePolicy.mutate({
                        ...policy.data,
                        baseDelayMs: Number(value),
                        maxDelayMs: Math.max(Number(value), policy.data.maxDelayMs),
                      })}
                      options={[
                        { value: "5000", label: "5 seconds" },
                        { value: "15000", label: "15 seconds" },
                        { value: "30000", label: "30 seconds" },
                        { value: "60000", label: "1 minute" },
                      ]}
                      ariaLabel="Initial retry delay"
                      disabled={health?.readonly || updatePolicy.isPending}
                      className="w-full"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Maximum delay</FieldLabel>
                    <PulseboardSelect
                      value={String(policy.data.maxDelayMs)}
                      onChange={(value) => updatePolicy.mutate({
                        ...policy.data,
                        maxDelayMs: Number(value),
                      })}
                      options={[
                        { value: "60000", label: "1 minute" },
                        { value: "300000", label: "5 minutes" },
                        { value: "900000", label: "15 minutes" },
                        { value: "3600000", label: "1 hour" },
                      ].filter((option) => Number(option.value) >= policy.data.baseDelayMs)}
                      ariaLabel="Maximum retry delay"
                      disabled={health?.readonly || updatePolicy.isPending}
                      className="w-full"
                    />
                  </Field>
                </div>
                <p className="text-pretty text-xs text-fg-subtle">
                  Delays use exponential backoff with jitter. Manual target retries remain available when automatic retries are off.
                </p>
                {updatePolicy.error && (
                  <Alert variant="error">
                    <AlertDescription>Could not update the retry policy: {updatePolicy.error.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
          </Section>

          {/* Instance */}
          <Section title="System" icon={Database}>
            <InfoRow label="Version" value={health?.version ?? "—"} />
            <InfoRow
              label="SQLite"
              value={
                <span className={health?.sqlite === "open" ? "text-success" : "text-danger"}>
                  {health?.sqlite ?? "—"}
                </span>
              }
            />
            <InfoRow label="Uptime" value={health?.uptimeSeconds ? formatUptime(health.uptimeSeconds) : "—"} />
            <InfoRow
              label="Last captured"
              value={health?.lastCapturedAt ? formatRelativeTime(health.lastCapturedAt) : "never"}
            />
            <InfoRow label="Database size" value={health ? formatBytes(health.dbSizeBytes) : "—"} />
            <InfoRow label="Retention" value={health ? `${health.retentionDays} days` : "—"} />
            <InfoRow label="Database limit" value={health ? `${health.maxDbSizeMb} MB` : "—"} />
            <InfoRow label="Password protection" value={health?.authEnabled ? "Enabled" : "Disabled"} />
          </Section>

          {/* Mode */}
          <Section title="Mode" icon={Shield}>
            <InfoRow
              label="Read-only mode"
              value={
                <span className={health?.readonly ? "text-warning" : "text-fg-muted"}>
                  {health?.readonly ? "Enabled" : "Disabled"}
                </span>
              }
            />
            <p className="mt-2 text-xs text-fg-subtle">
              In read-only mode, replay and clear actions are disabled. Set{" "}
              <code className="font-mono text-fg-muted">PULSEBOARD_READONLY=true</code> to enable.
            </p>
          </Section>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Server;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="grid gap-4 border-b p-5 last:border-b-0 md:grid-cols-[13rem_minmax(0,1fr)] md:p-6">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">{title}</h2>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-1">
      <span className="text-sm text-fg-subtle">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
