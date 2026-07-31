DROP INDEX `entry_reactions_local_user_uq`;--> statement-breakpoint
DROP INDEX `entry_reactions_remote_actor_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `entry_reactions_local_user_uq` ON `entry_reactions` (`entry_id`,`local_user_id`,`emoji`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_reactions_remote_actor_uq` ON `entry_reactions` (`entry_id`,`remote_actor_uri`,`emoji`);