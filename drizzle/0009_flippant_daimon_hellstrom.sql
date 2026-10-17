ALTER TABLE `calendar_events` ADD `guestFirstNames` varchar(255);--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `guestPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `guestCount` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `notes` text;