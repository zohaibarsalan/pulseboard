// Sample payloads and default paths for the sender's preset dropdown. Bodies
// are realistic-but-fake — enough shape for the user's app to exercise its
// handler, but no PII or real account IDs.

export type Preset = {
  id: string;
  label: string;
  source: string;
  defaultPath: string;
  /** Pretty-printed JSON body. Sender minifies on demand. */
  sampleBody: string;
  /** Extra non-signature headers worth pre-filling. */
  extraHeaders?: Record<string, string>;
};

const stripePayment = {
  id: "evt_test_webhook",
  object: "event",
  api_version: "2024-04-10",
  created: Math.floor(Date.now() / 1000),
  type: "payment_intent.succeeded",
  livemode: false,
  data: {
    object: {
      id: "pi_test_1234567890",
      object: "payment_intent",
      amount: 4999,
      currency: "usd",
      status: "succeeded",
      customer: "cus_test_1234567890",
    },
  },
};

const githubPush = {
  ref: "refs/heads/main",
  before: "0000000000000000000000000000000000000000",
  after: "abcdef1234567890abcdef1234567890abcdef12",
  repository: { full_name: "acme/widgets", default_branch: "main" },
  pusher: { name: "alice", email: "alice@example.com" },
  commits: [
    {
      id: "abcdef1234567890abcdef1234567890abcdef12",
      message: "Fix login redirect",
      author: { name: "Alice", email: "alice@example.com" },
    },
  ],
};

const shopifyOrder = {
  id: 4567891234,
  email: "customer@example.com",
  total_price: "59.99",
  currency: "USD",
  financial_status: "paid",
  line_items: [{ id: 12345, title: "Blue Widget", quantity: 1, price: "59.99" }],
};

const clerkUserCreated = {
  type: "user.created",
  object: "event",
  data: {
    id: "user_test_abc123",
    email_addresses: [{ email_address: "new@example.com" }],
    first_name: "Casey",
    last_name: "Jordan",
    created_at: Date.now(),
  },
};

const slackEvent = {
  type: "event_callback",
  team_id: "T0123456",
  event: { type: "app_mention", user: "U0123456", text: "<@U999> hello", channel: "C0123456" },
};

const linearIssue = {
  action: "create",
  type: "Issue",
  data: { id: "abc-123", title: "Improve onboarding", priority: 2, state: { name: "Backlog" } },
};

const paddleTx = {
  event_type: "transaction.completed",
  data: { id: "txn_01abc", status: "completed", customer_id: "ctm_01xyz", currency_code: "USD" },
};

export const PRESETS: Preset[] = [
  {
    id: "blank",
    label: "Blank",
    source: "unknown",
    defaultPath: "/webhook",
    sampleBody: "{}",
  },
  {
    id: "stripe-payment-succeeded",
    label: "Stripe: payment_intent.succeeded",
    source: "stripe",
    defaultPath: "/stripe",
    sampleBody: JSON.stringify(stripePayment, null, 2),
  },
  {
    id: "github-push",
    label: "GitHub: push",
    source: "github",
    defaultPath: "/github",
    sampleBody: JSON.stringify(githubPush, null, 2),
    extraHeaders: { "x-github-event": "push", "x-github-delivery": "preset-delivery-id" },
  },
  {
    id: "shopify-order-created",
    label: "Shopify: orders/create",
    source: "shopify",
    defaultPath: "/shopify",
    sampleBody: JSON.stringify(shopifyOrder, null, 2),
    extraHeaders: { "x-shopify-topic": "orders/create" },
  },
  {
    id: "clerk-user-created",
    label: "Clerk: user.created",
    source: "clerk",
    defaultPath: "/clerk",
    sampleBody: JSON.stringify(clerkUserCreated, null, 2),
  },
  {
    id: "slack-event",
    label: "Slack: event_callback",
    source: "slack",
    defaultPath: "/slack",
    sampleBody: JSON.stringify(slackEvent, null, 2),
  },
  {
    id: "linear-issue",
    label: "Linear: Issue create",
    source: "linear",
    defaultPath: "/linear",
    sampleBody: JSON.stringify(linearIssue, null, 2),
  },
  {
    id: "paddle-tx",
    label: "Paddle: transaction.completed",
    source: "paddle",
    defaultPath: "/paddle",
    sampleBody: JSON.stringify(paddleTx, null, 2),
  },
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
