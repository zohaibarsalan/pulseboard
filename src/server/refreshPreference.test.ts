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

test("refresh preferences default, persist, and support manual-only mode", () => {
  assert.equal(getWebhookRefreshInterval(), DEFAULT_WEBHOOK_REFRESH_INTERVAL);
  setWebhookRefreshInterval(60_000);
  assert.equal(values.get(WEBHOOK_REFRESH_KEY), "60000");
  assert.equal(getWebhookRefreshInterval(), 60_000);
  setWebhookRefreshInterval(0);
  assert.equal(getWebhookRefreshInterval(), 0);
});

test("invalid saved refresh values safely fall back to the default", () => {
  for (const value of ["1000", "7200000", "often"]) {
    values.set(WEBHOOK_REFRESH_KEY, value);
    assert.equal(getWebhookRefreshInterval(), DEFAULT_WEBHOOK_REFRESH_INTERVAL);
  }
});

test("custom refresh values normalize to whole seconds without becoming presets", () => {
  values.set(WEBHOOK_REFRESH_KEY, "60555");
  assert.equal(getWebhookRefreshInterval(), 61_000);
  assert.equal(isWebhookRefreshPreset(30_000), true);
  assert.equal(isWebhookRefreshPreset(45_000), false);
});

test("refresh intervals produce human-readable tooltip labels", () => {
  assert.equal(formatWebhookRefreshInterval(5_000), "5 seconds");
  assert.equal(formatWebhookRefreshInterval(60_000), "1 minute");
});
