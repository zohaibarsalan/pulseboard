import assert from "node:assert/strict";
import { test } from "node:test";
import { detectSource } from "./detector.js";

const cases: Array<{
  name: string;
  headers: Record<string, string>;
  body: string | null;
  source: string;
  eventType?: string;
}> = [
  { name: "detects Stripe and its JSON event type", headers: { "stripe-signature": "sig" }, body: '{"type":"invoice.paid"}', source: "stripe", eventType: "invoice.paid" },
  { name: "detects GitHub from its event header", headers: { "x-github-event": "push" }, body: "{}", source: "github", eventType: "push" },
  { name: "detects Shopify and its topic", headers: { "x-shopify-hmac-sha256": "sig", "x-shopify-topic": "orders/create" }, body: "{}", source: "shopify", eventType: "orders/create" },
  { name: "detects Twilio", headers: { "x-twilio-signature": "sig" }, body: null, source: "twilio" },
  { name: "detects Slack and its JSON type", headers: { "x-slack-signature": "sig" }, body: '{"type":"event_callback"}', source: "slack", eventType: "event_callback" },
  { name: "detects Discord", headers: { "x-signature-ed25519": "sig" }, body: "{}", source: "discord" },
  { name: "detects Linear and its JSON type", headers: { "linear-delivery": "delivery" }, body: '{"type":"Issue"}', source: "linear", eventType: "Issue" },
  { name: "detects Polar and its JSON type", headers: { "webhook-signature": "sig" }, body: '{"type":"subscription.created"}', source: "polar", eventType: "subscription.created" },
  { name: "detects Clerk and its JSON type", headers: { "svix-id": "msg" }, body: '{"type":"user.created"}', source: "clerk", eventType: "user.created" },
  { name: "detects Vercel and its JSON type", headers: { "x-vercel-signature": "sig" }, body: '{"type":"deployment.created"}', source: "vercel", eventType: "deployment.created" },
  { name: "detects Paddle and event_type", headers: { "paddle-signature": "sig" }, body: '{"event_type":"transaction.completed"}', source: "paddle", eventType: "transaction.completed" },
  { name: "uses a generic top-level type for unknown providers", headers: {}, body: '{"type":"custom.event"}', source: "unknown", eventType: "custom.event" },
  { name: "uses a generic top-level event fallback", headers: {}, body: '{"event":"ping"}', source: "unknown", eventType: "ping" },
  { name: "tolerates invalid JSON bodies", headers: {}, body: "{broken", source: "unknown" },
  { name: "keeps provider precedence when multiple identifying headers exist", headers: { "stripe-signature": "a", "x-github-event": "push" }, body: '{"type":"charge.refunded"}', source: "stripe", eventType: "charge.refunded" },
];

for (const scenario of cases) {
  test(scenario.name, () => {
    assert.deepEqual(detectSource(scenario.headers, scenario.body), {
      source: scenario.source,
      eventType: scenario.eventType,
    });
  });
}
