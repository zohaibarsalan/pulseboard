import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Database, Server, Shield, ShieldCheck } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { SecretsManager } from "../components/SecretsManager.js";
import { api } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";
import { Button, Card, CardHeader } from "../components/coss-ui/index.js";

export function SettingsPage(): React.ReactElement {
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5_000 });
  const [copied, setCopied] = useState(false);

  const copyCaptureUrl = (): void => {
    if (!health?.captureUrl) return;
    void navigator.clipboard.writeText(`${health.captureUrl}/...`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Settings" />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-6">
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
            <SecretsManager />
          </Section>

          {/* Forwarding */}
          <Section title="Forwarding" icon={ArrowRight}>
            <InfoRow
              label="Forward target"
              value={
                health?.forwardTo ? (
                  <span className="font-mono text-sm">{health.forwardTo}</span>
                ) : (
                  <span className="text-fg-muted">Capture-only mode</span>
                )
              }
            />
            <p className="mt-2 text-xs text-fg-subtle">
              {health?.forwardTo
                ? "Captured webhooks are proxied to this target with the original raw body preserved."
                : "Webhooks are captured but not forwarded. Start with --forward <url> to proxy them."}
            </p>
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
    <Card>
      <CardHeader>
        <Icon className="h-4 w-4 text-fg-subtle" />
        <h2 className="text-sm font-medium">{title}</h2>
      </CardHeader>
      {children}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1">
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
