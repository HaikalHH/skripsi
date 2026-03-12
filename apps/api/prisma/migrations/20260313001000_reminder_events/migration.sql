-- CreateTable
CREATE TABLE `ReminderEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reminderType` VARCHAR(191) NOT NULL,
    `marker` VARCHAR(191) NOT NULL,
    `messageText` TEXT NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReminderEvent_userId_sentAt_idx`(`userId`, `sentAt`),
    INDEX `ReminderEvent_userId_reminderType_sentAt_idx`(`userId`, `reminderType`, `sentAt`),
    INDEX `ReminderEvent_userId_marker_sentAt_idx`(`userId`, `marker`, `sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ReminderEvent` ADD CONSTRAINT `ReminderEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
