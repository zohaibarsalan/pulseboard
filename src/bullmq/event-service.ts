import { QueueEvents } from "bullmq";
import type { RedisConnection } from "./connection.js";

export type BullEventType = "active" | "completed" | "failed" | "stalled";

export type BullEvent = {
  queueName: string;
  type: BullEventType;
  jobId: string;
  receivedAt: number;
  data: Record<string, unknown>;
};

export type EventHandler = (event: BullEvent) => void;

export class QueueEventStreams {
  private readonly streams = new Map<string, QueueEvents>();

  constructor(private readonly connection: RedisConnection) {}

  subscribe(queueName: string, handler: EventHandler): void {
    if (this.streams.has(queueName)) return;

    const events = new QueueEvents(queueName, { connection: this.connection });

    events.on("active", ({ jobId, prev }) => {
      handler({
        queueName,
        type: "active",
        jobId,
        receivedAt: Date.now(),
        data: { prev },
      });
    });

    events.on("completed", ({ jobId, returnvalue }) => {
      handler({
        queueName,
        type: "completed",
        jobId,
        receivedAt: Date.now(),
        data: { returnvalue },
      });
    });

    events.on("failed", ({ jobId, failedReason, prev }) => {
      handler({
        queueName,
        type: "failed",
        jobId,
        receivedAt: Date.now(),
        data: { failedReason, prev },
      });
    });

    events.on("stalled", ({ jobId }) => {
      handler({
        queueName,
        type: "stalled",
        jobId,
        receivedAt: Date.now(),
        data: {},
      });
    });

    this.streams.set(queueName, events);
  }

  async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.streams.values()).map((s) => s.close()));
    this.streams.clear();
  }
}
