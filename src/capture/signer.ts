import { createHmac, randomBytes } from "node:crypto";

// Producers — given a source, body, and secret, return the headers a real
// provider would attach. Mirrors capture/signature.ts (which verifies) so the
// loop is closed: sign here, capture there, badge shows valid.

type Signer = (body: string, secret: string) => Record<string, string>;

function hmacHex(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("hex");
}

function hmacBase64(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("base64");
}

const SIGNERS: Record<string, Signer> = {
  stripe: (body, secret) => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = hmacHex(secret, `${ts}.${body}`);
    return { "stripe-signature": `t=${ts},v1=${sig}` };
  },
  github: (body, secret) => ({ "x-hub-signature-256": `sha256=${hmacHex(secret, body)}` }),
  shopify: (body, secret) => ({ "x-shopify-hmac-sha256": hmacBase64(secret, body) }),
  slack: (body, secret) => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = hmacHex(secret, `v0:${ts}:${body}`);
    return { "x-slack-request-timestamp": ts, "x-slack-signature": `v0=${sig}` };
  },
  clerk: (body, secret) => {
    // svix-* format. Secret may be `whsec_<base64>` or raw — match the verifier.
    const id = `msg_${randomBytes(10).toString("hex")}`;
    const ts = Math.floor(Date.now() / 1000).toString();
    const rawSecret = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
    const sig = createHmac("sha256", rawSecret).update(`${id}.${ts}.${body}`).digest("base64");
    return {
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": `v1,${sig}`,
    };
  },
  polar: (body, secret) => SIGNERS.clerk!(body, secret),
  linear: (body, secret) => ({ "linear-signature": hmacHex(secret, body) }),
  vercel: (body, secret) => ({ "x-vercel-signature": hmacHex(secret, body, "sha1") }),
  paddle: (body, secret) => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = hmacHex(secret, `${ts}:${body}`);
    return { "paddle-signature": `ts=${ts};h1=${sig}` };
  },
};

export const SIGNABLE_SOURCES = Object.keys(SIGNERS);

export function signFor(source: string, body: string, secret: string): Record<string, string> {
  const signer = SIGNERS[source];
  if (!signer) return {};
  return signer(body, secret);
}
