export type DiagnosticReason =
  | "healthy"
  | "capture_only"
  | "signature_invalid"
  | "signature_missing"
  | "signature_unverifiable"
  | "connection_refused"
  | "dns_failure"
  | "tls_failure"
  | "timeout"
  | "redirect"
  | "route_not_found"
  | "unauthorized"
  | "rate_limited"
  | "invalid_request"
  | "handler_error"
  | "network_error"
  | "slow_handler"
  | "unexpected_status";

export type DeliveryDiagnosis = {
  reason: DiagnosticReason;
  severity: "success" | "info" | "warning" | "error";
  title: string;
  summary: string;
  action: string | null;
};

export type DiagnosableDelivery = {
  forwardedTo?: string | null;
  forwardStatus?: number | null;
  forwardDurationMs?: number | null;
  forwardError?: string | null;
  signatureStatus?: string | null;
  signatureNotes?: string | null;
  path?: string | null;
};

export function diagnoseDelivery(input: DiagnosableDelivery): DeliveryDiagnosis {
  if (input.signatureStatus === "invalid") {
    return {
      reason: "signature_invalid",
      severity: "error",
      title: "Signature verification failed",
      summary: input.signatureNotes || "The request signature does not match the configured secret.",
      action: "Confirm the signing secret belongs to this provider environment and that the raw request body is unchanged.",
    };
  }
  if (input.signatureStatus === "no_secret") {
    return {
      reason: "signature_missing",
      severity: "warning",
      title: "Signing secret is not configured",
      summary: input.signatureNotes || "Pulseboard captured the request but could not verify its sender.",
      action: "Add the provider signing secret in Settings, then send a new event.",
    };
  }
  if (input.signatureStatus === "unverifiable") {
    return {
      reason: "signature_unverifiable",
      severity: "warning",
      title: "Signature could not be verified",
      summary: input.signatureNotes || "The provider signature headers were missing or malformed.",
      action: "Compare the captured signature headers with the provider's webhook configuration.",
    };
  }
  if (!input.forwardedTo) {
    return {
      reason: "capture_only",
      severity: "info",
      title: "Captured without forwarding",
      summary: "Pulseboard is running in capture-only mode, so the application handler was not called.",
      action: "Start Pulseboard with --forward <url> or use Connect to generate the command.",
    };
  }

  const error = input.forwardError?.toLowerCase() ?? "";
  if (error) {
    if (error.includes("timed out") || error.includes("timeout") || error.includes("abort")) {
      return {
        reason: "timeout",
        severity: "error",
        title: "Handler timed out",
        summary: input.forwardError!,
        action: "Acknowledge the webhook quickly and move expensive work to a queue or background job.",
      };
    }
    if (error.includes("econnrefused") || error.includes("connection refused") || error.includes("fetch failed")) {
      return {
        reason: "connection_refused",
        severity: "error",
        title: "Could not connect to the handler",
        summary: input.forwardError!,
        action: "Confirm the application is running, the port is correct, and the target is reachable from Pulseboard.",
      };
    }
    if (error.includes("enotfound") || error.includes("getaddrinfo") || error.includes("dns")) {
      return {
        reason: "dns_failure",
        severity: "error",
        title: "Target hostname could not be resolved",
        summary: input.forwardError!,
        action: "Check the target hostname and DNS/network configuration.",
      };
    }
    if (error.includes("certificate") || error.includes("tls") || error.includes("ssl")) {
      return {
        reason: "tls_failure",
        severity: "error",
        title: "TLS connection failed",
        summary: input.forwardError!,
        action: "Use a valid certificate chain or a local HTTP target during development.",
      };
    }
    return {
      reason: "network_error",
      severity: "error",
      title: "Forwarding failed before a response",
      summary: input.forwardError!,
      action: "Check the target URL, application logs, and network access from the Pulseboard process.",
    };
  }

  const status = input.forwardStatus;
  if (status == null) {
    return {
      reason: "network_error",
      severity: "error",
      title: "No handler response was recorded",
      summary: "Pulseboard forwarded the request but did not receive an HTTP status.",
      action: "Check the target application and Pulseboard logs.",
    };
  }
  if (status >= 200 && status < 300) {
    if ((input.forwardDurationMs ?? 0) >= 5_000) {
      return {
        reason: "slow_handler",
        severity: "warning",
        title: "Handler responded slowly",
        summary: `The handler returned ${status} after ${formatDiagnosticDuration(input.forwardDurationMs ?? 0)}.`,
        action: "Return a 2xx acknowledgement earlier and process the event asynchronously.",
      };
    }
    return {
      reason: "healthy",
      severity: "success",
      title: "Delivery succeeded",
      summary: `The handler returned ${status} in ${formatDiagnosticDuration(input.forwardDurationMs ?? 0)}.`,
      action: null,
    };
  }
  if (status >= 300 && status < 400) {
    return {
      reason: "redirect",
      severity: "error",
      title: "Handler returned a redirect",
      summary: `The target returned ${status}. Pulseboard does not follow forwarding redirects.`,
      action: "Point Pulseboard directly at the final webhook handler URL.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      reason: "unauthorized",
      severity: "error",
      title: "Handler rejected authentication",
      summary: `The handler returned ${status}.`,
      action: "Check expected authorization headers, provider signatures, and environment-specific secrets.",
    };
  }
  if (status === 404) {
    return {
      reason: "route_not_found",
      severity: "error",
      title: "Webhook route was not found",
      summary: `The handler returned 404 for ${input.path || "the forwarded path"}.`,
      action: "Confirm the Pulseboard capture path maps to a route implemented by the target application.",
    };
  }
  if (status === 408 || status === 504) {
    return {
      reason: "timeout",
      severity: "error",
      title: "Handler timed out",
      summary: `The handler returned ${status}.`,
      action: "Acknowledge the webhook quickly and move expensive work to a queue or background job.",
    };
  }
  if (status === 429) {
    return {
      reason: "rate_limited",
      severity: "warning",
      title: "Handler rate limited the event",
      summary: "The handler returned 429 Too Many Requests.",
      action: "Inspect concurrency limits and retry policy before replaying the event.",
    };
  }
  if (status === 400 || status === 409 || status === 422) {
    return {
      reason: "invalid_request",
      severity: "error",
      title: "Handler rejected the payload",
      summary: `The handler returned ${status}.`,
      action: "Inspect the response body, required fields, idempotency constraints, and expected event version.",
    };
  }
  if (status >= 500) {
    return {
      reason: "handler_error",
      severity: "error",
      title: "Handler failed while processing the event",
      summary: `The handler returned ${status}.`,
      action: "Inspect the response body and application logs, fix the handler, then replay this exact event.",
    };
  }
  return {
    reason: "unexpected_status",
    severity: "error",
    title: "Handler returned an unsuccessful status",
    summary: `The handler returned ${status}.`,
    action: "Inspect the response and application logs before replaying the event.",
  };
}

export const DIAGNOSTIC_REASON_LABELS: Record<Exclude<DiagnosticReason, "healthy">, string> = {
  capture_only: "Capture only",
  signature_invalid: "Invalid signature",
  signature_missing: "Missing secret",
  signature_unverifiable: "Unverifiable signature",
  connection_refused: "Connection refused",
  dns_failure: "DNS failure",
  tls_failure: "TLS failure",
  timeout: "Timeout",
  redirect: "Redirect",
  route_not_found: "Route not found",
  unauthorized: "Unauthorized",
  rate_limited: "Rate limited",
  invalid_request: "Rejected payload",
  handler_error: "Handler error",
  network_error: "Network error",
  slow_handler: "Slow handler",
  unexpected_status: "Other status",
};

function formatDiagnosticDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}
