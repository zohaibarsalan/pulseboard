import { createServer } from "node:http";
import { createHmac } from "node:crypto";

// Dev helper: runs a tiny "echo" server that acts as the forward target, and
// periodically sends realistic fake webhooks to Webhook Studio's capture URL so
// the UI always has live traffic to show. Webhooks are signed with known dev
// secrets, and those secrets are pushed into Studio on startup so signature
// verification shows valid/invalid badges out of the box.

const STUDIO_URL = process.env.STUDIO_URL ?? "http://localhost:4500";
const ECHO_PORT = Number(process.env.ECHO_PORT ?? 3999);
const INTERVAL_MS = Number(process.env.SENDER_INTERVAL ?? 2500);

// Known dev secrets — also pushed into Studio so verification matches.
const DEV_SECRETS: Record<string, string> = {
  stripe: "whsec_test_stripe_secret_for_dev",
  github: "test_github_secret_for_dev",
  shopify: "test_shopify_secret_for_dev",
  clerk: "whsec_dGVzdF9jbGVya19zZWNyZXQ=", // whsec_ + base64
};

// ── Echo target server (this is what Studio forwards to) ──────────────────────
const echo = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    // Occasionally fail so the UI shows error states.
    if (Math.random() < 0.15) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "simulated downstream failure" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  });
});
echo.listen(ECHO_PORT, () => {
  console.log(`[dev-sender] echo target on http://localhost:${ECHO_PORT}`);
});

// ── Fake webhook fixtures ─────────────────────────────────────────────────────
type Fixture = {
  source: string;
  path: string;
  /** Returns the headers + body to send. */
  build: () => { headers: Record<string, string>; body: string };
};

function hmacHex(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("hex");
}

function hmacBase64(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("base64");
}

const rand = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)]!;

// ~15% of webhooks get a corrupted signature so the UI shows invalid states too.
const tamper = (): boolean => Math.random() < 0.15;

const FIXTURES: Fixture[] = [
  {
    source: "stripe",
    path: "/stripe",
    build: () => {
      const body = JSON.stringify({
        type: rand(["payment_intent.succeeded", "charge.refunded", "customer.subscription.created", "invoice.paid"]),
        data: { object: { id: `pi_${Math.random().toString(36).slice(2, 12)}` } },
      });
      const ts = Math.floor(Date.now() / 1000).toString();
      let sig = hmacHex(DEV_SECRETS.stripe!, `${ts}.${body}`);
      if (tamper()) sig = "0".repeat(sig.length);
      return { headers: { "stripe-signature": `t=${ts},v1=${sig}` }, body };
    },
  },
  {
    source: "github",
    path: "/github",
    build: () => {
      const body = JSON.stringify({
        action: "opened",
        repository: { full_name: "acme/widgets" },
        sender: { login: rand(["alice", "bob", "carol"]) },
      });
      let sig = hmacHex(DEV_SECRETS.github!, body);
      if (tamper()) sig = "0".repeat(sig.length);
      return {
        headers: { "x-github-event": rand(["push", "pull_request", "issues", "star"]), "x-hub-signature-256": `sha256=${sig}` },
        body,
      };
    },
  },
  {
    source: "shopify",
    path: "/shopify",
    build: () => {
      const body = JSON.stringify({
        id: Math.floor(Math.random() * 1e9),
        total_price: rand(["29.99", "59.00", "120.50"]),
        currency: "USD",
      });
      let sig = hmacBase64(DEV_SECRETS.shopify!, body);
      if (tamper()) sig = sig.split("").reverse().join("");
      return { headers: { "x-shopify-hmac-sha256": sig }, body };
    },
  },
  {
    source: "clerk",
    path: "/clerk",
    build: () => {
      const body = JSON.stringify({
        type: rand(["user.created", "user.updated", "session.created"]),
        data: { id: `user_${Math.random().toString(36).slice(2, 10)}` },
      });
      const id = `msg_${Math.random().toString(36).slice(2, 10)}`;
      const ts = Math.floor(Date.now() / 1000).toString();
      const rawSecret = Buffer.from(DEV_SECRETS.clerk!.slice(6), "base64");
      let sig = createHmac("sha256", rawSecret).update(`${id}.${ts}.${body}`).digest("base64");
      if (tamper()) sig = sig.split("").reverse().join("");
      return {
        headers: {
          "svix-id": id,
          "svix-timestamp": ts,
          "svix-signature": `v1,${sig}`,
        },
        body,
      };
    },
  },
  {
    source: "unknown",
    path: "/custom/webhook",
    build: () => {
      const body = JSON.stringify({ event: rand(["ping", "sync", "heartbeat"]), ts: Date.now() });
      return { headers: { "x-custom-source": "internal" }, body };
    },
  },
];

async function sendOne(): Promise<void> {
  const fixture = FIXTURES[Math.floor(Math.random() * FIXTURES.length)]!;
  const { headers, body } = fixture.build();
  try {
    await fetch(`${STUDIO_URL}/hook${fixture.path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
  } catch (err) {
    console.error("[dev-sender] send failed:", err instanceof Error ? err.message : err);
  }
}

// Push the dev signing secrets into Studio so verification works out of the box.
// Retries until the API is reachable.
async function seedSecrets(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      for (const [source, secret] of Object.entries(DEV_SECRETS)) {
        const res = await fetch(`${STUDIO_URL}/api/secrets/${source}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ secret }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
      }
      console.log("[dev-sender] seeded dev signing secrets");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.warn("[dev-sender] failed to seed secrets after 30 attempts");
}

void seedSecrets().then(() => {
  console.log(`[dev-sender] sending fake webhooks to ${STUDIO_URL}/hook every ${INTERVAL_MS}ms`);
  setInterval(() => void sendOne(), INTERVAL_MS);
  void sendOne();
  setTimeout(() => void sendOne(), 600);
});
