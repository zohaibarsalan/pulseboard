CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`headers_json` text NOT NULL,
	`body` text,
	`query_params` text,
	`content_type` text,
	`content_length` integer,
	`source_ip` text,
	`received_at` integer NOT NULL,
	`source` text DEFAULT 'unknown' NOT NULL,
	`event_type` text,
	`forwarded_to` text,
	`forward_status` integer,
	`forward_duration_ms` integer,
	`forward_error` text,
	`replay_count` integer DEFAULT 0 NOT NULL,
	`last_replayed_at` integer,
	`replay_of` text
);
--> statement-breakpoint
CREATE INDEX `webhooks_received_idx` ON `webhooks` ("received_at" DESC);--> statement-breakpoint
CREATE INDEX `webhooks_source_idx` ON `webhooks` (`source`,"received_at" DESC);--> statement-breakpoint
CREATE INDEX `webhooks_path_idx` ON `webhooks` (`path`);