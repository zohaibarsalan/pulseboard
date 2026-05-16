CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`action` text NOT NULL,
	`queue_name` text,
	`job_id` text,
	`actor` text DEFAULT 'admin' NOT NULL,
	`actor_source` text NOT NULL,
	`client_ip` text,
	`user_agent` text,
	`metadata_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`instance_id`,"created_at" DESC);--> statement-breakpoint
CREATE TABLE `error_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`queue_name` text NOT NULL,
	`job_name` text,
	`error_hash` text NOT NULL,
	`failed_reason` text,
	`count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `error_groups_unique` ON `error_groups` (`instance_id`,`queue_name`,`error_hash`);--> statement-breakpoint
CREATE TABLE `job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`queue_name` text NOT NULL,
	`job_id` text NOT NULL,
	`event_type` text NOT NULL,
	`attempts_made` integer,
	`worker_id` text,
	`processed_on` integer,
	`event_data_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_events_job_idx` ON `job_events` (`instance_id`,`queue_name`,`job_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `job_events_type_idx` ON `job_events` (`instance_id`,`event_type`,"created_at" DESC);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`queue_name` text NOT NULL,
	`job_id` text NOT NULL,
	`job_name` text NOT NULL,
	`status` text NOT NULL,
	`tags_json` text,
	`attempts_made` integer DEFAULT 0,
	`created_at` integer,
	`processed_on` integer,
	`finished_on` integer,
	`wait_time_ms` integer,
	`processing_time_ms` integer,
	`failed_reason` text,
	`error_hash` text,
	`stacktrace_preview` text,
	`parent_key` text,
	`flow_id` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_instance_queue_job_unique` ON `jobs` (`instance_id`,`queue_name`,`job_id`);--> statement-breakpoint
CREATE INDEX `jobs_hot_path_idx` ON `jobs` (`instance_id`,`queue_name`,`status`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `jobs_error_hash_idx` ON `jobs` (`instance_id`,`error_hash`);--> statement-breakpoint
CREATE INDEX `jobs_flow_idx` ON `jobs` (`instance_id`,`flow_id`);--> statement-breakpoint
CREATE TABLE `queue_metric_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`queue_name` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`bucket_size_seconds` integer NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`avg_wait_time_ms` integer,
	`avg_processing_time_ms` integer,
	`p95_processing_time_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_metric_buckets_unique` ON `queue_metric_buckets` (`instance_id`,`queue_name`,`bucket_start`,`bucket_size_seconds`);