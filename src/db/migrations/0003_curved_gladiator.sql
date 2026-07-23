ALTER TABLE `webhooks` ADD `response_headers_json` text;--> statement-breakpoint
ALTER TABLE `webhooks` ADD `response_body` text;--> statement-breakpoint
ALTER TABLE `webhooks` ADD `response_content_type` text;--> statement-breakpoint
ALTER TABLE `webhooks` ADD `response_body_truncated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `webhooks` ADD `deliveries_json` text;