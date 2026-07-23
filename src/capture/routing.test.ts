import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveryFields, targetsForWebhook, validateOverrideTarget } from "./routing.js";

const baseConfig = {
  forwardTargets: ["http://localhost:3000"],
  routingRules: [
    { source: "stripe", targets: ["http://localhost:4000"] },
    { pathPrefix: "/audit", targets: ["https://audit.example.com/webhooks"] },
  ],
  allowedForwardHosts: ["staging.example.com"],
};

const routingCases = [
  { name: "falls back to default forwarding targets", webhook: { source: "github", path: "/github" }, expected: ["http://localhost:3000"] },
  { name: "selects a source routing rule", webhook: { source: "stripe", path: "/stripe" }, expected: ["http://localhost:4000"] },
  { name: "selects a path-prefix routing rule", webhook: { source: "github", path: "/audit/github" }, expected: ["https://audit.example.com/webhooks"] },
  { name: "combines every matching routing rule", webhook: { source: "stripe", path: "/audit/payment" }, expected: ["http://localhost:4000", "https://audit.example.com/webhooks"] },
  { name: "does not treat a partial source as a match", webhook: { source: "stripe-test", path: "/stripe" }, expected: ["http://localhost:3000"] },
];

for (const scenario of routingCases) {
  test(scenario.name, () => {
    assert.deepEqual(targetsForWebhook(baseConfig, scenario.webhook), scenario.expected);
  });
}

const targetCases: Array<{ name: string; target: string; ok: boolean; reason?: string }> = [
  { name: "allows a configured origin with a different path", target: "http://localhost:3000/custom", ok: true },
  { name: "allows an origin configured by a routing rule", target: "http://localhost:4000/replay", ok: true },
  { name: "allows an allowlisted hostname", target: "https://staging.example.com/hooks", ok: true },
  { name: "matches allowlisted hostnames case-insensitively", target: "https://STAGING.EXAMPLE.COM/hooks", ok: true },
  { name: "rejects malformed target URLs", target: "not a url", ok: false, reason: "invalid_forward_target" },
  { name: "rejects non-HTTP protocols", target: "file:///etc/passwd", ok: false, reason: "unsupported_forward_protocol" },
  { name: "rejects embedded credentials", target: "https://user:pass@staging.example.com/hook", ok: false, reason: "forward_target_credentials_not_allowed" },
  { name: "rejects unconfigured hosts", target: "https://evil.example.net/hook", ok: false, reason: "forward_target_not_allowed" },
];

for (const scenario of targetCases) {
  test(scenario.name, () => {
    const result = validateOverrideTarget(scenario.target, baseConfig);
    assert.equal(result.ok, scenario.ok);
    if (!result.ok) assert.equal(result.reason, scenario.reason);
  });
}

test("empty delivery results serialize as nullable fields", () => {
  assert.deepEqual(deliveryFields([]), {
    forwardedTo: null,
    forwardStatus: null,
    forwardDurationMs: null,
    forwardError: null,
    responseHeadersJson: null,
    responseBody: null,
    responseContentType: null,
    responseBodyTruncated: false,
    deliveriesJson: null,
  });
});
