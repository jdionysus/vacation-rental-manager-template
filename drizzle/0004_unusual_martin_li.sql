-- Create checklist_templates if it doesn't exist yet
CREATE TABLE IF NOT EXISTS `checklist_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`name` varchar(128) NOT NULL,
	`description` text,
	`taskType` enum('turnover','maintenance','inspection','other') NOT NULL DEFAULT 'turnover',
	`items` json NOT NULL,
	`isDefault` boolean DEFAULT false,
	`assignedToId` int,
	`autoAssignOn` varchar(20) DEFAULT 'manual',
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checklist_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Fix items column type if it was created as text instead of json (safe to run even if already json)
ALTER TABLE `checklist_templates` MODIFY COLUMN `items` json NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `daily_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`date` varchar(10) NOT NULL,
	`competitorRate` decimal(10,2),
	`multiplier` decimal(5,3) NOT NULL DEFAULT '1.000',
	`overrideRate` decimal(10,2),
	`cleaningFee` decimal(10,2) NOT NULL DEFAULT '100.00',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `auth_users` MODIFY COLUMN `role` enum('host','property_manager','cleaner','accountant','admin') NOT NULL DEFAULT 'host';
--> statement-breakpoint
ALTER TABLE `costs` MODIFY COLUMN `category` enum('cleaning','supplies','repairs','property_manager_fee','platform_fee','utilities','other') NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('host','property_manager','cleaner','accountant','admin') NOT NULL DEFAULT 'host';