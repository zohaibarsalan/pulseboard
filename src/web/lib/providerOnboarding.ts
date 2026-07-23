export type ProviderId = "stripe" | "github" | "shopify" | "vercel" | "slack" | "generic";
export type DestinationId = "local" | "vercel" | "aws" | "docker" | "custom";
export type ExposureId = "stripe-cli" | "cloudflare" | "ngrok" | "public";

export type ProviderSetup = {
  id: ProviderId;
  label: string;
  description: string;
  defaultPath: string;
  secretLabel: string | null;
  docsUrl: string;
  dashboardInstruction: string;
  exposureOptions: ExposureId[];
};

export const PROVIDERS: ProviderSetup[] = [
  {
    id: "stripe",
    label: "Stripe",
    description: "Payments, invoices, and subscriptions",
    defaultPath: "/stripe",
    secretLabel: "Webhook signing secret",
    docsUrl: "https://docs.stripe.com/webhooks",
    dashboardInstruction: "Use Stripe Workbench to choose events and register the endpoint.",
    exposureOptions: ["stripe-cli", "cloudflare", "ngrok", "public"],
  },
  {
    id: "github",
    label: "GitHub",
    description: "Repository and GitHub App events",
    defaultPath: "/github",
    secretLabel: "Webhook secret",
    docsUrl: "https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks",
    dashboardInstruction: "Open repository or organization Settings → Webhooks → Add webhook.",
    exposureOptions: ["cloudflare", "ngrok", "public"],
  },
  {
    id: "shopify",
    label: "Shopify",
    description: "Orders, products, and app events",
    defaultPath: "/shopify",
    secretLabel: "App client secret",
    docsUrl: "https://shopify.dev/docs/apps/build/webhooks",
    dashboardInstruction: "Add the HTTPS endpoint to your app's webhook subscriptions.",
    exposureOptions: ["cloudflare", "ngrok", "public"],
  },
  {
    id: "vercel",
    label: "Vercel",
    description: "Deployments, projects, and integrations",
    defaultPath: "/vercel",
    secretLabel: "Integration secret",
    docsUrl: "https://vercel.com/docs/webhooks",
    dashboardInstruction: "Create the webhook in your Vercel team or integration settings.",
    exposureOptions: ["cloudflare", "ngrok", "public"],
  },
  {
    id: "slack",
    label: "Slack",
    description: "Events API and interactive callbacks",
    defaultPath: "/slack",
    secretLabel: "Signing secret",
    docsUrl: "https://api.slack.com/apis/events-api",
    dashboardInstruction: "Paste the endpoint into your Slack app's Event Subscriptions page.",
    exposureOptions: ["cloudflare", "ngrok", "public"],
  },
  {
    id: "generic",
    label: "Generic",
    description: "Any service that sends HTTP requests",
    defaultPath: "/webhook",
    secretLabel: null,
    docsUrl: "",
    dashboardInstruction: "Paste the endpoint into the provider's webhook or callback settings.",
    exposureOptions: ["cloudflare", "ngrok", "public"],
  },
];

export const DESTINATIONS: Array<{ value: DestinationId; label: string; placeholder: string }> = [
  { value: "local", label: "Local app", placeholder: "http://localhost:3000" },
  { value: "vercel", label: "Vercel deployment", placeholder: "https://my-app.vercel.app" },
  { value: "aws", label: "AWS Lambda / API Gateway", placeholder: "https://abc123.execute-api.us-east-1.amazonaws.com" },
  { value: "docker", label: "Docker service", placeholder: "http://host.docker.internal:3000" },
  { value: "custom", label: "Custom URL", placeholder: "https://staging.example.com" },
];

export const EXPOSURES: Record<ExposureId, { label: string; description: string }> = {
  "stripe-cli": {
    label: "Stripe CLI",
    description: "Forward sandbox events without a public tunnel.",
  },
  cloudflare: {
    label: "Cloudflare Tunnel",
    description: "Create a temporary public HTTPS endpoint.",
  },
  ngrok: {
    label: "ngrok",
    description: "Expose Pulseboard through an ngrok endpoint.",
  },
  public: {
    label: "Existing public URL",
    description: "Use a deployed or already-tunneled Pulseboard instance.",
  },
};

export function normalizeWebhookPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/webhook";
  return `/${trimmed.replace(/^\/+/, "")}`;
}

export function generateOnboardingCommands(input: {
  provider: ProviderId;
  exposure: ExposureId;
  path: string;
  target: string;
  publicBaseUrl: string;
}): { start: string; expose: string | null; endpoint: string } {
  const path = normalizeWebhookPath(input.path);
  const target = input.target.trim() || "http://localhost:3000";
  const localEndpoint = `http://localhost:4500/hook${path}`;
  const publicBase = input.publicBaseUrl.trim().replace(/\/+$/, "");

  let expose: string | null = null;
  let endpoint = localEndpoint;

  if (input.exposure === "stripe-cli") {
    expose = `stripe listen --forward-to ${localEndpoint}`;
  } else if (input.exposure === "cloudflare") {
    expose = "cloudflared tunnel --url http://localhost:4500";
    endpoint = `<your-trycloudflare-url>/hook${path}`;
  } else if (input.exposure === "ngrok") {
    expose = "ngrok http 4500";
    endpoint = `<your-ngrok-url>/hook${path}`;
  } else {
    endpoint = `${publicBase || "<your-public-pulseboard-url>"}/hook${path}`;
  }

  return {
    start: `npx pulseboard --forward ${target}`,
    expose,
    endpoint,
  };
}

