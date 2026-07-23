import assert from "node:assert/strict";
import { test } from "node:test";
import { diffHeaders, diffJsonBodies } from "../shared/webhookDiff.js";

test("structured webhook body diff reports added, removed, changed, and unchanged fields", () => {
  const result = diffJsonBodies(
    '{"id":"evt_1","status":"pending","removed":true,"items":[{"qty":1}]}',
    '{"id":"evt_1","status":"paid","added":true,"items":[{"qty":2}]}',
  );

  assert.equal(result.structured, true);
  assert.deepEqual(result.summary, { added: 1, removed: 1, changed: 2, unchanged: 1 });
  assert.equal(result.entries.find((entry) => entry.path === "$.status")?.kind, "changed");
  assert.equal(result.entries.find((entry) => entry.path === "$.items[0].qty")?.after, "2");
});

test("header diff is case insensitive and raw bodies fall back to whole-body comparison", () => {
  const headers = diffHeaders(
    { "Content-Type": "application/json", "x-version": "1" },
    { "content-type": "application/json", "x-version": "2", "x-added": "yes" },
  );
  assert.deepEqual(headers.summary, { added: 1, removed: 0, changed: 1, unchanged: 1 });

  const raw = diffJsonBodies("plain text", "updated text");
  assert.equal(raw.structured, false);
  assert.deepEqual(raw.summary, { added: 0, removed: 0, changed: 1, unchanged: 0 });
});
