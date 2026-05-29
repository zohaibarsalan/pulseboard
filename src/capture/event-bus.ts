import { EventEmitter } from "node:events";
import type { Webhook } from "../db/schema.js";

export type WebhookEventListener = (webhook: Webhook) => void;

export class LiveEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Plenty of headroom for SSE clients + internal consumers; default is 10.
    this.emitter.setMaxListeners(200);
  }

  publish(webhook: Webhook): void {
    this.emitter.emit("webhook", webhook);
  }

  subscribe(listener: WebhookEventListener): () => void {
    this.emitter.on("webhook", listener);
    return () => {
      this.emitter.off("webhook", listener);
    };
  }

  listenerCount(): number {
    return this.emitter.listenerCount("webhook");
  }
}
