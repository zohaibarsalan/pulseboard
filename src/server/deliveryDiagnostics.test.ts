import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseDelivery } from "../shared/deliveryDiagnostics.js";

test("delivery diagnostics turn common failures into actionable reasons", () => {
  assert.equal(diagnoseDelivery({ forwardedTo: "http://app.test", forwardStatus: 404 }).reason, "route_not_found");
  assert.equal(diagnoseDelivery({
    forwardedTo: "http://app.test",
    forwardError: "Timed out after 2000ms",
  }).reason, "timeout");
  assert.equal(diagnoseDelivery({
    forwardedTo: "http://app.test",
    forwardStatus: 200,
    signatureStatus: "invalid",
  }).reason, "signature_invalid");
});

test("delivery diagnostics flag slow handlers without mislabeling healthy requests", () => {
  assert.equal(diagnoseDelivery({
    forwardedTo: "http://app.test",
    forwardStatus: 200,
    forwardDurationMs: 6_000,
  }).reason, "slow_handler");
  assert.equal(diagnoseDelivery({
    forwardedTo: "http://app.test",
    forwardStatus: 204,
    forwardDurationMs: 20,
  }).reason, "healthy");
});
