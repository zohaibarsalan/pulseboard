CREATE TABLE `delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`target` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`trigger` text NOT NULL,
	`state` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`status_code` integer,
	`duration_ms` integer,
	`error` text,
	`response_headers_json` text,
	`response_body` text,
	`response_content_type` text,
	`response_body_truncated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `delivery_attempts_webhook_idx` ON `delivery_attempts` (`webhook_id`,`target`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `delivery_attempts_queue_idx` ON `delivery_attempts` (`state`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_attempts_unique_idx` ON `delivery_attempts` (`webhook_id`,`target`,`attempt_number`);--> statement-breakpoint
CREATE TABLE `delivery_policy` (
	`id` integer PRIMARY KEY NOT NULL,
	`automatic_retries` integer DEFAULT false NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`base_delay_ms` integer DEFAULT 5000 NOT NULL,
	`max_delay_ms` integer DEFAULT 300000 NOT NULL,
	`updated_at` integer NOT NULL
);
