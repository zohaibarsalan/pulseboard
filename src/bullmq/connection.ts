import { Redis, type RedisOptions } from "ioredis";

export type RedisConnection = Redis;

export function createRedisConnection(url: string): RedisConnection {
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  };

  return new Redis(url, options);
}

export async function pingRedis(connection: RedisConnection): Promise<boolean> {
  try {
    const reply = await connection.ping();
    return reply === "PONG";
  } catch {
    return false;
  }
}
