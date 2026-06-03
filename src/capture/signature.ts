import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureStatus =
  | "valid"
  | "invalid"
  | "no_secret"
  | "unverifiable"
  | "not_applicable";

export type SignatureResult = {
  status: SignatureStatus;
  notes?: string;
};

// A Verifier returns valid/invalid given the headers, body, and a secret.
// It can also return unverifiable with notes if the input shape is wrong.
type Verifier = (headers: Record<string, string>, body: string, secret: string) => SignatureResult;

function safeEqualString(a: string, b: string): boolean {
  // Length mismatch always fails — timingSafeEqual requires equal-length buffers.
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function hmacHex(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("hex");
}

function hmacBase64(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("base64");
}

// Stripe: header `stripe-signature: t=<ts>,v1=<hex>[,v0=<hex>]`. HMAC-SHA256 of
// `<ts>.<body>` with the signing secret.
const stripe: Verifier = (headers, body, secret) => {
  const sig = headers["stripe-signature"];
  if (!sig) return { status: "unverifiable", notes: "Missing stripe-signature header" };

  const parts = Object.fromEntries(
    sig.split(",").map((pair) => {
      const [k, v] = pair.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return { status: "unverifiable", notes: "Malformed stripe-signature" };

  const expected = hmacHex(secret, `${timestamp}.${body}`);
  return safeEqualString(expected, v1)
    ? { status: "valid" }
    : { status: "invalid", notes: "Computed HMAC does not match v1" };
};

// GitHub: header `x-hub-signature-256: sha256=<hex>`. HMAC-SHA256 of body.
const github: Verifier = (headers, body, secret) => {
  const sig = headers["x-hub-signature-256"];
  if (!sig) return { status: "unverifiable", notes: "Missing x-hub-signature-256 header" };
  if (!sig.startsWith("sha256=")) {
    return { status: "unverifiable", notes: "Expected sha256= prefix" };
  }
  const expected = hmacHex(secret, body);
  return safeEqualString(expected, sig.slice("sha256=".length))
    ? { status: "valid" }
    : { status: "invalid", notes: "Computed HMAC does not match signature" };
};

// Shopify: header `x-shopify-hmac-sha256: <base64>`. HMAC-SHA256 of body, base64.
const shopify: Verifier = (headers, body, secret) => {
  const sig = headers["x-shopify-hmac-sha256"];
  if (!sig) return { status: "unverifiable", notes: "Missing x-shopify-hmac-sha256 header" };
  const expected = hmacBase64(secret, body);
  return safeEqualString(expected, sig)
    ? { status: "valid" }
    : { status: "invalid", notes: "Computed HMAC does not match signature" };
};

// Slack: headers `x-slack-signature: v0=<hex>` and `x-slack-request-timestamp: <unix>`.
// HMAC-SHA256 of `v0:<ts>:<body>` with signing secret.
const slack: Verifier = (headers, body, secret) => {
  const sig = headers["x-slack-signature"];
  const ts = headers["x-slack-request-timestamp"];
  if (!sig || !ts) return { status: "unverifiable", notes: "Missing slack signature headers" };
  if (!sig.startsWith("v0=")) return { status: "unverifiable", notes: "Expected v0= prefix" };
  const expected = `v0=${hmacHex(secret, `v0:${ts}:${body}`)}`;
  return safeEqualString(expected, sig)
    ? { status: "valid" }
    : { status: "invalid", notes: "Computed HMAC does not match signature" };
};

// Svix (Clerk, Polar, and many others). Headers: svix-id, svix-timestamp,
// svix-signature: `v1,<base64> [v1,<base64> ...]`. HMAC-SHA256 of
// `<id>.<ts>.<body>` with secret. Secret format `whsec_<base64>` — the base64
// part is the actual key. Any one signature matching is enough.
const svix: Verifier = (headers, body, secret) => {
  const id = headers["svix-id"] ?? headers["webhook-id"];
  const ts = headers["svix-timestamp"] ?? headers["webhook-timestamp"];
  const sig = headers["svix-signature"] ?? headers["webhook-signature"];
  if (!id || !ts || !sig) {
    return { status: "unverifiable", notes: "Missing svix-id, svix-timestamp, or svix-signature" };
  }
  const rawSecret = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  const expected = createHmac("sha256", rawSecret).update(`${id}.${ts}.${body}`).digest("base64");
  const candidates = sig.split(" ").map((s) => s.replace(/^v1,/, ""));
  const matched = candidates.some((c) => safeEqualString(c, expected));
  return matched
    ? { status: "valid" }
    : { status: "invalid", notes: "No signature in header matches computed HMAC" };
};

// Linear: header `linear-signature: <hex>`. HMAC-SHA256 of body.
const linear: Verifier = (headers, body, secret) => {
  const sig = headers["linear-signature"];
  if (!sig) return { status: "unverifiable", notes: "Missing linear-signature header" };
  const expected = hmacHex(secret, body);
  return safeEqualString(expected, sig)
    ? { status: "valid" }
    : { status: "invalid", notes: "Computed HMAC does not match signature" };
};

// Vercel: header `x-vercel-signature: <hex>`. HMAC-SHA1 of body.
const vercel: Verifier = (headers, body, secret) => {
  const sig = headers["x-vercel-signature"];
  if (!sig) return { status: "unverifiable", notes: "Missing x-vercel-signature header" };
  const expected = hmacHex(secret, body, "sha1");
  return safeEqualString(expected, sig)
    ? { status: "valid" }
    : { status: "invalid", notes: "Computed HMAC does not match signature" };
};

// Paddle: header `paddle-signature: ts=<unix>;h1=<hex>`. HMAC-SHA256 of `<ts>:<body>`.
const paddle: Verifier = (headers, body, secret) => {
  const sig = headers["paddle-signature"];
  if (!sig) return { status: "unverifiable", notes: "Missing paddle-signature header" };
  const parts = Object.fromEntries(
    sig.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );
  if (!parts.ts || !parts.h1) return { status: "unverifiable", notes: "Malformed paddle-signature" };
  const expected = hmacHex(secret, `${parts.ts}:${body}`);
  return safeEqualString(expected, parts.h1)
    ? { status: "valid" }
    : { status: "invalid", notes: "Computed HMAC does not match h1" };
};

const VERIFIERS: Record<string, Verifier> = {
  stripe,
  github,
  shopify,
  slack,
  clerk: svix,
  polar: svix,
  linear,
  vercel,
  paddle,
};

// Sources we recognize but can't verify yet (need URL context, public keys, etc.).
const UNVERIFIABLE_KNOWN: Record<string, string> = {
  twilio: "Twilio signatures depend on the full request URL, which differs through a tunnel",
  discord: "Discord uses Ed25519 with a public key — not yet implemented",
};

export const SUPPORTED_SOURCES = Object.keys(VERIFIERS);

export function verifySignature(opts: {
  source: string;
  headers: Record<string, string>;
  body: string | null;
  secret: string | null;
}): SignatureResult {
  // Unknown sources never get a verification attempt.
  if (opts.source === "unknown") return { status: "not_applicable" };

  if (UNVERIFIABLE_KNOWN[opts.source]) {
    return { status: "unverifiable", notes: UNVERIFIABLE_KNOWN[opts.source] };
  }

  const verifier = VERIFIERS[opts.source];
  if (!verifier) return { status: "not_applicable" };

  if (!opts.secret) {
    return { status: "no_secret", notes: `Add a ${opts.source} signing secret in Settings to verify` };
  }

  return verifier(opts.headers, opts.body ?? "", opts.secret);
}
