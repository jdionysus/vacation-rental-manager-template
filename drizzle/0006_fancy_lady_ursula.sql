CREATE TABLE IF NOT EXISTS `bypass_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`code` varchar(10) NOT NULL,
	`label` varchar(128),
	`portalType` enum('guest','cleaner','inspector','all') NOT NULL DEFAULT 'guest',
	`isActive` boolean NOT NULL DEFAULT true,
	`lastUsedAt` timestamp,
	`useCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bypass_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `bypass_codes_code_unique` UNIQUE(`code`)
);
