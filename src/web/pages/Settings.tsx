import { useQuery } from "@tanstack/react-query";
import { Database, Server, Clock, Shield, Activity } from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { api, type Health } from "../lib/api.js";
import { formatRelativeTime } from "../lib/format.js";

const INSTANCE_ID = "default";

export function SettingsPage(): React.ReactElement {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 5_000,
  });

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Settings" />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Connection */}
          <Section title="Connection" icon={Server}>
            <InfoRow label="Redis URL" value={health?.redisUrl ?? "—"} mono />
            <InfoRow
              label="Redis status"
              value={
                <span className={health?.redis === "connected" ? "text-success" : "text-danger"}>
                  {health?.redis ?? "—"}
                </span>
              }
            />
            <InfoRow
              label="SQLite status"
              value={
                <span className={health?.sqlite === "open" ? "text-success" : "text-danger"}>
                  {health?.sqlite ?? "—"}
                </span>
              }
            />
          </Section>

          {/* Instance */}
          <Section title="Instance" icon={Database}>
            <InfoRow label="Instance ID" value={health?.instanceId ?? "—"} mono />
            <InfoRow label="Version" value={health?.version ?? "—"} />
            <InfoRow
              label="Uptime"
              value={health?.uptimeSeconds ? formatUptime(health.uptimeSeconds) : "—"}
            />
            <InfoRow
              label="Last indexed"
              value={health?.lastIndexedAt ? formatRelativeTime(health.lastIndexedAt) : "never"}
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
              In read-only mode, actions like retry, remove, pause, and resume are disabled.
              Set <code className="font-mono text-fg-muted">PULSEBOARD_READONLY=true</code> to enable.
            </p>
          </Section>

          {/* Status */}
          <Section title="System Status" icon={Activity}>
            <div className="grid grid-cols-2 gap-4">
              <StatusCard
                label="API"
                status={health?.status === "ok" ? "healthy" : "degraded"}
              />
              <StatusCard
                label="Redis"
                status={health?.redis === "connected" ? "healthy" : "error"}
              />
              <StatusCard
                label="SQLite"
                status={health?.sqlite === "open" ? "healthy" : "error"}
              />
              <StatusCard
                label="Indexer"
                status={health?.lastIndexedAt && Date.now() - health.lastIndexedAt < 60_000 ? "healthy" : "idle"}
              />
            </div>
          </Section>

          {/* About */}
          <Section title="About" icon={Clock}>
            <p className="text-sm text-fg-muted">
              Pulseboard is a local-first, self-hosted BullMQ studio for monitoring, searching,
              debugging, and understanding background jobs.
            </p>
            <p className="mt-2 text-xs text-fg-subtle">
              Documentation and source code at{" "}
              <a
                href="https://github.com/pulseboard/pulseboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg-muted hover:underline"
              >
                github.com/pulseboard/pulseboard
              </a>
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
    <div className="pb-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-fg-subtle" />
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-fg-subtle">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function StatusCard({
  label,
  status,
}: {
  label: string;
  status: "healthy" | "degraded" | "error" | "idle";
}): React.ReactElement {
  const colors = {
    healthy: "bg-success/10 text-success border-success/30",
    degraded: "bg-warning/10 text-warning border-warning/30",
    error: "bg-danger/10 text-danger border-danger/30",
    idle: "bg-fg-subtle/10 text-fg-muted border-border",
  };

  const labels = {
    healthy: "Healthy",
    degraded: "Degraded",
    error: "Error",
    idle: "Idle",
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[status]}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{labels[status]}</div>
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
