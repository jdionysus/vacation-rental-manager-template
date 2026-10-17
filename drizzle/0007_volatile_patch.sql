ALTER TABLE `daily_rates` ADD `minNights` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `daily_rates` ADD `airbnbLow` decimal(10,2);--> statement-breakpoint
ALTER TABLE `daily_rates` ADD `airbnbHigh` decimal(10,2);--> statement-breakpoint
ALTER TABLE `daily_rates` ADD `comps` json;