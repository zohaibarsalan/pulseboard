import assert from "node:assert/strict";
import { test } from "node:test";
import { SIGNABLE_SOURCES, signFor } from "./signer.js";
import { verifySignature } from "./signature.js";

const secrets: Record<string, string> = {
  stripe: "whsec_stripe",
  github: "github-secret",
  shopify: "shopify-secret",
  slack: "slack-secret",
  clerk: `whsec_${Buffer.from("clerk-secret").toString("base64")}`,
  polar: `whsec_${Buffer.from("polar-secret").toString("base64")}`,
  linear: "linear-secret",
  vercel: "vercel-secret",
  paddle: "paddle-secret",
};

for (const source of SIGNABLE_SOURCES) {
  test(`${source} signatures round-trip through signer and verifier`, () => {
    const body = JSON.stringify({ source, id: 42 });
    const secret = secrets[source]!;
    const headers = signFor(source, body, secret);
    assert.equal(verifySignature({ source, headers, body, secret }).status, "valid");
  });

  test(`${source} signatures reject a modified payload`, () => {
    const body = JSON.stringify({ source, id: 42 });
    const secret = secrets[source]!;
    const headers = signFor(source, body, secret);
    const result = verifySignature({ source, headers, body: `${body} `, secret });
    assert.equal(result.status, "invalid");
    assert.ok(result.notes);
  });

  test(`${source} reports a missing configured secret`, () => {
    const result = verifySignature({ source, headers: {}, body: "{}", secret: null });
    assert.equal(result.status, "no_secret");
    assert.match(result.notes ?? "", new RegExp(source, "i"));
  });
}
