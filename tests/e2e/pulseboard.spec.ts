import { expect, test } from "@playwright/test";

test("capture, inspect response, edit, replay, and clear", async ({ page, request }) => {
  const capture = await request.post("/hook/e2e", {
    headers: { "content-type": "application/json" },
    data: { type: "e2e.created", value: "original" },
  });
  expect(capture.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button").filter({ hasText: "e2e.created" }).click();
  await expect(page).toHaveURL(/\/webhooks\//);
  await expect(page.getByText('"value": "original"')).toBeVisible();

  await page.getByRole("tab", { name: "Forwarding" }).click();
  await expect(page.getByText("Response headers")).toBeVisible();
  await expect(page.getByText(/"received":true/)).toBeVisible();

  await page.getByRole("button", { name: "Edit & Replay" }).click();
  await page.getByPlaceholder("Body (raw)").fill('{"type":"e2e.updated","value":"edited"}');
  await page.getByRole("button", { name: "Send edited" }).click();
  await expect(page.getByText(/Replayed → 200/)).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Clear all webhooks" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
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

test("coss command, select, and checkbox primitives are operable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open command palette" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByPlaceholder("Go to a page or action…").fill("Analytics");
  await page.getByRole("dialog").getByText("Analytics", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

  await page.getByRole("link", { name: "Compose" }).click();
  await expect(page.getByRole("heading", { name: "Compose" })).toBeVisible();
  await page.getByRole("combobox", { name: "Preset" }).click();
  await page.getByRole("option", { name: "GitHub: push" }).click();
  await expect(page.getByRole("combobox", { name: "Source" })).toHaveText("github");
  await page.getByRole("checkbox", { name: "Auto-sign" }).click();
  await expect(page.getByRole("checkbox", { name: "Auto-sign" })).not.toBeChecked();
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
