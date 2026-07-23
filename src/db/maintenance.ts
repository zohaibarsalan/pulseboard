import type { Config } from "../config/index.js";
import type { Db } from "./client.js";

export type MaintenanceResult = {
  deleted: number;
  sizeBytes: number;
};

export function maintainDatabase(db: Db, config: Pick<Config, "retentionDays" | "maxDbSizeMb">): MaintenanceResult {
  const cutoff = Date.now() - config.retentionDays * 86_400_000;
  let deleted = db.$client.prepare("DELETE FROM webhooks WHERE received_at < ?").run(cutoff).changes;

  const sizeBytes = databaseSizeBytes(db);
  const maxBytes = config.maxDbSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    const total = (db.$client.prepare("SELECT COUNT(*) AS count FROM webhooks").get() as { count: number }).count;
    const batchSize = Math.max(100, Math.ceil(total * 0.1));
    while (databaseUsedBytes(db) > maxBytes) {
      const result = db.$client
        .prepare(
          `DELETE FROM webhooks WHERE id IN (
            SELECT id FROM webhooks ORDER BY received_at ASC LIMIT ?
          )`,
        )
        .run(batchSize);
      deleted += result.changes;
      if (result.changes === 0) break;
    }
    db.$client.pragma("wal_checkpoint(PASSIVE)");
    if (deleted > 0) db.$client.exec("VACUUM");
  }

  return { deleted, sizeBytes: databaseSizeBytes(db) };
}

function databaseUsedBytes(db: Db): number {
  const pageCount = db.$client.pragma("page_count", { simple: true }) as number;
  const freePages = db.$client.pragma("freelist_count", { simple: true }) as number;
  const pageSize = db.$client.pragma("page_size", { simple: true }) as number;
  return (pageCount - freePages) * pageSize;
}

export function databaseSizeBytes(db: Db): number {
  const pageCount = db.$client.pragma("page_count", { simple: true }) as number;
  const pageSize = db.$client.pragma("page_size", { simple: true }) as number;
  return pageCount * pageSize;
}
