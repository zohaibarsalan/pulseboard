import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, formatNumber, formatRelativeTime } from "../web/lib/format.js";
import { formatJsonForDisplay } from "../web/lib/formatJson.js";

const numberCases: Array<[string, number, string]> = [
  ["formats values below one thousand exactly", 999, "999"],
  ["formats low thousands with one decimal", 1_250, "1.3k"],
  ["formats five-digit thousands without decimals", 12_500, "13k"],
  ["formats millions with one decimal", 1_250_000, "1.3m"],
];
for (const [name, input, expected] of numberCases) {
  test(name, () => assert.equal(formatNumber(input), expected));
}

const durationCases: Array<[string, number, string]> = [
  ["formats sub-second durations", 42.4, "42ms"],
  ["formats seconds", 1_500, "1.5s"],
  ["formats minutes", 90_000, "1.5m"],
  ["formats hours", 5_400_000, "1.5h"],
];
for (const [name, input, expected] of durationCases) {
  test(name, () => assert.equal(formatDuration(input), expected));
}

test("formats missing timestamps as never", () => {
  assert.equal(formatRelativeTime(null), "never");
});
test("formats immediate timestamps as just now", () => {
  assert.equal(formatRelativeTime(Date.now()), "just now");
});
test("formats recent timestamps in seconds", () => {
  assert.match(formatRelativeTime(Date.now() - 15_000), /^15s ago$/);
});
test("formats older timestamps in days", () => {
  assert.match(formatRelativeTime(Date.now() - 2 * 86_400_000), /^2d ago$/);
});
test("pretty-prints valid JSON", () => {
  assert.equal(formatJsonForDisplay('{"received":true}'), '{\n  "received": true\n}');
});
test("preserves non-JSON response bodies", () => {
  assert.equal(formatJsonForDisplay("<html>ok</html>"), "<html>ok</html>");
});
