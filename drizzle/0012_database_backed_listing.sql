ALTER TABLE `property` ADD COLUMN IF NOT EXISTS `listingNote` text;--> statement-breakpoint
ALTER TABLE `property` ADD COLUMN IF NOT EXISTS `mapImageUrl` text;--> statement-breakpoint
ALTER TABLE `property` ADD COLUMN IF NOT EXISTS `mapLocationLabel` varchar(255);--> statement-breakpoint
ALTER TABLE `property` ADD COLUMN IF NOT EXISTS `seoTitle` varchar(255);--> statement-breakpoint
ALTER TABLE `property` ADD COLUMN IF NOT EXISTS `seoDescription` text;--> statement-breakpoint
ALTER TABLE `property` ADD COLUMN IF NOT EXISTS `seoKeywords` text;
