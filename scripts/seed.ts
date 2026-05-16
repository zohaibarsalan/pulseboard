import { Queue } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis("redis://localhost:6379", { maxRetriesPerRequest: null });
const queue = new Queue("email", { connection });

await queue.add("send-welcome", { to: "alice@example.com" });
await queue.add("send-welcome", { to: "bob@example.com" });
await queue.add("send-receipt", { to: "carol@example.com" }, { delay: 60_000 });

console.log("Seeded 3 jobs into queue 'email'");
await queue.close();
connection.disconnect();
