CREATE TABLE `cohosts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`name` varchar(255) NOT NULL,
	`ratePercent` decimal(5,2) NOT NULL DEFAULT '25.00',
	`payoutBasis` enum('gross_revenue','after_platform_fees','after_stay_expenses') NOT NULL DEFAULT 'after_platform_fees',
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cohosts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payout_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payoutId` int NOT NULL,
	`reservationId` int NOT NULL,
	`grossRevenueSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`platformFeesSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`stayExpensesSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`eligibleRevenueSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`amountDueSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payout_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`cohostId` int NOT NULL,
	`payoutMonth` varchar(7) NOT NULL,
	`status` enum('draft','approved','paid') NOT NULL DEFAULT 'draft',
	`ratePercentSnapshot` decimal(5,2) NOT NULL,
	`payoutBasisSnapshot` enum('gross_revenue','after_platform_fees','after_stay_expenses') NOT NULL,
	`grossRevenueSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`platformFeesSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`stayExpensesSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`eligibleRevenueSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`amountDueSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`paidAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reservation_financials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`reservationId` int NOT NULL,
	`grossRevenue` decimal(10,2) NOT NULL DEFAULT '0',
	`platformFees` decimal(10,2) NOT NULL DEFAULT '0',
	`revenueReceivedAt` date,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reservation_financials_id` PRIMARY KEY(`id`),
	CONSTRAINT `reservation_financials_reservationId_unique` UNIQUE(`reservationId`)
);
