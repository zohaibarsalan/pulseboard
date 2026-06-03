CREATE TABLE `webhook_secrets` (
	`source` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `webhooks` ADD `signature_status` text DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE `webhooks` ADD `signature_notes` text;