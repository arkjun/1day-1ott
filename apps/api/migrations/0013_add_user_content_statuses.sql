CREATE TABLE `user_content_statuses` (
	`user_id` text NOT NULL,
	`content_id` text NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`user_id`, `content_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_id`) REFERENCES `content`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_content_statuses_status_ck" CHECK("user_content_statuses"."status" in ('watching', 'completed', 'dropped', 'interested'))
);
