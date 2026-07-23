import assert from "node:assert/strict";
import test from "node:test";
import type { Webhook } from "../db/schema.js";
import { LiveEventBus, type WebhookEventKind } from "./event-bus.js";

test("live event bus distinguishes new captures from delivery updates", () => {
  const bus = new LiveEventBus();
  const kinds: WebhookEventKind[] = [];
  const unsubscribe = bus.subscribe((_webhook, kind) => kinds.push(kind));
  const webhook = { id: "evt_1" } as Webhook;

  bus.publish(webhook);
  bus.publish(webhook, "updated");
  unsubscribe();
  bus.publish(webhook);

  assert.deepEqual(kinds, ["created", "updated"]);
  assert.equal(bus.listenerCount(), 0);
});
