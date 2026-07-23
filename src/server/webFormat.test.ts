import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, formatNumber, formatRelativeTime } from "../web/lib/format.js";
import { formatJsonForDisplay } from "../web/lib/formatJson.js";

test("dashboard number and duration formatting stays readable at meaningful scales", () => {
  assert.equal(formatNumber(999), "999");
  assert.equal(formatNumber(1_250), "1.3k");
  assert.equal(formatNumber(1_250_000), "1.3m");
  assert.equal(formatDuration(42.4), "42ms");
  assert.equal(formatDuration(1_500), "1.5s");
  assert.equal(formatDuration(90_000), "1.5m");
});

test("relative timestamps handle missing, immediate, and old captures", () => {
  assert.equal(formatRelativeTime(null), "never");
  assert.equal(formatRelativeTime(Date.now()), "just now");
  assert.match(formatRelativeTime(Date.now() - 15_000), /^15s ago$/);
  assert.match(formatRelativeTime(Date.now() - 2 * 86_400_000), /^2d ago$/);
});

test("JSON responses are formatted while arbitrary response bodies remain exact", () => {
  assert.equal(formatJsonForDisplay('{"received":true}'), '{\n  "received": true\n}');
  assert.equal(formatJsonForDisplay("<html>ok</html>"), "<html>ok</html>");
});
