import { Worker } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis("redis://localhost:6379", { maxRetriesPerRequest: null });

const worker = new Worker(
  "email",
  async (job) => {
    console.log(`processing ${job.name} ${job.id}`);
    await new Promise((r) => setTimeout(r, 200));
    if (job.name === "send-receipt") {
      throw new Error("SMTP timeout");
    }
    return { sent: true };
  },
  { connection },
);

worker.on("ready", () => console.log("worker ready"));
worker.on("completed", (job) => console.log(`✓ ${job.id}`));
worker.on("failed", (job, err) => console.log(`✗ ${job?.id}: ${err.message}`));

process.on("SIGINT", async () => {
  await worker.close();
  connection.disconnect();
  process.exit(0);
});
