CREATE TABLE `user_follows` (
	`follower_id` text NOT NULL,
	`followee_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`follower_id`, `followee_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_follows_not_self_ck" CHECK("user_follows"."follower_id" <> "user_follows"."followee_id")
);
--> statement-breakpoint
CREATE INDEX `user_follows_followee_created_idx` ON `user_follows` (`followee_id`,`created_at`,`follower_id`);--> statement-breakpoint
CREATE INDEX `user_follows_follower_created_idx` ON `user_follows` (`follower_id`,`created_at`,`followee_id`);