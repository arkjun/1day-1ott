CREATE TABLE `federation_actor_keys` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`public_key` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `type`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `federation_followers` (
	`id` text PRIMARY KEY NOT NULL,
	`local_user_id` text NOT NULL,
	`remote_actor_uri` text NOT NULL,
	`remote_inbox_uri` text NOT NULL,
	`remote_shared_inbox_uri` text,
	`follow_activity_uri` text NOT NULL,
	`handle` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`local_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `federation_follower_actor_uq` ON `federation_followers` (`local_user_id`,`remote_actor_uri`);--> statement-breakpoint
CREATE INDEX `federation_follower_local_status_idx` ON `federation_followers` (`local_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `federation_publications` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`published_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	`last_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `federation_publication_status_idx` ON `federation_publications` (`status`);--> statement-breakpoint
ALTER TABLE `user` ADD `federation_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `federation_handle` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_federation_handle_unique` ON `user` (`federation_handle`);