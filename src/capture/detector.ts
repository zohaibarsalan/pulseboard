export type DetectedSource = {
  source: string;
  eventType?: string;
};

type Detector = {
  source: string;
  /** Header that, if present, identifies this provider. */
  header: string;
  /** Pull a human event type from headers/body, best-effort. */
  eventType?: (headers: Record<string, string>, body: string | null) => string | undefined;
};

function jsonField(body: string | null, field: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const value = parsed[field];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

// Detection is header-first because headers are far more stable than payloads.
// Order matters only for providers that might share headers (none do today).
const DETECTORS: Detector[] = [
  {
    source: "stripe",
    header: "stripe-signature",
    eventType: (_h, body) => jsonField(body, "type"),
  },
  {
    source: "github",
    header: "x-github-event",
    eventType: (h) => h["x-github-event"],
  },
  {
    source: "shopify",
    header: "x-shopify-hmac-sha256",
    eventType: (h) => h["x-shopify-topic"],
  },
  {
    source: "twilio",
    header: "x-twilio-signature",
  },
  {
    source: "slack",
    header: "x-slack-signature",
    eventType: (_h, body) => jsonField(body, "type"),
  },
  {
    source: "discord",
    header: "x-signature-ed25519",
  },
  {
    source: "linear",
    header: "linear-delivery",
    eventType: (_h, body) => jsonField(body, "type"),
  },
  {
    source: "polar",
    header: "webhook-signature",
    eventType: (_h, body) => jsonField(body, "type"),
  },
  {
    source: "clerk",
    header: "svix-id",
    eventType: (_h, body) => jsonField(body, "type"),
  },
  {
    source: "vercel",
    header: "x-vercel-signature",
    eventType: (_h, body) => jsonField(body, "type"),
  },
  {
    source: "paddle",
    header: "paddle-signature",
    eventType: (_h, body) => jsonField(body, "event_type"),
  },
];

export function detectSource(
  headers: Record<string, string>,
  body: string | null,
): DetectedSource {
  for (const detector of DETECTORS) {
    if (headers[detector.header] !== undefined) {
      return {
        source: detector.source,
        eventType: detector.eventType?.(headers, body),
      };
    }
  }

  // Fallback: many providers use Svix under the hood (svix-* headers handled
  // above via clerk). If body has a top-level "type", surface it generically.
  return {
    source: "unknown",
    eventType: jsonField(body, "type") ?? jsonField(body, "event"),
  };
}
