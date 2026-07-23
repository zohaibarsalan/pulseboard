import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveryFields, targetsForWebhook, validateOverrideTarget } from "./routing.js";

const config = {
  forwardTargets: ["http://localhost:3000"],
  routingRules: [
    { source: "stripe", targets: ["http://localhost:4000"] },
    { pathPrefix: "/audit", targets: ["https://audit.example.com/webhooks"] },
  ],
  allowedForwardHosts: ["staging.example.com"],
};

test("routing uses defaults, replaces them with matches, and combines overlapping rules", () => {
  assert.deepEqual(
    targetsForWebhook(config, { source: "github", path: "/github" }),
    ["http://localhost:3000"],
  );
  assert.deepEqual(
    targetsForWebhook(config, { source: "stripe", path: "/stripe" }),
    ["http://localhost:4000"],
  );
  assert.deepEqual(
    targetsForWebhook(config, { source: "stripe", path: "/audit/payment" }),
    ["http://localhost:4000", "https://audit.example.com/webhooks"],
  );
});

test("override targets allow configured origins and explicit hostname allowlists", () => {
  assert.equal(validateOverrideTarget("http://localhost:3000/custom", config).ok, true);
  assert.equal(validateOverrideTarget("http://localhost:4000/replay", config).ok, true);
  assert.equal(validateOverrideTarget("https://STAGING.EXAMPLE.COM/hooks", config).ok, true);
});

test("override targets reject malformed, unsafe, credentialed, and unapproved destinations", () => {
  const cases: Array<[string, string]> = [
    ["not a url", "invalid_forward_target"],
    ["file:///etc/passwd", "unsupported_forward_protocol"],
    ["https://user:pass@staging.example.com/hook", "forward_target_credentials_not_allowed"],
    ["https://evil.example.net/hook", "forward_target_not_allowed"],
  ];
  for (const [target, reason] of cases) {
    const result = validateOverrideTarget(target, config);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, reason);
  }
});

test("capture-only delivery fields remain explicitly nullable", () => {
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
