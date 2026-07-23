import assert from "node:assert/strict";
import test from "node:test";
import { retryDelayMs, shouldRetryDelivery } from "../delivery/attempts.js";

test("delivery retry policy retries transient failures but not permanent client errors", () => {
  assert.equal(shouldRetryDelivery({ status: null, error: "fetch failed" }), true);
  assert.equal(shouldRetryDelivery({ status: 408, error: null }), true);
  assert.equal(shouldRetryDelivery({ status: 429, error: null }), true);
  assert.equal(shouldRetryDelivery({ status: 503, error: null }), true);
  assert.equal(shouldRetryDelivery({ status: 400, error: null }), false);
  assert.equal(shouldRetryDelivery({ status: 404, error: null }), false);
  assert.equal(shouldRetryDelivery({ status: 200, error: null }), false);
});

test("delivery retry backoff is exponential, jittered, and capped", () => {
  const policy = { baseDelayMs: 5_000, maxDelayMs: 30_000 };
  assert.equal(retryDelayMs(2, policy, () => 0.5), 5_000);
  assert.equal(retryDelayMs(3, policy, () => 0.5), 10_000);
  assert.equal(retryDelayMs(4, policy, () => 0.5), 20_000);
  assert.equal(retryDelayMs(5, policy, () => 0.5), 30_000);
  assert.equal(retryDelayMs(2, policy, () => 0), 4_000);
  assert.equal(retryDelayMs(2, policy, () => 1), 6_000);
});
