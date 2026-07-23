import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PulseboardSelect } from "../components/PulseboardSelect.js";

type Range = "24h" | "7d" | "30d";
const RANGES: { id: Range; label: string; days: number; bucket: "hour" | "day" }[] = [
  { id: "24h", label: "24h", days: 1, bucket: "hour" },
  { id: "7d", label: "7d", days: 7, bucket: "day" },
  { id: "30d", label: "30d", days: 30, bucket: "day" },
];

type StatusFilter = "all" | "success" | "failed" | "pending";
type SignatureFilter = "all" | "valid" | "invalid" | "no_secret";

export function AnalyticsPage(): React.ReactElement {
  const [, navigate] = useLocation();
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

  const { data: summary, error: summaryError } = useQuery({
    queryKey: ["analytics-summary", filter],
    queryFn: () => api.analyticsSummary(filter),
    refetchInterval: 15_000,
  });
  const { data: timeseries, error: timeseriesError } = useQuery({
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
      <Topbar title="Analytics" subtitle="Webhook delivery and verification health" />

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {(summaryError || timeseriesError) && (
            <Alert variant="error"><AlertDescription>Could not load analytics: {(summaryError ?? timeseriesError)?.message}</AlertDescription></Alert>
          )}
          {/* Filters */}
          <FilterBar
            range={range}
            onRange={setRange}
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
              onItemClick={(key) => navigate(`/?source=${encodeURIComponent(key)}`)}
              currentKey={source}
              renderKey={(k) => <SourceBadge source={k} />}
            />
            <BreakdownList
              title="By event type"
              items={byEventType?.items ?? []}
              renderKey={(k) => <span className="font-mono text-xs">{k}</span>}
              onItemClick={(key) => navigate(`/?q=${encodeURIComponent(key)}`)}
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
  range,
  onRange,
  sources,
  source,
  onSource,
  statusFilter,
  onStatus,
  sigFilter,
  onSig,
}: {
  range: Range;
  onRange: (next: Range) => void;
  sources: { source: string; count: number }[];
  source: string | null;
  onSource: (next: string | null) => void;
  statusFilter: StatusFilter;
  onStatus: (next: StatusFilter) => void;
  sigFilter: SignatureFilter;
  onSig: (next: SignatureFilter) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-end">
      <div className="mr-auto">
        <h2 className="text-balance text-lg font-medium">Overview</h2>
        <p className="text-pretty text-sm text-muted-foreground">Delivery volume, latency, and signature verification.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PulseboardSelect value={range} onChange={(value) => onRange(value as Range)} ariaLabel="Analytics range" className="min-w-28" options={RANGES.map((item) => ({ value: item.id, label: item.label === "24h" ? "Last 24 hours" : `Last ${item.label}` }))} />
        <PulseboardSelect value={source ?? "all"} onChange={(value) => onSource(value === "all" ? null : value)} ariaLabel="Analytics source" className="min-w-32 capitalize" options={[{ value: "all", label: "All sources" }, ...sources.map((item) => ({ value: item.source, label: `${item.source} · ${item.count}` }))]} />
        <PulseboardSelect value={statusFilter} onChange={(value) => onStatus(value as StatusFilter)} ariaLabel="Analytics status" className="min-w-32 capitalize" options={["all", "success", "failed", "pending"].map((value) => ({ value, label: value === "all" ? "All status" : value }))} />
        <PulseboardSelect value={sigFilter} onChange={(value) => onSig(value as SignatureFilter)} ariaLabel="Analytics signature" className="min-w-36 capitalize" options={[{ value: "all", label: "All signatures" }, { value: "valid", label: "Valid" }, { value: "invalid", label: "Invalid" }, { value: "no_secret", label: "No secret" }]} />
      </div>
    </div>
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
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-2xs text-fg-subtle">top {items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-fg-subtle">No data</div>
      ) : (
        <>
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-3 border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          <span>{title === "By source" ? "Source" : "Event"}</span>
          <span className="text-right">Total</span>
          <span className="text-right">Success</span>
        </div>
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const failedPct = item.total > 0 ? (item.failed / item.total) * 100 : 0;
            const isCurrent = currentKey === item.key;
            const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
              onItemClick ? (
                <Button
                  onClick={() => onItemClick(item.key)}
                  variant="ghost"
                  className={cn(
                    "block w-full text-left transition-colors hover:bg-bg-muted/40",
                    isCurrent && "bg-bg-muted/60",
                  )}
                >
                  {children}
                </Button>
              ) : (
                <div>{children}</div>
              );
            return (
              <li key={item.key}>
                <Wrapper>
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0">{renderKey(item.key)}</div>
                        <span className="font-mono text-xs tabular-nums text-fg-muted">
                          {formatNumber(item.total)}
                        </span>
                        <span
                          className={cn(
                            "relative text-right text-xs font-medium tabular-nums",
                            item.successRate >= 95
                              ? "text-success"
                              : item.successRate >= 80
                                ? "text-warning"
                                : "text-danger",
                          )}
                        >
                          {item.successRate.toFixed(0)}%
                          {failedPct > 0 && (
                            <AlertTriangle
                              className="absolute -right-3 top-0 size-3 text-danger"
                              aria-label={`${item.failed} failures`}
                            />
                          )}
                        </span>
                  </div>
                </Wrapper>
              </li>
            );
          })}
        </ul>
        </>
      )}
      {onItemClick && currentKey && (
        <div className="border-t border-border px-4 py-2 text-2xs text-fg-subtle">
          Filtered by {currentKey}. <Link href={`/?source=${encodeURIComponent(currentKey)}`} className="hover:underline">View in feed →</Link>
        </div>
      )}
    </Card>
  );
}
