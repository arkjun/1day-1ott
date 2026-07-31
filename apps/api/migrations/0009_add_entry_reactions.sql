CREATE TABLE `entry_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`emoji` text NOT NULL,
	`emoji_image_url` text,
	`local_user_id` text,
	`remote_actor_uri` text,
	`remote_activity_uri` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`local_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entry_reactions_actor_ck" CHECK(("entry_reactions"."local_user_id" is not null and "entry_reactions"."remote_actor_uri" is null and "entry_reactions"."remote_activity_uri" is null) or ("entry_reactions"."local_user_id" is null and "entry_reactions"."remote_actor_uri" is not null and "entry_reactions"."remote_activity_uri" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_reactions_local_user_uq` ON `entry_reactions` (`entry_id`,`local_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_reactions_remote_actor_uq` ON `entry_reactions` (`entry_id`,`remote_actor_uri`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_reactions_remote_activity_uq` ON `entry_reactions` (`remote_activity_uri`);--> statement-breakpoint
CREATE INDEX `entry_reactions_entry_idx` ON `entry_reactions` (`entry_id`);