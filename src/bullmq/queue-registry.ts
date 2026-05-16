import { Queue } from "bullmq";
import type { RedisConnection } from "./connection.js";

const BULL_KEY_PATTERN = /^bull:([^:]+):meta$/;

export type RegisteredQueue = {
  name: string;
  queue: Queue;
};

export class QueueRegistry {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: RedisConnection) {}

  register(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const queue = new Queue(name, { connection: this.connection });
    this.queues.set(name, queue);
    return queue;
  }

  registerMany(names: string[]): void {
    for (const name of names) this.register(name);
  }

  get(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  list(): RegisteredQueue[] {
    return Array.from(this.queues.entries()).map(([name, queue]) => ({ name, queue }));
  }

  async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
    this.queues.clear();
  }
}

export async function discoverQueues(connection: RedisConnection): Promise<string[]> {
  const found = new Set<string>();
  const stream = connection.scanStream({ match: "bull:*:meta", count: 100 });

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (keys: string[]) => {
      for (const key of keys) {
        const match = BULL_KEY_PATTERN.exec(key);
        if (match?.[1]) found.add(match[1]);
      }
    });
    stream.on("end", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  return Array.from(found).sort();
}
