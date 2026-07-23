import { expect, test } from "@playwright/test";

test("capture, inspect response, edit, replay, and clear", async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const capture = await request.post("/hook/e2e", {
    headers: { "content-type": "application/json" },
    data: { type: "e2e.created", value: "original" },
  });
  expect(capture.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  await page.getByRole("button").filter({ hasText: "e2e.created" }).click();
  await expect(page).toHaveURL(/\/webhooks\//);
  await expect(page.getByRole("link", { name: "Webhooks" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Search webhooks…")).toBeVisible();
  await expect(page.getByRole("button").filter({ hasText: "e2e.created" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByText('"value": "original"')).toBeVisible();
  await expect(page.getByText("Request ID", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request details" })).toBeVisible();
  await expect(page.getByText("Source IP", { exact: true })).toBeVisible();
  await expect(page.getByText("Forward targets", { exact: true })).toBeVisible();
  await expect(page.getByText("Original request", { exact: true })).toBeVisible();
  const [tabsBox, bodyTabBox] = await Promise.all([
    page.getByTestId("webhook-tabs").boundingBox(),
    page.getByRole("tab", { name: "Body" }).boundingBox(),
  ]);
  expect(Math.abs(tabsBox!.height - bodyTabBox!.height)).toBeLessThanOrEqual(1);

  const [summaryBox, identityBox, controlsBox, detailsBox] = await Promise.all([
    page.getByTestId("webhook-summary").boundingBox(),
    page.getByTestId("webhook-identity").boundingBox(),
    page.getByTestId("webhook-controls").boundingBox(),
    page.getByTestId("request-details").boundingBox(),
  ]);
  expect(Math.abs((summaryBox!.y + summaryBox!.height) - (identityBox!.y + identityBox!.height))).toBeLessThanOrEqual(1);
  expect(Math.abs((controlsBox!.y + controlsBox!.height) - (detailsBox!.y + detailsBox!.height))).toBeLessThanOrEqual(1);
  const [metadataBox, actionsBox] = await Promise.all([
    page.getByTestId("webhook-metadata").boundingBox(),
    page.getByTestId("webhook-actions").boundingBox(),
  ]);
  const metadataCenter = metadataBox!.y + metadataBox!.height / 2;
  const actionsCenter = actionsBox!.y + actionsBox!.height / 2;
  expect(Math.abs(metadataCenter - actionsCenter)).toBeLessThanOrEqual(1);
  const [detailsHeadingBox, detailsListBox] = await Promise.all([
    page.getByTestId("request-details").locator("h2").boundingBox(),
    page.getByTestId("request-details").locator("dl").boundingBox(),
  ]);
  const detailsTopGap = detailsHeadingBox!.y - detailsBox!.y;
  const detailsBottomGap =
    detailsBox!.y + detailsBox!.height - (detailsListBox!.y + detailsListBox!.height);
  expect(Math.abs(detailsTopGap - detailsBottomGap)).toBeLessThanOrEqual(2);
  const [searchBox, filtersBox] = await Promise.all([
    page.getByLabel("Search webhooks…").boundingBox(),
    page.getByTestId("webhook-filters").boundingBox(),
  ]);
  const controlsTopGap = searchBox!.y - controlsBox!.y;
  const controlsBottomGap =
    controlsBox!.y + controlsBox!.height - (filtersBox!.y + filtersBox!.height);
  expect(Math.abs(controlsTopGap - controlsBottomGap)).toBeLessThanOrEqual(2);

  const refreshButton = page.getByRole("button", { name: "Refresh webhooks" });
  await expect(refreshButton).not.toHaveAttribute("title");
  await refreshButton.hover();
  const refreshTooltip = page.locator('[data-slot="tooltip-popup"]');
  await expect(refreshTooltip).toBeVisible();
  await expect(refreshTooltip).toHaveText("Refresh now. Auto-refreshes every 30 seconds.");

  const controlsHeight = controlsBox!.height;
  const liveCapture = await request.post("/hook/live-layout", {
    headers: { "content-type": "application/json" },
    data: { type: "layout.updated" },
  });
  expect(liveCapture.ok()).toBeTruthy();
  const refresh = page.getByRole("button", { name: /Refresh webhooks, .*new event/ });
  await expect(refresh).toBeVisible();
  expect((await page.getByTestId("webhook-controls").boundingBox())!.height).toBe(controlsHeight);
  await refresh.click();
  await expect(page.getByRole("button", { name: "Refresh webhooks" })).toBeVisible();
  expect((await page.getByTestId("webhook-controls").boundingBox())!.height).toBe(controlsHeight);

  await page.getByRole("tab", { name: "Forwarding" }).click();
  await expect(page.getByText("Response headers")).toBeVisible();
  await expect(page.getByText(/"received": true/)).toBeVisible();

  await page.getByRole("button", { name: "Edit & Replay" }).click();
  await page.getByPlaceholder("Body (raw)").fill('{"type":"e2e.updated","value":"edited"}');
  await page.getByRole("button", { name: "Send edited" }).click();
  await expect(page.getByText(/Replayed → 200/)).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Clear all webhooks" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(page.getByText("Capture your first webhook")).toBeVisible();
});

test("authentication works through a reverse proxy in a real browser", async ({ browser, request }) => {
  const unauthorized = await request.get("http://127.0.0.1:4512/api/health");
  expect(unauthorized.status()).toBe(401);
  expect(unauthorized.headers()["www-authenticate"]).toContain("Basic");

  const context = await browser.newContext({
    httpCredentials: { username: "pulseboard", password: "e2e-password" },
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4512/");
  await expect(page.getByRole("heading", { name: "Webhooks" })).toBeVisible();
  await context.close();
});

test("provider onboarding generates setup and verifies the delivery path", async ({ page, request }) => {
  await page.goto("/connect");
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect a webhook provider" })).toBeVisible();

  await page.getByRole("button", { name: "GitHub" }).click();
  await expect(page.getByLabel("Webhook path")).toHaveValue("/github");
  await expect(page.getByText("Open repository or organization Settings")).toBeVisible();

  await page.getByRole("combobox", { name: "Handler environment" }).click();
  await page.getByRole("option", { name: "AWS Lambda / API Gateway" }).click();
  await expect(page.getByLabel("Forward target")).toHaveValue(
    "https://abc123.execute-api.us-east-1.amazonaws.com",
  );

  await page.getByRole("combobox", { name: "Exposure method" }).click();
  await page.getByRole("option", { name: "Cloudflare Tunnel" }).click();
  await expect(page.getByText("cloudflared tunnel --url http://localhost:4500")).toBeVisible();
  await expect(page.getByText("<your-trycloudflare-url>/hook/github")).toBeVisible();

  await page.getByRole("button", { name: "Run connection test" }).click();
  await expect(page.getByText("Captured by Pulseboard")).toBeVisible();
  await expect(page.getByText("Handler returned 200")).toBeVisible();
  await page.getByRole("link", { name: "Inspect test event" }).click();
  await expect(page).toHaveURL(/\/webhooks\//);
  await expect(page.getByText('"type": "pulseboard.connection_test"')).toBeVisible();

  await request.post("/api/webhooks/clear");
});

test("left and right arrows move through the webhook inspector", async ({ page, request }) => {
  await request.post("/hook/keyboard-first", {
    headers: { "content-type": "application/json" },
    data: { type: "keyboard.first" },
  });
  await request.post("/hook/keyboard-second", {
    headers: { "content-type": "application/json" },
    data: { type: "keyboard.second" },
  });

  await page.goto("/");
  const rows = page.getByTestId("webhook-row");
  await expect(rows).toHaveCount(2);
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("ArrowRight");
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("ArrowLeft");
  await expect(rows.first()).toHaveAttribute("aria-current", "true");
});

test("failed deliveries explain the fix and roll up into developer analytics", async ({ page, request }) => {
  await request.post("/api/webhooks/clear");
  const capture = await request.post("/hook/missing-route", {
    headers: { "content-type": "application/json" },
    data: { type: "diagnostics.route_missing" },
  });
  expect(capture.status()).toBe(404);

  await page.goto("/");
  await page.getByRole("button").filter({ hasText: "diagnostics.route_missing" }).click();
  const diagnostic = page.getByTestId("delivery-diagnostic");
  await expect(diagnostic).toContainText("Webhook route was not found");
  await expect(diagnostic).toContainText("Next:");

  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Developer insights" })).toBeVisible();
  await expect(page.getByText("P95 latency", { exact: true })).toBeVisible();
  await expect(page.getByText("Route not found", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Slowest endpoints", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent issues", { exact: true })).toBeVisible();
});

test("compare two webhooks across body, headers, and delivery", async ({ page, request }) => {
  await request.post("/api/webhooks/clear");
  await request.post("/hook/compare", {
    headers: { "content-type": "application/json", "x-payload-version": "1" },
    data: {
      type: "compare.updated",
      status: "pending",
      legacy: true,
      customer: { id: "cus_123" },
    },
  });
  await request.post("/hook/compare", {
    headers: { "content-type": "application/json", "x-payload-version": "2" },
    data: {
      type: "compare.updated",
      status: "paid",
      added: true,
      customer: { id: "cus_123" },
    },
  });

  await page.goto("/");
  await page.getByTestId("webhook-row").first().click();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page).toHaveURL(/\/compare\?left=/);
  await expect(page.getByText("Choose two captures")).toBeVisible();
  await page.getByRole("button", { name: "Choose comparison", exact: true }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await expect(picker.getByText("same event type", { exact: true })).toBeVisible();
  await picker.getByText("compare.updated", { exact: true }).click();

  const comparison = page.getByTestId("webhook-compare");
  await expect(comparison).toBeVisible();
  await expect(page.getByText("Earlier → later")).toBeVisible();
  const statusDiff = comparison.locator('[data-diff-kind="changed"]').filter({ hasText: "$.status" });
  await expect(statusDiff).toContainText('"pending"');
  await expect(statusDiff).toContainText('"paid"');
  await expect(comparison.locator('[data-diff-kind="added"]').filter({ hasText: "$.added" })).toBeVisible();
  await expect(comparison.locator('[data-diff-kind="removed"]').filter({ hasText: "$.legacy" })).toBeVisible();

  await comparison.getByRole("checkbox", { name: "Show unchanged" }).click();
  await expect(comparison.getByText("$.customer.id", { exact: true })).toBeVisible();

  await comparison.getByRole("tab", { name: /Headers/ }).click();
  await expect(comparison.getByText("x-payload-version", { exact: true })).toBeVisible();

  await comparison.getByRole("tab", { name: "Delivery" }).click();
  await expect(comparison.getByText("Delivery outcome")).toBeVisible();
  await page.getByRole("button", { name: "Change", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("coss command, webhook search, select, and checkbox primitives are operable", async ({ page, request }) => {
  const searchable = await request.post("/hook/palette", {
    headers: { "content-type": "application/json" },
    data: { type: "palette.search", value: "find-me" },
  });
  expect(searchable.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "Open command palette" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByPlaceholder("Search webhooks, pages, and actions…").fill("palette.search");
  await page.getByRole("dialog").getByText("palette.search", { exact: true }).click();
  await expect(page).toHaveURL(/\/webhooks\//);

  await page.getByRole("button", { name: "Open command palette" }).click();
  await page.getByPlaceholder("Search webhooks, pages, and actions…").fill("Analytics");
  await page.getByRole("dialog").getByText("Analytics", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

  await page.getByRole("link", { name: "Compose" }).click();
  await expect(page.getByRole("heading", { name: "Compose" })).toBeVisible();
  const preset = page.getByRole("combobox", { name: "Preset" });
  await preset.click();
  const [triggerBox, menuBox] = await Promise.all([
    preset.boundingBox(),
    page.getByRole("listbox").boundingBox(),
  ]);
  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height - 1);
  expect(Math.abs(menuBox!.width - triggerBox!.width)).toBeLessThanOrEqual(2);
  await page.getByRole("option", { name: "GitHub: push" }).click();
  await expect(page.getByRole("combobox", { name: "Source" })).toHaveText("github");
  await page.getByRole("checkbox", { name: "Auto-sign" }).click();
  await expect(page.getByRole("checkbox", { name: "Auto-sign" })).not.toBeChecked();

  await page.getByRole("link", { name: "Settings" }).click();
  const secretsSection = page
    .getByRole("heading", { name: "Signing Secrets" })
    .locator("xpath=../../..");
  await secretsSection.getByRole("button", { name: "Add" }).nth(4).click();
  await page.getByRole("textbox", { name: "clerk signing secret" }).fill("whsec_e2e-secret");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(secretsSection.getByRole("button", { name: "Edit" })).toBeVisible();

  const secretActions = await secretsSection
    .getByRole("button", { name: /^(Edit|Add)$/ })
    .allTextContents();
  const firstAdd = secretActions.indexOf("Add");
  expect(firstAdd).toBeGreaterThan(0);
  expect(secretActions.slice(firstAdd)).not.toContain("Edit");

  const refreshInterval = page.getByRole("combobox", { name: "Webhook auto-refresh interval" });
  await refreshInterval.click();
  await expect(page.getByRole("option", { name: "Every 5 seconds" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Every 5 minutes" })).toBeVisible();
  await page.getByRole("option", { name: "Custom interval…" }).click();
  await page.getByRole("spinbutton", { name: "Custom refresh interval in seconds" }).fill("45");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pb-webhook-refresh-interval"))).toBe("45000");

  await page.getByRole("link", { name: "Webhooks" }).click();
  await page.getByRole("button", { name: "Refresh webhooks" }).hover();
  await expect(page.getByText("Refresh now. Auto-refreshes every 45 seconds.")).toBeVisible();
});

test("dark mode, narrow desktop, and large payloads remain usable", async ({ page, request }) => {
  const largeValue = "pulseboard-".repeat(8_000);
  const capture = await request.post("/hook/a/very/long/path/that/must/wrap/without/widening/the/dashboard", {
    headers: {
      "content-type": "application/json",
      "x-very-long-header-name-that-tests-narrow-layouts": largeValue.slice(0, 2_000),
    },
    data: { type: "large.payload", value: largeValue },
  });
  expect(capture.ok()).toBeTruthy();

  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() => localStorage.setItem("pb-theme", "dark"));
  await page.goto("/");
  await page.getByRole("button").filter({ hasText: "large.payload" }).click();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText('"type": "large.payload"')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await page.getByRole("tab", { name: "Headers" }).click();
  await expect(page.getByText("x-very-long-header-name-that-tests-narrow-layouts")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await page.getByRole("tab", { name: "Forwarding" }).click();
  await expect(page.getByText("Response body")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
