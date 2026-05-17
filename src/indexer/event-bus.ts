import { EventEmitter } from "node:events";
import type { BullEvent } from "../bullmq/event-service.js";

export type LiveEventListener = (event: BullEvent) => void;

export class LiveEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Plenty of headroom for SSE clients + internal consumers; default is 10.
    this.emitter.setMaxListeners(200);
  }

  publish(event: BullEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: LiveEventListener): () => void {
    this.emitter.on("event", listener);
    return () => {
      this.emitter.off("event", listener);
    };
  }

  listenerCount(): number {
    return this.emitter.listenerCount("event");
  }
}
