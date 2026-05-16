import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const instanceId = text("instance_id").notNull().default("default");

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    instanceId,
    queueName: text("queue_name").notNull(),
    jobId: text("job_id").notNull(),
    jobName: text("job_name").notNull(),
    status: text("status").notNull(),
    tagsJson: text("tags_json"),
    attemptsMade: integer("attempts_made").default(0),
    createdAt: integer("created_at"),
    processedOn: integer("processed_on"),
    finishedOn: integer("finished_on"),
    waitTimeMs: integer("wait_time_ms"),
    processingTimeMs: integer("processing_time_ms"),
    failedReason: text("failed_reason"),
    errorHash: text("error_hash"),
    stacktracePreview: text("stacktrace_preview"),
    parentKey: text("parent_key"),
    flowId: text("flow_id"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    jobsInstanceQueueJobUnique: uniqueIndex("jobs_instance_queue_job_unique").on(t.instanceId, t.queueName, t.jobId),
    jobsHotPathIdx: index("jobs_hot_path_idx").on(t.instanceId, t.queueName, t.status, sql`${t.createdAt} DESC`),
    jobsErrorHashIdx: index("jobs_error_hash_idx").on(t.instanceId, t.errorHash),
    jobsFlowIdx: index("jobs_flow_idx").on(t.instanceId, t.flowId),
  }),
);

export const jobEvents = sqliteTable(
  "job_events",
  {
    id: text("id").primaryKey(),
    instanceId,
    queueName: text("queue_name").notNull(),
    jobId: text("job_id").notNull(),
    eventType: text("event_type").notNull(),
    attemptsMade: integer("attempts_made"),
    workerId: text("worker_id"),
    processedOn: integer("processed_on"),
    eventDataJson: text("event_data_json"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    jobEventsJobIdx: index("job_events_job_idx").on(
      t.instanceId,
      t.queueName,
      t.jobId,
      sql`${t.createdAt} DESC`,
    ),
    jobEventsTypeIdx: index("job_events_type_idx").on(t.instanceId, t.eventType, sql`${t.createdAt} DESC`),
  }),
);

export const errorGroups = sqliteTable(
  "error_groups",
  {
    id: text("id").primaryKey(),
    instanceId,
    queueName: text("queue_name").notNull(),
    jobName: text("job_name"),
    errorHash: text("error_hash").notNull(),
    failedReason: text("failed_reason"),
    count: integer("count").notNull().default(0),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (t) => ({
    errorGroupsUnique: uniqueIndex("error_groups_unique").on(t.instanceId, t.queueName, t.errorHash),
  }),
);

export const queueMetricBuckets = sqliteTable(
  "queue_metric_buckets",
  {
    id: text("id").primaryKey(),
    instanceId,
    queueName: text("queue_name").notNull(),
    bucketStart: integer("bucket_start").notNull(),
    bucketSizeSeconds: integer("bucket_size_seconds").notNull(),
    completedCount: integer("completed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    avgWaitTimeMs: integer("avg_wait_time_ms"),
    avgProcessingTimeMs: integer("avg_processing_time_ms"),
    p95ProcessingTimeMs: integer("p95_processing_time_ms"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    queueMetricBucketsUnique: uniqueIndex("queue_metric_buckets_unique").on(
      t.instanceId,
      t.queueName,
      t.bucketStart,
      t.bucketSizeSeconds,
    ),
  }),
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    instanceId,
    action: text("action").notNull(),
    queueName: text("queue_name"),
    jobId: text("job_id"),
    actor: text("actor").notNull().default("admin"),
    actorSource: text("actor_source").notNull(),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    auditLogsCreatedAtIdx: index("audit_logs_created_at_idx").on(t.instanceId, sql`${t.createdAt} DESC`),
  }),
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobEvent = typeof jobEvents.$inferSelect;
export type NewJobEvent = typeof jobEvents.$inferInsert;
export type ErrorGroup = typeof errorGroups.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
