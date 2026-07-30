ALTER TABLE `entries` ADD `is_note_public` integer DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `entries` SET `is_note_public` = false;
