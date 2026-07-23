import { useMemo, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { diffHeaders, diffJsonBodies, type DiffEntry, type DiffKind } from "../../shared/webhookDiff.js";
import type { Webhook } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { cn } from "../lib/cn.js";
import { SignatureBadge } from "./SignatureBadge.js";

type CompareTab = "body" | "headers" | "delivery";

export function WebhookCompare({
  current,
  comparison,
}: {
  current: Webhook;
  comparison: Webhook;
}): React.ReactElement {
  const [tab, setTab] = useState<CompareTab>("body");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [earlier, later] =
    current.receivedAt <= comparison.receivedAt
      ? [current, comparison]
      : [comparison, current];
  const bodyDiff = useMemo(
    () => diffJsonBodies(earlier.body, later.body),
    [earlier.body, later.body],
  );
  const headerDiff = useMemo(
    () => diffHeaders(parseHeaders(earlier.headersJson), parseHeaders(later.headersJson)),
    [earlier.headersJson, later.headersJson],
  );
  const responseDiff = useMemo(
    () => diffJsonBodies(earlier.responseBody, later.responseBody),
    [earlier.responseBody, later.responseBody],
  );
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="webhook-compare">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as CompareTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-b">
          <TabsList variant="underline" className="h-16 w-full justify-start rounded-none p-0">
            <TabsTab value="body" className="h-16 rounded-none">Body <DiffCount entries={bodyDiff.entries} /></TabsTab>
            <TabsTab value="headers" className="h-16 rounded-none">Headers <DiffCount entries={headerDiff.entries} /></TabsTab>
            <TabsTab value="delivery" className="h-16 rounded-none">Delivery</TabsTab>
          </TabsList>
        </div>
        <div className="flex h-10 items-center justify-end border-b px-4 sm:px-6">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={showUnchanged} onCheckedChange={setShowUnchanged} />
            Show unchanged
          </label>
        </div>

        <TabsPanel value="body" className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <DiffCard
            title={bodyDiff.structured ? "JSON body" : "Raw body"}
            description={
              bodyDiff.structured
                ? "Fields are compared by JSON path."
                : "One or both bodies are not JSON, so the full values are compared."
            }
            entries={bodyDiff.entries}
            showUnchanged={showUnchanged}
          />
        </TabsPanel>
        <TabsPanel value="headers" className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <DiffCard
            title="Request headers"
            description="Header names are compared case-insensitively."
            entries={headerDiff.entries}
            showUnchanged={showUnchanged}
          />
        </TabsPanel>
        <TabsPanel value="delivery" className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <DeliveryComparison
            earlier={earlier}
            later={later}
            responseEntries={responseDiff.entries}
            showUnchanged={showUnchanged}
          />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function DiffCount({ entries }: { entries: DiffEntry[] }): React.ReactElement | null {
  const count = entries.filter((entry) => entry.kind !== "unchanged").length;
  return count > 0 ? <Badge variant="secondary" size="sm">{count}</Badge> : null;
}

function DiffCard({
  title,
  description,
  entries,
  showUnchanged,
}: {
  title: string;
  description: string;
  entries: DiffEntry[];
  showUnchanged: boolean;
}): React.ReactElement {
  const visible = showUnchanged ? entries : entries.filter((entry) => entry.kind !== "unchanged");
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardPanel className="p-0">
        {visible.length === 0 ? (
          <Empty className="min-h-56 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><GitCompareArrows /></EmptyMedia>
              <EmptyTitle className="text-base">No differences</EmptyTitle>
              <EmptyDescription>
                {showUnchanged ? "There are no values to compare." : "Turn on “Show unchanged” to inspect matching values."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-px border-b bg-border text-xs text-muted-foreground md:grid">
              <span className="bg-muted/30 px-4 py-2">Field</span>
              <span className="bg-muted/30 px-4 py-2">Earlier</span>
              <span className="bg-muted/30 px-4 py-2">Later</span>
            </div>
            <div className="divide-y">
              {visible.map((entry) => <DiffRow key={entry.path} entry={entry} />)}
            </div>
          </div>
        )}
      </CardPanel>
    </Card>
  );
}

function DiffRow({ entry }: { entry: DiffEntry }): React.ReactElement {
  return (
    <div
      className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4"
      data-diff-kind={entry.kind}
    >
      <div className="flex min-w-0 items-start gap-2">
        <DiffBadge kind={entry.kind} />
        <code className="break-all font-mono text-xs font-medium">{entry.path}</code>
      </div>
      <DiffValue label="Earlier" value={entry.before} tone={entry.kind === "removed" || entry.kind === "changed" ? "removed" : "neutral"} />
      <DiffValue label="Later" value={entry.after} tone={entry.kind === "added" || entry.kind === "changed" ? "added" : "neutral"} />
    </div>
  );
}

function DiffBadge({ kind }: { kind: DiffKind }): React.ReactElement {
  const config: Record<DiffKind, { label: string; variant: "success" | "error" | "warning" | "secondary" }> = {
    added: { label: "Added", variant: "success" },
    removed: { label: "Removed", variant: "error" },
    changed: { label: "Changed", variant: "warning" },
    unchanged: { label: "Same", variant: "secondary" },
  };
  return <Badge variant={config[kind].variant} size="sm">{config[kind].label}</Badge>;
}

function DiffValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone: "added" | "removed" | "neutral";
}): React.ReactElement {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-2xs text-muted-foreground md:hidden">{label}</p>
      <pre
        className={cn(
          "min-h-9 overflow-x-auto whitespace-pre-wrap break-all rounded-md border px-3 py-2 font-mono text-xs",
          tone === "added" && "border-success/25 bg-success/5",
          tone === "removed" && "border-danger/25 bg-danger/5",
          value == null && "text-muted-foreground",
        )}
      >
        {value ?? "—"}
      </pre>
    </div>
  );
}

function DeliveryComparison({
  earlier,
  later,
  responseEntries,
  showUnchanged,
}: {
  earlier: Webhook;
  later: Webhook;
  responseEntries: DiffEntry[];
  showUnchanged: boolean;
}): React.ReactElement {
  const rows = [
    { label: "Target", before: earlier.forwardedTo ?? "Capture only", after: later.forwardedTo ?? "Capture only" },
    { label: "Status", before: earlier.forwardStatus?.toString() ?? earlier.forwardError ?? "No response", after: later.forwardStatus?.toString() ?? later.forwardError ?? "No response" },
    { label: "Duration", before: earlier.forwardDurationMs != null ? formatDuration(earlier.forwardDurationMs) : "—", after: later.forwardDurationMs != null ? formatDuration(later.forwardDurationMs) : "—" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="text-sm">Delivery outcome</CardTitle>
          <CardDescription className="text-xs">Downstream response and signature verification for each request.</CardDescription>
        </CardHeader>
        <CardPanel className="p-0">
          <div className="grid grid-cols-[minmax(8rem,0.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-px border-b bg-border text-xs text-muted-foreground">
            <span className="bg-muted/30 px-4 py-2">Metric</span>
            <span className="bg-muted/30 px-4 py-2">Earlier</span>
            <span className="bg-muted/30 px-4 py-2">Later</span>
          </div>
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(8rem,0.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 py-3 text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <code className="break-all font-mono">{row.before}</code>
                <code className="break-all font-mono">{row.after}</code>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(8rem,0.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 px-4 py-3 text-xs">
              <span className="text-muted-foreground">Signature</span>
              <SignatureBadge status={earlier.signatureStatus} notes={earlier.signatureNotes} />
              <SignatureBadge status={later.signatureStatus} notes={later.signatureNotes} />
            </div>
          </div>
        </CardPanel>
      </Card>
      <DiffCard
        title="Response body"
        description="The downstream handler response returned for each delivery."
        entries={responseEntries}
        showUnchanged={showUnchanged}
      />
    </div>
  );
}

function parseHeaders(value: string): Record<string, string> {
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    return {};
  }
}
