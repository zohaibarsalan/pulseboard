import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  ListChecks,
  Route,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Topbar } from "../components/Topbar.js";
import { KpiCard } from "../components/KpiCard.js";
import { ThroughputChart } from "../components/ThroughputChart.js";
import { LatencyChart } from "../components/LatencyChart.js";
import { SourceBadge } from "../components/SourceBadge.js";
import {
  api,
  type AnalyticsBreakdownItem,
  type AnalyticsDiagnostics,
  type AnalyticsFilter,
  type AnalyticsSummary,
} from "../lib/api.js";
import { formatDuration, formatNumber, formatRelativeTime } from "../lib/format.js";
import { cn } from "../lib/cn.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PulseboardSelect } from "../components/PulseboardSelect.js";
import { DIAGNOSTIC_REASON_LABELS, type DiagnosticReason } from "../../shared/deliveryDiagnostics.js";

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
    queryFn: () => api.analyticsBreakdown("source", filter, 5),
    refetchInterval: 30_000,
  });
  const { data: byEventType } = useQuery({
    queryKey: ["analytics-breakdown", "event_type", filter],
    queryFn: () => api.analyticsBreakdown("event_type", filter, 5),
    refetchInterval: 30_000,
  });
  const { data: diagnostics, error: diagnosticsError } = useQuery({
    queryKey: ["analytics-diagnostics", filter],
    queryFn: () => api.analyticsDiagnostics(filter),
    refetchInterval: 15_000,
  });

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Analytics" subtitle="Webhook delivery and verification health" />

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-7xl space-y-10 pb-6">
          {(summaryError || timeseriesError || diagnosticsError) && (
            <Alert variant="error"><AlertDescription>Could not load analytics: {(summaryError ?? timeseriesError ?? diagnosticsError)?.message}</AlertDescription></Alert>
          )}
          <section className="space-y-4" aria-labelledby="analytics-overview-heading">
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

            <Kpis summary={summary} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ThroughputChart
                buckets={timeseries?.buckets ?? []}
                bucketSeconds={timeseries?.bucketSizeSeconds ?? 3600}
              />
              <LatencyChart
                buckets={timeseries?.buckets ?? []}
                bucketSeconds={timeseries?.bucketSizeSeconds ?? 3600}
              />
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="developer-insights-heading">
            <div>
              <h2 id="developer-insights-heading" className="text-balance text-lg font-medium">Developer insights</h2>
              <p className="text-pretty text-sm text-muted-foreground">
                Failure causes, response classes, slow handlers, and the latest events that need attention.
              </p>
            </div>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <FailureCauses diagnostics={diagnostics} />
              <StatusDistribution diagnostics={diagnostics} />
              <SlowestEndpoints diagnostics={diagnostics} />
              <RecentIssues diagnostics={diagnostics} />
            </div>
          </section>

          {/* Breakdowns */}
          <section className="space-y-4" aria-labelledby="traffic-breakdown-heading">
            <div>
              <h2 id="traffic-breakdown-heading" className="text-balance text-lg font-medium">Traffic breakdown</h2>
              <p className="text-pretty text-sm text-muted-foreground">The busiest providers and event types in this period.</p>
            </div>
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <BreakdownList
                title="Top sources"
                items={bySource?.items ?? []}
                onItemClick={(key) => navigate(`/?source=${encodeURIComponent(key)}`)}
                currentKey={source}
                renderKey={(k) => <SourceBadge source={k} />}
              />
              <BreakdownList
                title="Top event types"
                items={byEventType?.items ?? []}
                renderKey={(k) => (
                  <span className="truncate font-mono text-xs font-medium">
                    {k === "(none)" ? "No event type" : k}
                  </span>
                )}
                onItemClick={(key) => navigate(`/?q=${encodeURIComponent(key)}`)}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpis({ summary }: { summary: AnalyticsSummary | undefined }): React.ReactElement {
  const cur = summary?.current;
  const derived = summary?.derived;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
        label="Failed deliveries"
        value={cur ? formatNumber(cur.failed) : "—"}
        subtext={cur ? `${cur.slowDeliveries} handlers took 5s or longer` : undefined}
        icon={XCircle}
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
        label="P95 latency"
        value={cur?.p95ForwardMs != null ? formatDuration(cur.p95ForwardMs) : "—"}
        subtext="95% of handler responses were faster"
        icon={Gauge}
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

function FailureCauses({ diagnostics }: { diagnostics: AnalyticsDiagnostics | undefined }): React.ReactElement {
  const items = diagnostics?.failureReasons ?? [];
  return (
    <InsightCard
      title="Failure causes"
      description={`${formatNumber(diagnostics?.issueTotal ?? 0)} actionable issues in this range`}
      icon={AlertTriangle}
    >
      {items.length === 0 ? (
        <EmptyInsight>Nothing needs attention in this range.</EmptyInsight>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.reason} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {DIAGNOSTIC_REASON_LABELS[item.reason as Exclude<DiagnosticReason, "healthy">] ?? item.reason}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatNumber(item.count)} · {item.percentage.toFixed(0)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-danger" style={{ width: `${Math.max(3, item.percentage)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </InsightCard>
  );
}

function StatusDistribution({ diagnostics }: { diagnostics: AnalyticsDiagnostics | undefined }): React.ReactElement {
  const items = diagnostics?.statusClasses ?? [];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const labels: Record<string, string> = {
    "2xx": "Successful responses",
    "3xx": "Redirects",
    "4xx": "Handler rejected request",
    "5xx": "Handler errors",
    network_error: "Network errors",
    capture_only: "Capture only",
    unknown: "No response",
  };
  return (
    <InsightCard title="Response classes" description="What downstream handlers returned" icon={ListChecks}>
      {items.length === 0 ? (
        <EmptyInsight>No downstream responses in this range.</EmptyInsight>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const percentage = total > 0 ? (item.count / total) * 100 : 0;
            const healthy = item.key === "2xx";
            return (
              <li key={item.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_4rem] items-center gap-3 px-4 py-3">
                <Badge variant={healthy ? "success" : item.key === "capture_only" ? "secondary" : "error"} size="sm" className="justify-center font-mono">
                  {item.key.replace("_", " ")}
                </Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm">{labels[item.key] ?? item.key}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", healthy ? "bg-success" : "bg-danger")}
                      style={{ width: `${Math.max(3, percentage)}%` }}
                    />
                  </div>
                </div>
                <span className="text-right text-xs tabular-nums text-muted-foreground">{formatNumber(item.count)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCard>
  );
}

function SlowestEndpoints({ diagnostics }: { diagnostics: AnalyticsDiagnostics | undefined }): React.ReactElement {
  const items = diagnostics?.slowestEndpoints ?? [];
  return (
    <InsightCard title="Slowest endpoints" description="Ranked by average downstream latency" icon={Clock}>
      {items.length === 0 ? (
        <EmptyInsight>No forwarding latency recorded yet.</EmptyInsight>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.path}>
              <Link
                href={`/?q=${encodeURIComponent(item.path)}`}
                className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-3 px-4 py-3 hover:bg-muted/32"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-medium">{item.path}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(item.total)} events{item.failed > 0 ? ` · ${item.failed} failed` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs tabular-nums">{formatDuration(item.avgForwardMs)}</p>
                  <p className="text-2xs text-muted-foreground">average</p>
                </div>
                <div className="text-right">
                  <p className="text-xs tabular-nums">{formatDuration(item.maxForwardMs)}</p>
                  <p className="text-2xs text-muted-foreground">slowest</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </InsightCard>
  );
}

function RecentIssues({ diagnostics }: { diagnostics: AnalyticsDiagnostics | undefined }): React.ReactElement {
  const items = diagnostics?.recentIssues.slice(0, 5) ?? [];
  return (
    <InsightCard title="Recent issues" description="Latest deliveries with an actionable diagnosis" icon={Route}>
      {items.length === 0 ? (
        <EmptyInsight>No recent delivery issues.</EmptyInsight>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/webhooks/${item.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/32">
                <SourceBadge source={item.source} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-medium">{item.eventType || item.path}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {DIAGNOSTIC_REASON_LABELS[item.reason as Exclude<DiagnosticReason, "healthy">] ?? item.reason}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {item.forwardStatus != null && <p className="font-mono text-xs text-danger">{item.forwardStatus}</p>}
                  <p className="text-2xs tabular-nums text-muted-foreground">{formatRelativeTime(item.receivedAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </InsightCard>
  );
}

function InsightCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Clock;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-pretty text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function EmptyInsight({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
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
        <h2 id="analytics-overview-heading" className="text-balance text-lg font-medium">Overview</h2>
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
  const maxTotal = Math.max(...items.map((item) => item.total), 1);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">Ranked by captured volume</p>
        </div>
        <span className="text-xs tabular-nums text-fg-subtle">{items.length} shown</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-fg-subtle">No data</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, index) => {
            const failedPct = item.total > 0 ? (item.failed / item.total) * 100 : 0;
            const isCurrent = currentKey === item.key;
            const volumePct = (item.total / maxTotal) * 100;
            const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
              onItemClick ? (
                <Button
                  onClick={() => onItemClick(item.key)}
                  variant="ghost"
                  className={cn(
                    "min-h-16 w-full rounded-none px-4 py-3.5 text-left hover:bg-bg-muted/40",
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
                  <div className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="text-xs tabular-nums text-fg-subtle">{index + 1}</span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                        <div className="flex min-w-0 items-center">{renderKey(item.key)}</div>
                        <div className="flex shrink-0 items-center gap-4 sm:gap-5">
                          <span className="font-mono text-xs tabular-nums text-fg-muted">
                            {formatNumber(item.total)} events
                          </span>
                          <span
                            className={cn(
                              "flex min-w-20 items-center justify-end gap-1 text-xs font-medium tabular-nums",
                              item.successRate >= 95
                                ? "text-success"
                                : item.successRate >= 80
                                  ? "text-warning"
                                  : "text-danger",
                            )}
                          >
                            {item.successRate.toFixed(0)}% delivered
                            {failedPct > 0 && (
                              <AlertTriangle className="size-3 text-danger" aria-label={`${item.failed} failures`} />
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-foreground/25" style={{ width: `${volumePct}%` }} />
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
          Filtered by {currentKey}. <Link href={`/?source=${encodeURIComponent(currentKey)}`} className="hover:underline">View in feed →</Link>
        </div>
      )}
    </Card>
  );
}
