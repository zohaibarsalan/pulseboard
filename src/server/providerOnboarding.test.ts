import assert from "node:assert/strict";
import test from "node:test";
import { generateOnboardingCommands, normalizeWebhookPath } from "../web/lib/providerOnboarding.js";

test("normalizes webhook paths without changing nested routes", () => {
  assert.equal(normalizeWebhookPath("stripe"), "/stripe");
  assert.equal(normalizeWebhookPath("///api/webhooks/github"), "/api/webhooks/github");
  assert.equal(normalizeWebhookPath(""), "/webhook");
});

test("generates a local Stripe CLI setup", () => {
  assert.deepEqual(
    generateOnboardingCommands({
      provider: "stripe",
      exposure: "stripe-cli",
      path: "/api/stripe",
      target: "http://localhost:3000",
      publicBaseUrl: "",
    }),
    {
      start: "npx pulseboard --forward http://localhost:3000",
      expose: "stripe listen --forward-to http://localhost:4500/hook/api/stripe",
      endpoint: "http://localhost:4500/hook/api/stripe",
    },
  );
});

test("generates public tunnel and hosted endpoints", () => {
  const cloudflare = generateOnboardingCommands({
    provider: "github",
    exposure: "cloudflare",
    path: "github",
    target: "https://staging.example.com",
    publicBaseUrl: "",
  });
  assert.equal(cloudflare.expose, "cloudflared tunnel --url http://localhost:4500");
  assert.equal(cloudflare.endpoint, "<your-trycloudflare-url>/hook/github");

  const hosted = generateOnboardingCommands({
    provider: "github",
    exposure: "public",
    path: "/github",
    target: "https://staging.example.com",
    publicBaseUrl: "https://hooks.example.com/",
  });
  assert.equal(hosted.endpoint, "https://hooks.example.com/hook/github");
});
