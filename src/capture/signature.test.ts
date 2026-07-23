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

test("every signable provider round-trips through its real signer and verifier", () => {
  for (const source of SIGNABLE_SOURCES) {
    const body = JSON.stringify({ source, id: 42 });
    const secret = secrets[source]!;
    const headers = signFor(source, body, secret);
    assert.equal(
      verifySignature({ source, headers, body, secret }).status,
      "valid",
      `${source} should verify its generated signature`,
    );
  }
});

test("every provider rejects payload tampering after signing", () => {
  for (const source of SIGNABLE_SOURCES) {
    const body = JSON.stringify({ source, id: 42 });
    const secret = secrets[source]!;
    const headers = signFor(source, body, secret);
    assert.equal(
      verifySignature({ source, headers, body: `${body} `, secret }).status,
      "invalid",
      `${source} should reject modified bytes`,
    );
  }
});

test("recognized providers report missing secrets while unknown sources remain not applicable", () => {
  for (const source of SIGNABLE_SOURCES) {
    const result = verifySignature({ source, headers: {}, body: "{}", secret: null });
    assert.equal(result.status, "no_secret");
    assert.match(result.notes ?? "", new RegExp(source, "i"));
  }
  assert.equal(
    verifySignature({ source: "unknown", headers: {}, body: "{}", secret: null }).status,
    "not_applicable",
  );
});
