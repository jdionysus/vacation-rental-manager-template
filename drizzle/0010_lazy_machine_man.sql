CREATE TABLE `guestbook_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL DEFAULT 1,
	`guestName` varchar(128) NOT NULL,
	`hometown` varchar(128),
	`message` text NOT NULL,
	`isVisible` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guestbook_entries_id` PRIMARY KEY(`id`)
);
