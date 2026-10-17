CREATE TABLE IF NOT EXISTS `cleaning_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`reservationId` int,
	`checkoutDate` date NOT NULL,
	`checkinDate` date,
	`status` enum('pending','accepted','in_progress','complete','skipped') NOT NULL DEFAULT 'pending',
	`assignedToId` int,
	`checklistTemplateId` int,
	`checklistProgress` json,
	`notes` text,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cleaning_jobs_id` PRIMARY KEY(`id`)
);
