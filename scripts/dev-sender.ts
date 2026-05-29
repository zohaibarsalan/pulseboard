import { createServer } from "node:http";

// Dev helper: runs a tiny "echo" server that acts as the forward target, and
// periodically sends realistic fake webhooks to Webhook Studio's capture URL so
// the UI always has live traffic to show.

const STUDIO_URL = process.env.STUDIO_URL ?? "http://localhost:4500";
const ECHO_PORT = Number(process.env.ECHO_PORT ?? 3999);
const INTERVAL_MS = Number(process.env.SENDER_INTERVAL ?? 2500);

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
  header: [string, string];
  build: () => Record<string, unknown>;
};

const rand = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)]!;

const FIXTURES: Fixture[] = [
  {
    source: "stripe",
    path: "/stripe",
    header: ["stripe-signature", "t=1614556800,v1=fakesig"],
    build: () => ({
      type: rand(["payment_intent.succeeded", "charge.refunded", "customer.subscription.created", "invoice.paid"]),
      data: { object: { id: `pi_${Math.random().toString(36).slice(2, 12)}`, amount: Math.floor(rand(["1999", "4999", "9900"]) as unknown as number) } },
    }),
  },
  {
    source: "github",
    path: "/github",
    header: ["x-github-event", rand(["push", "pull_request", "issues", "star"])],
    build: () => ({
      action: "opened",
      repository: { full_name: "acme/widgets" },
      sender: { login: rand(["alice", "bob", "carol"]) },
    }),
  },
  {
    source: "shopify",
    path: "/shopify",
    header: ["x-shopify-hmac-sha256", "fakehmac=="],
    build: () => ({
      id: Math.floor(Math.random() * 1e9),
      total_price: rand(["29.99", "59.00", "120.50"]),
      currency: "USD",
    }),
  },
  {
    source: "clerk",
    path: "/clerk",
    header: ["svix-id", `msg_${Math.random().toString(36).slice(2, 10)}`],
    build: () => ({
      type: rand(["user.created", "user.updated", "session.created"]),
      data: { id: `user_${Math.random().toString(36).slice(2, 10)}` },
    }),
  },
  {
    source: "unknown",
    path: "/custom/webhook",
    header: ["x-custom-source", "internal"],
    build: () => ({ event: rand(["ping", "sync", "heartbeat"]), ts: Date.now() }),
  },
];

async function sendOne(): Promise<void> {
  const fixture = FIXTURES[Math.floor(Math.random() * FIXTURES.length)]!;
  const body = JSON.stringify(fixture.build());
  try {
    await fetch(`${STUDIO_URL}/hook${fixture.path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [fixture.header[0]]: fixture.header[1],
      },
      body,
    });
  } catch (err) {
    console.error("[dev-sender] send failed:", err instanceof Error ? err.message : err);
  }
}

console.log(`[dev-sender] sending fake webhooks to ${STUDIO_URL}/hook every ${INTERVAL_MS}ms`);
setInterval(() => void sendOne(), INTERVAL_MS);
// Fire a couple immediately so the UI isn't empty on first load.
void sendOne();
setTimeout(() => void sendOne(), 600);
