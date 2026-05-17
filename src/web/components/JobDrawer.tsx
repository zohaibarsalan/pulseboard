import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, Trash2, X, Copy as CopyIcon, Sparkles } from "lucide-react";
import { api, type JobDetail } from "../lib/api.js";
import { StatusPill, statusTone } from "./StatusPill.js";
import { formatRelativeTime } from "../lib/format.js";
import { cn } from "../lib/cn.js";

type Tab = "payload" | "output" | "error" | "timeline";

type Props = {
  instanceId: string;
  queueName: string;
  jobId: string | null;
  onClose: () => void;
};

export function JobDrawer({ instanceId, queueName, jobId, onClose }: Props): React.ReactElement | null {
  const [tab, setTab] = useState<Tab>("payload");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<JobDetail>({
    queryKey: ["job", instanceId, queueName, jobId],
    queryFn: () => api.job(instanceId, queueName, jobId!),
    enabled: !!jobId,
    refetchInterval: 5_000,
  });

  const invalidateAll = (): void => {
    if (jobId) void queryClient.invalidateQueries({ queryKey: ["job", instanceId, queueName, jobId] });
    void queryClient.invalidateQueries({ queryKey: ["queues", instanceId] });
    void queryClient.invalidateQueries({ queryKey: ["events", instanceId, queueName] });
  };

  const retryMutation = useMutation({
    mutationFn: () => api.retryJob(instanceId, queueName, jobId!),
    onSuccess: invalidateAll,
  });

  const removeMutation = useMutation({
    mutationFn: () => api.removeJob(instanceId, queueName, jobId!),
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
  });

  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const copyDebugContext = async (): Promise<void> => {
    if (!jobId) return;
    setCopyState("copying");
    try {
      const text = await api.debugContext(instanceId, queueName, jobId);
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch (err) {
      console.error(err);
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  if (!jobId) return null;

  const live = data?.live;
  const indexed = data?.indexed;
  const status = indexed?.status ?? "unknown";
  const jobName = live?.name ?? indexed?.jobName ?? "(unknown)";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-border bg-bg shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate font-mono text-sm font-medium">{jobName}</h2>
            <StatusPill label={status} tone={statusTone(status)} />
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-fg-muted hover:bg-bg-muted hover:text-fg"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-border bg-bg-subtle px-3 py-2">
          <ActionButton
            icon={copyState === "copied" ? Check : Sparkles}
            label={
              copyState === "copying"
                ? "Copying…"
                : copyState === "copied"
                  ? "Copied!"
                  : copyState === "error"
                    ? "Copy failed"
                    : "Copy AI debug context"
            }
            disabled={copyState === "copying"}
            onClick={() => void copyDebugContext()}
          />
          <ActionButton
            icon={RefreshCw}
            label={retryMutation.isPending ? "Retrying…" : "Retry"}
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
          />
          <ActionButton icon={CopyIcon} label="Clone" disabled />
          <ActionButton
            icon={Trash2}
            label={removeMutation.isPending ? "Removing…" : "Remove"}
            disabled={removeMutation.isPending}
            tone="danger"
            onClick={() => {
              if (window.confirm(`Remove job ${jobId}? This is permanent.`)) {
                removeMutation.mutate();
              }
            }}
          />
        </div>

        {(retryMutation.error || removeMutation.error) && (
          <div className="border-b border-border bg-danger/5 px-5 py-2 text-xs text-danger">
            {(retryMutation.error ?? removeMutation.error)?.message}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && <div className="text-sm text-fg-subtle">Loading…</div>}

          {data && (
            <>
              {data.removedFromRedis && (
                <div className="pb-card mb-4 border-warning/40 bg-warning/5 p-3 text-xs text-fg-muted">
                  This job was removed from Redis. Pulseboard only has the indexed summary.
                </div>
              )}

              <MetadataGrid jobId={jobId} queueName={queueName} live={live ?? null} indexed={indexed ?? null} />

              <div className="mt-5 flex items-center gap-1 border-b border-border">
                <TabButton active={tab === "payload"} onClick={() => setTab("payload")}>
                  Payload
                </TabButton>
                <TabButton active={tab === "output"} onClick={() => setTab("output")}>
                  Output
                </TabButton>
                <TabButton active={tab === "error"} onClick={() => setTab("error")}>
                  Error
                </TabButton>
                <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
                  Timeline ({data.timeline.length})
                </TabButton>
              </div>

              <div className="mt-4">
                {tab === "payload" && <CodeBlock value={live?.data} fallback="Payload storage is disabled. Enable PULSEBOARD_STORE_PAYLOADS=true." />}
                {tab === "output" && <CodeBlock value={live?.returnValue} fallback="Return-value storage is disabled. Enable PULSEBOARD_STORE_RETURN_VALUES=true." />}
                {tab === "error" && <ErrorView live={live ?? null} indexed={indexed ?? null} />}
                {tab === "timeline" && <Timeline events={data.timeline} />}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function MetadataGrid({
  jobId,
  queueName,
  live,
  indexed,
}: {
  jobId: string;
  queueName: string;
  live: JobDetail["live"];
  indexed: JobDetail["indexed"];
}): React.ReactElement {
  const created = live?.timestamp ?? indexed?.createdAt ?? null;
  const started = live?.processedOn ?? indexed?.processedOn ?? null;
  const finished = live?.finishedOn ?? indexed?.finishedOn ?? null;
  const attempts = live?.attemptsMade ?? indexed?.attemptsMade ?? 0;
  const waitMs = indexed?.waitTimeMs;
  const procMs = indexed?.processingTimeMs;

  return (
    <div className="pb-card-solid divide-y divide-dashed divide-border">
      <MetaRow label="Job ID">
        <span className="font-mono text-xs">{jobId}</span>
        <button
          className="text-fg-subtle hover:text-fg"
          onClick={() => navigator.clipboard.writeText(jobId)}
          aria-label="Copy job ID"
        >
          <Copy className="h-3 w-3" />
        </button>
      </MetaRow>
      <MetaRow label="Queue"><span className="font-mono text-xs">{queueName}</span></MetaRow>
      <MetaRow label="Created">{formatAbsolute(created)}</MetaRow>
      <MetaRow label="Started">{formatAbsolute(started)}</MetaRow>
      <MetaRow label="Finished">{formatAbsolute(finished)}</MetaRow>
      <MetaRow label="Attempts">
        <span className="font-mono">{attempts}</span>
      </MetaRow>
      {procMs !== null && procMs !== undefined && (
        <MetaRow label="Duration">
          <span className="font-mono">{formatMs(procMs)}</span>
        </MetaRow>
      )}
      {waitMs !== null && waitMs !== undefined && (
        <MetaRow label="Wait time">
          <span className="font-mono">{formatMs(waitMs)}</span>
        </MetaRow>
      )}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-xs">
      <span className="text-fg-subtle">{label}</span>
      <span className="flex items-center gap-1.5 text-fg-muted">{children}</span>
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
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-fg text-fg"
          : "border-transparent text-fg-subtle hover:text-fg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  disabled,
  tone,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  tone?: "danger";
  onClick?: () => void;
}): React.ReactElement {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={disabled && !onClick ? `${label} — coming soon` : label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors",
        tone === "danger" ? "text-danger" : "text-fg-muted",
        disabled
          ? "cursor-not-allowed opacity-50"
          : tone === "danger"
            ? "hover:bg-danger/10"
            : "hover:bg-bg-muted hover:text-fg",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function CodeBlock({ value, fallback }: { value: unknown; fallback?: string }): React.ReactElement {
  if (value === null || value === undefined) {
    return <div className="text-xs text-fg-subtle">{fallback ?? "—"}</div>;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-bg-muted/40 p-3 font-mono text-xs leading-relaxed text-fg-muted">
      {text}
    </pre>
  );
}

function ErrorView({
  live,
  indexed,
}: {
  live: JobDetail["live"];
  indexed: JobDetail["indexed"];
}): React.ReactElement {
  const reason = live?.failedReason ?? indexed?.failedReason;
  const stack = live?.stacktrace?.join("\n") ?? indexed?.stacktracePreview;
  if (!reason && !stack) {
    return <div className="text-xs text-fg-subtle">No error recorded.</div>;
  }
  return (
    <div className="space-y-3">
      {reason && (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-3">
          <div className="text-xs font-medium text-danger">{reason}</div>
        </div>
      )}
      {stack && (
        <pre className="overflow-x-auto rounded-md border border-border bg-bg-muted/40 p-3 font-mono text-2xs leading-relaxed text-fg-muted">
          {stack}
        </pre>
      )}
    </div>
  );
}

function Timeline({ events }: { events: JobDetail["timeline"] }): React.ReactElement {
  if (events.length === 0) return <div className="text-xs text-fg-subtle">No events recorded.</div>;
  return (
    <ul className="space-y-1.5">
      {events.map((e) => (
        <li key={e.id} className="flex items-center justify-between rounded-md border border-border bg-bg-subtle/40 px-3 py-1.5 text-xs">
          <div className="flex items-center gap-2.5">
            <StatusPill label={e.eventType} tone={statusTone(e.eventType)} />
            <span className="font-mono text-2xs text-fg-subtle">{new Date(e.createdAt).toLocaleString()}</span>
          </div>
          <span className="text-2xs text-fg-subtle">{formatRelativeTime(e.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function formatAbsolute(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
