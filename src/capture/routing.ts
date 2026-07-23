import type { Config } from "../config/index.js";
import type { ForwardResult } from "./forwarder.js";

export function targetsForWebhook(
  config: Pick<Config, "forwardTargets" | "routingRules">,
  webhook: { path: string; source: string },
): string[] {
  const matching = config.routingRules.filter((rule) => {
    const pathMatches = !rule.pathPrefix || webhook.path.startsWith(rule.pathPrefix);
    const sourceMatches = !rule.source || webhook.source === rule.source;
    return pathMatches && sourceMatches;
  });
  return Array.from(new Set(matching.length > 0 ? matching.flatMap((rule) => rule.targets) : config.forwardTargets));
}

export function deliveryFields(results: ForwardResult[]): {
  forwardedTo: string | null;
  forwardStatus: number | null;
  forwardDurationMs: number | null;
  forwardError: string | null;
  responseHeadersJson: string | null;
  responseBody: string | null;
  responseContentType: string | null;
  responseBodyTruncated: boolean;
  deliveriesJson: string | null;
} {
  const primary = results[0];
  return {
    forwardedTo: primary?.target ?? null,
    forwardStatus: primary?.status ?? null,
    forwardDurationMs: primary?.durationMs ?? null,
    forwardError: primary?.error ?? null,
    responseHeadersJson: primary ? JSON.stringify(primary.responseHeaders) : null,
    responseBody: primary?.responseBody ?? null,
    responseContentType: primary?.responseContentType ?? null,
    responseBodyTruncated: primary?.responseBodyTruncated ?? false,
    deliveriesJson: results.length > 0 ? JSON.stringify(results) : null,
  };
}

export function validateOverrideTarget(
  target: string,
  config: Pick<Config, "forwardTargets" | "routingRules" | "allowedForwardHosts">,
): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { ok: false, reason: "invalid_forward_target" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_forward_protocol" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "forward_target_credentials_not_allowed" };
  }

  const configured = [
    ...config.forwardTargets,
    ...config.routingRules.flatMap((rule) => rule.targets),
  ].some((candidate) => {
    try {
      return new URL(candidate).origin === url.origin;
    } catch {
      return false;
    }
  });
  const allowlisted = config.allowedForwardHosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase());
  if (!configured && !allowlisted) {
    return { ok: false, reason: "forward_target_not_allowed" };
  }
  return { ok: true, url: url.toString().replace(/\/$/, "") };
}
