CREATE TABLE `booking_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`guestName` varchar(255) NOT NULL,
	`guestEmail` varchar(320) NOT NULL,
	`guestPhone` varchar(32),
	`arrivalDate` date NOT NULL,
	`departureDate` date NOT NULL,
	`guestCount` int DEFAULT 1,
	`message` text,
	`status` enum('new','reviewed','converted','declined') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `booking_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`source` enum('direct','airbnb','vrbo','booking_com','manual','other') NOT NULL,
	`externalUid` varchar(512),
	`title` varchar(255),
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`eventType` enum('booking','block','maintenance') NOT NULL DEFAULT 'booking',
	`reservationId` int,
	`lastSeenAt` timestamp DEFAULT (now()),
	`isStale` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`reservationId` int,
	`category` enum('cleaning','supplies','repairs','co_host_fee','platform_fee','utilities','other') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`vendor` varchar(255),
	`description` text,
	`costDate` date NOT NULL,
	`receiptUrl` text,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `costs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guest_access_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reservationId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`validFrom` timestamp NOT NULL,
	`validUntil` timestamp NOT NULL,
	`lastUsedAt` timestamp,
	`useCount` int DEFAULT 0,
	`isRevoked` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guest_access_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `guest_access_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `guest_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`slug` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text,
	`icon` varchar(64),
	`sortOrder` int DEFAULT 0,
	`isVisible` boolean DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guest_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ical_feeds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`source` enum('airbnb','vrbo','booking_com','other') NOT NULL,
	`label` varchar(128),
	`url` text NOT NULL,
	`direction` enum('import','export') NOT NULL DEFAULT 'import',
	`lastSyncAt` timestamp,
	`lastStatus` enum('ok','error','pending') DEFAULT 'pending',
	`lastError` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ical_feeds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'Our Rental',
	`tagline` text,
	`description` text,
	`address` text,
	`city` varchar(128),
	`maxGuests` int DEFAULT 4,
	`bedrooms` int DEFAULT 1,
	`bathrooms` int DEFAULT 1,
	`checkInTime` varchar(8) DEFAULT '15:00',
	`checkOutTime` varchar(8) DEFAULT '11:00',
	`cleaningFee` decimal(10,2) DEFAULT '0',
	`nightlyRate` decimal(10,2) DEFAULT '0',
	`amenities` json DEFAULT ('[]'),
	`houseRules` text,
	`photos` json DEFAULT ('[]'),
	`timezone` varchar(64) DEFAULT 'America/Denver',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`source` enum('direct','airbnb','vrbo','booking_com','other') NOT NULL DEFAULT 'direct',
	`status` enum('pending','confirmed','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'pending',
	`guestName` varchar(255),
	`guestEmail` varchar(320),
	`guestPhone` varchar(32),
	`guestCount` int DEFAULT 1,
	`arrivalDate` date NOT NULL,
	`departureDate` date NOT NULL,
	`nightlyRate` decimal(10,2),
	`cleaningFee` decimal(10,2),
	`totalAmount` decimal(10,2),
	`paymentStatus` enum('unpaid','partial','paid','refunded') DEFAULT 'unpaid',
	`notes` text,
	`externalId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`reservationId` int,
	`assignedToId` int,
	`type` enum('turnover','maintenance','inspection','other') NOT NULL DEFAULT 'turnover',
	`title` varchar(255) NOT NULL,
	`notes` text,
	`dueDate` date,
	`arrivalWindow` varchar(64),
	`departureWindow` varchar(64),
	`checklist` json DEFAULT ('[]'),
	`status` enum('pending','in_progress','complete','skipped') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('host','co_host','cleaner','accountant','admin') NOT NULL DEFAULT 'host';