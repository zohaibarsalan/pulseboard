import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Server,
  Terminal,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";
import { Topbar } from "../components/Topbar.js";
import { SourceBadge } from "../components/SourceBadge.js";
import { api, type Webhook } from "../lib/api.js";
import {
  DESTINATIONS,
  EXPOSURES,
  PROVIDERS,
  generateOnboardingCommands,
  normalizeWebhookPath,
  type DestinationId,
  type ExposureId,
  type ProviderId,
} from "../lib/providerOnboarding.js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PulseboardSelect } from "../components/PulseboardSelect.js";
import { cn } from "../lib/cn.js";
import { diagnoseDelivery } from "../../shared/deliveryDiagnostics.js";

type TestResult =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; responseStatus: number; webhook: Webhook }
  | { status: "error"; message: string };

export function ConnectPage(): React.ReactElement {
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5_000 });
  const { data: secretData } = useQuery({ queryKey: ["secrets"], queryFn: api.secrets });
  const [providerId, setProviderId] = useState<ProviderId>("stripe");
  const [destinationId, setDestinationId] = useState<DestinationId>("local");
  const [exposureId, setExposureId] = useState<ExposureId>("stripe-cli");
  const [path, setPath] = useState("/stripe");
  const [targetOverride, setTargetOverride] = useState<string | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [testResult, setTestResult] = useState<TestResult>({ status: "idle" });

  const provider = PROVIDERS.find((item) => item.id === providerId) ?? PROVIDERS[0]!;
  const destination = DESTINATIONS.find((item) => item.value === destinationId) ?? DESTINATIONS[0]!;
  const configuredTarget = health?.forwardTargets[0] ?? null;
  const target = targetOverride ?? configuredTarget ?? destination.placeholder;
  const commands = useMemo(
    () => generateOnboardingCommands({ provider: providerId, exposure: exposureId, path, target, publicBaseUrl }),
    [exposureId, path, providerId, publicBaseUrl, target],
  );
  const secret = secretData?.secrets.find((item) => item.source === providerId);
  const targetMatches = configuredTarget === target.trim();

  const selectProvider = (next: ProviderId): void => {
    const nextProvider = PROVIDERS.find((item) => item.id === next) ?? PROVIDERS[0]!;
    setProviderId(next);
    setPath(nextProvider.defaultPath);
    if (!nextProvider.exposureOptions.includes(exposureId)) {
      setExposureId(nextProvider.exposureOptions[0]!);
    }
    setTestResult({ status: "idle" });
  };

  const selectDestination = (next: DestinationId): void => {
    const nextDestination = DESTINATIONS.find((item) => item.value === next) ?? DESTINATIONS[0]!;
    setDestinationId(next);
    setTargetOverride(nextDestination.placeholder);
    setTestResult({ status: "idle" });
  };

  const runTest = async (): Promise<void> => {
    setTestResult({ status: "running" });
    try {
      const result = await api.testConnection(normalizeWebhookPath(path));
      const forwarded = result.webhook.forwardStatus != null && result.webhook.forwardStatus < 400 && !result.webhook.forwardError;
      const diagnosis = diagnoseDelivery(result.webhook);
      setTestResult(
        forwarded || !configuredTarget
          ? { status: "success", ...result }
          : {
              status: "error",
              message: `${diagnosis.title}: ${diagnosis.action ?? diagnosis.summary}`,
            },
      );
    } catch (error) {
      setTestResult({ status: "error", message: error instanceof Error ? error.message : "Connection test failed" });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Connect" subtitle="Set up a provider and verify the delivery path" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">1. Provider</CardTitle>
              <CardDescription>Pulseboard uses this to generate the correct endpoint and signing guidance.</CardDescription>
            </CardHeader>
            <CardPanel className="pt-6">
              <ToggleGroup
                value={[providerId]}
                onValueChange={(value) => {
                  const next = value.at(-1) as ProviderId | undefined;
                  if (next) selectProvider(next);
                }}
                className="grid w-full grid-cols-2 gap-2 lg:grid-cols-3"
                aria-label="Webhook provider"
              >
                {PROVIDERS.map((item) => (
                  <ToggleGroupItem
                    key={item.id}
                    value={item.id}
                    variant="outline"
                    className="h-auto min-h-16 justify-start px-3 py-2.5 text-left whitespace-normal"
                    aria-label={item.label}
                  >
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      <SourceBadge source={item.id} />
                      <span className="text-pretty text-xs font-normal text-muted-foreground">{item.description}</span>
                    </div>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardPanel>
          </Card>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-5">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base">2. Delivery destination</CardTitle>
                  <CardDescription>Where Pulseboard should forward captured requests.</CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-4 pt-6">
                  <Field>
                    <FieldLabel>Handler environment</FieldLabel>
                    <PulseboardSelect
                      value={destinationId}
                      onChange={(value) => selectDestination(value as DestinationId)}
                      options={DESTINATIONS.map((item) => ({ value: item.value, label: item.label }))}
                      ariaLabel="Handler environment"
                      className="w-full"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="onboarding-target">Forward target</FieldLabel>
                    <Input
                      id="onboarding-target"
                      value={target}
                      placeholder={destination.placeholder}
                      onChange={(event) => {
                        setTargetOverride(event.currentTarget.value);
                        setTestResult({ status: "idle" });
                      }}
                    />
                    <FieldDescription>
                      Pulseboard preserves the captured path, query string, headers, and raw request body.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="onboarding-path">Webhook path</FieldLabel>
                    <Input
                      id="onboarding-path"
                      value={path}
                      onChange={(event) => {
                        setPath(event.currentTarget.value);
                        setTestResult({ status: "idle" });
                      }}
                    />
                    <FieldDescription>
                      The provider endpoint will include <code className="font-mono">/hook{normalizeWebhookPath(path)}</code>.
                    </FieldDescription>
                  </Field>
                  {configuredTarget && !targetMatches && (
                    <Alert variant="warning">
                      <Terminal />
                      <AlertTitle>Restart Pulseboard to apply this target</AlertTitle>
                      <AlertDescription>
                        <span>
                          It is currently forwarding to <code className="break-all font-mono">{configuredTarget}</code>.
                          {" "}Copy the generated start command below when you are ready to switch.
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardPanel>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base">3. Public access</CardTitle>
                  <CardDescription>Providers need an HTTPS URL unless they offer a local forwarding CLI.</CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-4 pt-6">
                  <Field>
                    <FieldLabel>Exposure method</FieldLabel>
                    <PulseboardSelect
                      value={exposureId}
                      onChange={(value) => setExposureId(value as ExposureId)}
                      options={provider.exposureOptions.map((value) => ({
                        value,
                        label: EXPOSURES[value].label,
                      }))}
                      ariaLabel="Exposure method"
                      className="w-full"
                    />
                    <FieldDescription>{EXPOSURES[exposureId].description}</FieldDescription>
                  </Field>
                  {exposureId === "public" && (
                    <Field>
                      <FieldLabel htmlFor="public-base-url">Public Pulseboard URL</FieldLabel>
                      <Input
                        id="public-base-url"
                        value={publicBaseUrl}
                        placeholder="https://hooks.example.com"
                        onChange={(event) => setPublicBaseUrl(event.currentTarget.value)}
                      />
                    </Field>
                  )}
                </CardPanel>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base">4. Run the setup</CardTitle>
                  <CardDescription>Start Pulseboard, expose it, then paste the generated endpoint into {provider.label}.</CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-4 pt-6">
                  <SetupCommand label="Start Pulseboard" value={commands.start} />
                  {commands.expose && (
                    <SetupCommand
                      label={exposureId === "stripe-cli" ? "Forward Stripe events" : `Start ${EXPOSURES[exposureId].label}`}
                      value={commands.expose}
                    />
                  )}
                  <SetupCommand label="Provider endpoint" value={commands.endpoint} />
                  <div className="rounded-lg border bg-muted/24 px-3 py-3">
                    <p className="text-sm font-medium">{provider.dashboardInstruction}</p>
                    {provider.docsUrl && (
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        Open {provider.label} setup documentation <ExternalLink aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </CardPanel>
              </Card>
            </div>

            <aside className="flex flex-col gap-5">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Readiness</CardTitle>
                  <CardDescription>What Pulseboard can verify from this instance.</CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-3 pt-6">
                  <ReadinessRow
                    icon={Server}
                    label="Pulseboard"
                    value={health?.status === "ok" ? "Running" : "Checking…"}
                    ready={health?.status === "ok"}
                  />
                  <ReadinessRow
                    icon={ArrowRight}
                    label="Forward target"
                    value={configuredTarget ?? "Not configured"}
                    ready={Boolean(configuredTarget)}
                  />
                  {provider.secretLabel && (
                    <ReadinessRow
                      icon={KeyRound}
                      label={provider.secretLabel}
                      value={secret?.configured ? `Configured ${secret.masked ?? ""}` : "Not configured"}
                      ready={Boolean(secret?.configured)}
                    />
                  )}
                </CardPanel>
                {provider.secretLabel && !secret?.configured && (
                  <CardFooter className="border-t">
                    <Button render={<Link href="/settings" />} variant="outline" className="w-full">
                      Configure signing secret
                    </Button>
                  </CardFooter>
                )}
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Connection test</CardTitle>
                  <CardDescription>
                    Sends a synthetic event through Pulseboard and the currently configured forward target.
                  </CardDescription>
                  <CardAction>
                    <FlaskConical className="text-muted-foreground" aria-hidden="true" />
                  </CardAction>
                </CardHeader>
                <CardPanel className="flex flex-col gap-4 pt-6">
                  <ConnectionResult result={testResult} configuredTarget={configuredTarget} />
                  <Button
                    onClick={() => void runTest()}
                    disabled={testResult.status === "running"}
                    className="w-full"
                  >
                    {testResult.status === "running" ? <Spinner data-icon="inline-start" /> : <FlaskConical data-icon="inline-start" />}
                    {testResult.status === "running" ? "Testing delivery…" : "Run connection test"}
                  </Button>
                  <p className="text-pretty text-xs text-muted-foreground">
                    This checks capture and forwarding. A real provider event is still required to confirm public reachability and signatures.
                  </p>
                </CardPanel>
              </Card>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupCommand({ label, value }: { label: string; value: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button onClick={() => void copy()} variant="ghost" size="sm" aria-label={`Copy ${label}`}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <code className="block overflow-x-auto rounded-lg border bg-muted/24 px-3 py-2.5 font-mono text-xs">
        {value}
      </code>
    </div>
  );
}

function ReadinessRow({
  icon: Icon,
  label,
  value,
  ready,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  ready: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/24">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground" title={value}>{value}</p>
      </div>
      {ready ? <CheckCircle2 className="size-4 text-success" aria-label="Ready" /> : <Circle className="size-4 text-muted-foreground" aria-label="Not ready" />}
    </div>
  );
}

function ConnectionResult({
  result,
  configuredTarget,
}: {
  result: TestResult;
  configuredTarget: string | null;
}): React.ReactElement {
  if (result.status === "idle") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/24 px-3 py-3">
        <PipelineRow label="Capture endpoint" status="pending" />
        <PipelineRow label={configuredTarget ? "Forward target" : "Capture-only mode"} status="pending" />
        <PipelineRow label="Handler response" status="pending" />
      </div>
    );
  }

  if (result.status === "running") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/24 px-3 py-3 text-sm text-muted-foreground">
        <Spinner />
        Sending synthetic event…
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <Alert variant="error">
        <XCircle />
        <AlertTitle>Delivery failed</AlertTitle>
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    );
  }

  const forwarded = result.webhook.forwardStatus != null && result.webhook.forwardStatus < 400;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-success/32 bg-success/4 px-3 py-3">
      <PipelineRow label="Captured by Pulseboard" status="success" />
      <PipelineRow label={configuredTarget ? "Forwarded to handler" : "Capture-only mode"} status={configuredTarget ? "success" : "pending"} />
      <PipelineRow
        label={forwarded ? `Handler returned ${result.webhook.forwardStatus}` : `Pulseboard returned ${result.responseStatus}`}
        status={forwarded || !configuredTarget ? "success" : "pending"}
      />
      <Link href={`/webhooks/${result.webhook.id}`} className="mt-1 text-xs font-medium underline underline-offset-4">
        Inspect test event
      </Link>
    </div>
  );
}

function PipelineRow({ label, status }: { label: string; status: "pending" | "success" }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-xs">
      {status === "success"
        ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        : <Circle className="size-4 text-muted-foreground" aria-hidden="true" />}
      <span className={cn(status === "pending" && "text-muted-foreground")}>{label}</span>
    </div>
  );
}
