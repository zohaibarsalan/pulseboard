import { Queue } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis("redis://localhost:6379", { maxRetriesPerRequest: null });
const queue = new Queue("email", { connection });

await queue.add("send-welcome", { to: "alice@example.com" });
await queue.add("send-welcome", { to: "bob@example.com" });
await queue.add("send-receipt", { to: "carol@example.com" });
await queue.add("send-receipt", { to: "dan@example.com" });
await queue.add("send-receipt", { to: "eve@example.com" }, { delay: 30_000 });

console.log("Seeded 5 jobs into queue 'email' (3 immediate, 1 fails twice, 1 delayed)");
await queue.close();
connection.disconnect();
