import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { KpiCard } from "../components/KpiCard.js";
import { ThroughputChart } from "../components/ThroughputChart.js";
import { LatencyChart } from "../components/LatencyChart.js";
import { SourceBadge } from "../components/SourceBadge.js";
import {
  api,
  type AnalyticsBreakdownItem,
  type AnalyticsFilter,
  type AnalyticsSummary,
} from "../lib/api.js";
import { formatDuration, formatNumber } from "../lib/format.js";
import { cn } from "../lib/cn.js";

type Range = "24h" | "7d" | "30d";
const RANGES: { id: Range; label: string; days: number; bucket: "hour" | "day" }[] = [
  { id: "24h", label: "24h", days: 1, bucket: "hour" },
  { id: "7d", label: "7d", days: 7, bucket: "day" },
  { id: "30d", label: "30d", days: 30, bucket: "day" },
];

type StatusFilter = "all" | "success" | "failed" | "pending";
type SignatureFilter = "all" | "valid" | "invalid" | "no_secret";

export function AnalyticsPage(): React.ReactElement {
  const [range, setRange] = useState<Range>("7d");
  const [source, setSource] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sigFilter, setSigFilter] = useState<SignatureFilter>("all");

  const rangeCfg = RANGES.find((r) => r.id === range)!;

  const filter: AnalyticsFilter = {
    days: rangeCfg.days,
    source: source ?? undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    signature: sigFilter === "all" ? undefined : sigFilter,
  };

  const { data: summary } = useQuery({
    queryKey: ["analytics-summary", filter],
    queryFn: () => api.analyticsSummary(filter),
    refetchInterval: 15_000,
  });
  const { data: timeseries } = useQuery({
    queryKey: ["analytics-timeseries", filter, rangeCfg.bucket],
    queryFn: () => api.analyticsTimeseries(filter, rangeCfg.bucket),
    refetchInterval: 15_000,
  });
  // Source list comes from the live webhook sources endpoint (unfiltered) so
  // the user can switch into a source even if the current filter hides it.
  const { data: sources } = useQuery({
    queryKey: ["webhook-sources"],
    queryFn: api.sources,
    refetchInterval: 30_000,
  });
  const { data: bySource } = useQuery({
    queryKey: ["analytics-breakdown", "source", filter],
    queryFn: () => api.analyticsBreakdown("source", filter),
    refetchInterval: 30_000,
  });
  const { data: byEventType } = useQuery({
    queryKey: ["analytics-breakdown", "event_type", filter],
    queryFn: () => api.analyticsBreakdown("event_type", filter),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Analytics"
        subtitle={
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                  range === r.id ? "bg-fg/10 text-fg" : "text-fg-muted hover:bg-bg-muted",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* Filters */}
          <FilterBar
            sources={sources?.sources ?? []}
            source={source}
            onSource={setSource}
            statusFilter={statusFilter}
            onStatus={setStatusFilter}
            sigFilter={sigFilter}
            onSig={setSigFilter}
          />

          {/* KPIs */}
          <Kpis summary={summary} />

          {/* Charts */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ThroughputChart
              buckets={timeseries?.buckets ?? []}
              bucketSeconds={timeseries?.bucketSizeSeconds ?? 3600}
            />
            <LatencyChart
              buckets={timeseries?.buckets ?? []}
              bucketSeconds={timeseries?.bucketSizeSeconds ?? 3600}
            />
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <BreakdownList
              title="By source"
              items={bySource?.items ?? []}
              onItemClick={(key) => setSource(key === source ? null : key)}
              currentKey={source}
              renderKey={(k) => <SourceBadge source={k} />}
            />
            <BreakdownList
              title="By event type"
              items={byEventType?.items ?? []}
              renderKey={(k) => <span className="font-mono text-xs">{k}</span>}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpis({ summary }: { summary: AnalyticsSummary | undefined }): React.ReactElement {
  const cur = summary?.current;
  const derived = summary?.derived;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Total webhooks"
        value={cur ? formatNumber(cur.total) : "—"}
        subtext={`in last ${summary?.rangeDays ?? "?"}d`}
        icon={TrendingUp}
        trend={
          derived?.totalTrendPct != null
            ? { direction: derived.totalTrendPct >= 0 ? "up" : "down", percent: derived.totalTrendPct, good: "up" }
            : undefined
        }
      />
      <KpiCard
        label="Success rate"
        value={derived ? `${derived.successRate.toFixed(1)}%` : "—"}
        subtext={cur ? `${formatNumber(cur.succeeded)} of ${formatNumber(cur.total)} forwarded ok` : undefined}
        icon={CheckCircle2}
        trend={
          derived?.successRateTrendPct != null
            ? { direction: derived.successRateTrendPct >= 0 ? "up" : "down", percent: derived.successRateTrendPct, good: "up" }
            : undefined
        }
      />
      <KpiCard
        label="Avg fwd latency"
        value={cur?.avgForwardMs != null ? formatDuration(cur.avgForwardMs) : "—"}
        subtext="round trip to your app"
        icon={Clock}
        trend={
          derived?.avgForwardTrendPct != null
            ? { direction: derived.avgForwardTrendPct >= 0 ? "up" : "down", percent: derived.avgForwardTrendPct, good: "down" }
            : undefined
        }
      />
      <KpiCard
        label="Signatures valid"
        value={derived ? `${derived.signatureValidRate.toFixed(1)}%` : "—"}
        subtext={
          cur
            ? cur.verifiableTotal > 0
              ? `${formatNumber(cur.validSignatures)} of ${formatNumber(cur.verifiableTotal)} signed`
              : "no signed webhooks captured"
            : undefined
        }
        icon={ShieldCheck}
        trend={
          derived?.signatureValidTrendPct != null
            ? { direction: derived.signatureValidTrendPct >= 0 ? "up" : "down", percent: derived.signatureValidTrendPct, good: "up" }
            : undefined
        }
      />
    </div>
  );
}

function FilterBar({
  sources,
  source,
  onSource,
  statusFilter,
  onStatus,
  sigFilter,
  onSig,
}: {
  sources: { source: string; count: number }[];
  source: string | null;
  onSource: (next: string | null) => void;
  statusFilter: StatusFilter;
  onStatus: (next: StatusFilter) => void;
  sigFilter: SignatureFilter;
  onSig: (next: SignatureFilter) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">Source</span>
        <FilterPill active={source === null} onClick={() => onSource(null)}>All</FilterPill>
        {sources.map((s) => (
          <FilterPill key={s.source} active={source === s.source} onClick={() => onSource(s.source)}>
            <span className="capitalize">{s.source}</span>
            <span className="ml-1 text-fg-subtle">{s.count}</span>
          </FilterPill>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">Status</span>
          {(["all", "success", "failed", "pending"] as StatusFilter[]).map((s) => (
            <FilterPill key={s} active={statusFilter === s} onClick={() => onStatus(s)} tone={
              s === "failed" ? "danger" : s === "success" ? "success" : "neutral"
            }>
              <span className="capitalize">{s}</span>
            </FilterPill>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">Signature</span>
          {(["all", "valid", "invalid", "no_secret"] as SignatureFilter[]).map((s) => (
            <FilterPill key={s} active={sigFilter === s} onClick={() => onSig(s)} tone={
              s === "invalid" ? "danger" : s === "valid" ? "success" : "neutral"
            }>
              {s === "no_secret" ? "no secret" : <span className="capitalize">{s}</span>}
            </FilterPill>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  tone = "neutral",
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "neutral" | "success" | "danger";
  children: React.ReactNode;
}): React.ReactElement {
  const activeClass =
    tone === "success" ? "bg-success/15 text-success" : tone === "danger" ? "bg-danger/15 text-danger" : "bg-fg/10 text-fg";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 text-xs font-medium transition-colors",
        active ? activeClass : "text-fg-muted hover:bg-bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function BreakdownList({
  title,
  items,
  renderKey,
  onItemClick,
  currentKey,
}: {
  title: string;
  items: AnalyticsBreakdownItem[];
  renderKey: (key: string) => React.ReactNode;
  onItemClick?: (key: string) => void;
  currentKey?: string | null;
}): React.ReactElement {
  const max = items.length > 0 ? items[0]!.total : 1;

  return (
    <div className="pb-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-2xs text-fg-subtle">top {items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-fg-subtle">No data</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const widthPct = (item.total / max) * 100;
            const failedPct = item.total > 0 ? (item.failed / item.total) * 100 : 0;
            const isCurrent = currentKey === item.key;
            const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
              onItemClick ? (
                <button
                  type="button"
                  onClick={() => onItemClick(item.key)}
                  className={cn(
                    "block w-full text-left transition-colors hover:bg-bg-muted/40",
                    isCurrent && "bg-bg-muted/60",
                  )}
                >
                  {children}
                </button>
              ) : (
                <div>{children}</div>
              );
            return (
              <li key={item.key}>
                <Wrapper>
                  <div className="relative px-4 py-2.5">
                    <div
                      className="absolute inset-y-0 left-0 bg-fg/[0.04]"
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">{renderKey(item.key)}</div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-xs tabular-nums text-fg-muted">
                          {formatNumber(item.total)}
                        </span>
                        <span
                          className={cn(
                            "w-12 text-right text-xs font-medium tabular-nums",
                            item.successRate >= 95
                              ? "text-success"
                              : item.successRate >= 80
                                ? "text-warning"
                                : "text-danger",
                          )}
                        >
                          {item.successRate.toFixed(0)}%
                        </span>
                        {failedPct > 0 && (
                          <AlertTriangle
                            className="h-3 w-3 text-danger"
                            aria-label={`${item.failed} failures`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </Wrapper>
              </li>
            );
          })}
        </ul>
      )}
      {onItemClick && currentKey && (
        <div className="border-t border-border px-4 py-2 text-2xs text-fg-subtle">
          Filtered by {currentKey}. <Link href="/" className="hover:underline">View in feed →</Link>
        </div>
      )}
    </div>
  );
}
