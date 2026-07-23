import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  DEFAULT_WEBHOOK_REFRESH_INTERVAL,
  WEBHOOK_REFRESH_KEY,
  formatWebhookRefreshInterval,
  getWebhookRefreshInterval,
  isWebhookRefreshPreset,
  setWebhookRefreshInterval,
} from "../web/lib/refreshPreference.js";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("uses the default refresh interval without a saved preference", () => {
  assert.equal(getWebhookRefreshInterval(), DEFAULT_WEBHOOK_REFRESH_INTERVAL);
});
test("persists and loads a valid refresh interval", () => {
  setWebhookRefreshInterval(60_000);
  assert.equal(values.get(WEBHOOK_REFRESH_KEY), "60000");
  assert.equal(getWebhookRefreshInterval(), 60_000);
});
test("supports manual-only refresh", () => {
  setWebhookRefreshInterval(0);
  assert.equal(getWebhookRefreshInterval(), 0);
});
test("rejects refresh intervals below the minimum", () => {
  values.set(WEBHOOK_REFRESH_KEY, "1000");
  assert.equal(getWebhookRefreshInterval(), DEFAULT_WEBHOOK_REFRESH_INTERVAL);
});
test("rejects refresh intervals above the maximum", () => {
  values.set(WEBHOOK_REFRESH_KEY, "7200000");
  assert.equal(getWebhookRefreshInterval(), DEFAULT_WEBHOOK_REFRESH_INTERVAL);
});
test("rejects nonnumeric saved refresh values", () => {
  values.set(WEBHOOK_REFRESH_KEY, "often");
  assert.equal(getWebhookRefreshInterval(), DEFAULT_WEBHOOK_REFRESH_INTERVAL);
});
test("rounds custom refresh values to whole seconds", () => {
  values.set(WEBHOOK_REFRESH_KEY, "60555");
  assert.equal(getWebhookRefreshInterval(), 61_000);
});
test("recognizes a built-in refresh preset", () => {
  assert.equal(isWebhookRefreshPreset(30_000), true);
});
test("does not treat arbitrary custom intervals as presets", () => {
  assert.equal(isWebhookRefreshPreset(45_000), false);
});
test("formats seconds and minutes for refresh tooltips", () => {
  assert.equal(formatWebhookRefreshInterval(5_000), "5 seconds");
  assert.equal(formatWebhookRefreshInterval(60_000), "1 minute");
});
