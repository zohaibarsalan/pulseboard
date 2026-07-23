import assert from "node:assert/strict";
import { test } from "node:test";
import { detectSource } from "./detector.js";

test("detects every supported provider and extracts its event type when available", () => {
  const cases: Array<{
    headers: Record<string, string>;
    body: string | null;
    source: string;
    eventType?: string;
  }> = [
    { headers: { "stripe-signature": "sig" }, body: '{"type":"invoice.paid"}', source: "stripe", eventType: "invoice.paid" },
    { headers: { "x-github-event": "push" }, body: "{}", source: "github", eventType: "push" },
    { headers: { "x-shopify-hmac-sha256": "sig", "x-shopify-topic": "orders/create" }, body: "{}", source: "shopify", eventType: "orders/create" },
    { headers: { "x-twilio-signature": "sig" }, body: null, source: "twilio" },
    { headers: { "x-slack-signature": "sig" }, body: '{"type":"event_callback"}', source: "slack", eventType: "event_callback" },
    { headers: { "x-signature-ed25519": "sig" }, body: "{}", source: "discord" },
    { headers: { "linear-delivery": "delivery" }, body: '{"type":"Issue"}', source: "linear", eventType: "Issue" },
    { headers: { "webhook-signature": "sig" }, body: '{"type":"subscription.created"}', source: "polar", eventType: "subscription.created" },
    { headers: { "svix-id": "msg" }, body: '{"type":"user.created"}', source: "clerk", eventType: "user.created" },
    { headers: { "x-vercel-signature": "sig" }, body: '{"type":"deployment.created"}', source: "vercel", eventType: "deployment.created" },
    { headers: { "paddle-signature": "sig" }, body: '{"event_type":"transaction.completed"}', source: "paddle", eventType: "transaction.completed" },
  ];

  for (const scenario of cases) {
    assert.deepEqual(detectSource(scenario.headers, scenario.body), {
      source: scenario.source,
      eventType: scenario.eventType,
    });
  }
});

test("unknown providers use safe body fallbacks without trusting malformed JSON", () => {
  assert.deepEqual(detectSource({}, '{"type":"custom.event"}'), {
    source: "unknown",
    eventType: "custom.event",
  });
  assert.deepEqual(detectSource({}, '{"event":"ping"}'), {
    source: "unknown",
    eventType: "ping",
  });
  assert.deepEqual(detectSource({}, "{broken"), {
    source: "unknown",
    eventType: undefined,
  });
});
