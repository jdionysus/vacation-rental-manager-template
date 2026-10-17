CREATE TABLE `auth_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`name` varchar(255),
	`role` enum('host','co_host','cleaner','accountant','admin') NOT NULL DEFAULT 'host',
	`isActive` boolean DEFAULT true,
	`lastLoginAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `damage_charges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reservationId` int NOT NULL,
	`stripeCustomerId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`description` text NOT NULL,
	`stripePaymentIntentId` varchar(128),
	`status` enum('pending','charged','failed','refunded') NOT NULL DEFAULT 'pending',
	`chargedAt` timestamp,
	`chargedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `damage_charges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ota_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`platform` enum('airbnb','vrbo','homeaway','booking_com','other') NOT NULL,
	`label` varchar(128),
	`url` text NOT NULL,
	`isActive` boolean DEFAULT true,
	`sortOrder` int DEFAULT 0,
	CONSTRAINT `ota_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pricing_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`name` varchar(128) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`nightlyRate` decimal(10,2) NOT NULL,
	`minNights` int DEFAULT 1,
	`priority` int DEFAULT 0,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pricing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stripe_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reservationId` int NOT NULL,
	`guestEmail` varchar(320) NOT NULL,
	`guestName` varchar(255),
	`stripeCustomerId` varchar(128) NOT NULL,
	`stripePaymentMethodId` varchar(128),
	`stripeSetupIntentId` varchar(128),
	`cardBrand` varchar(32),
	`cardLast4` varchar(4),
	`cardExpMonth` int,
	`cardExpYear` int,
	`termsAcceptedAt` timestamp,
	`damageChargeConsent` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stripe_customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `terms_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`slug` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`isRequired` boolean DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `terms_pages_id` PRIMARY KEY(`id`)
);
