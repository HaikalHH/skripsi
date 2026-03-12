-- CreateTable
CREATE TABLE `ReminderPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `budgetEnabled` BOOLEAN NOT NULL DEFAULT true,
    `weeklyEnabled` BOOLEAN NOT NULL DEFAULT true,
    `recurringEnabled` BOOLEAN NOT NULL DEFAULT true,
    `cashflowEnabled` BOOLEAN NOT NULL DEFAULT true,
    `goalEnabled` BOOLEAN NOT NULL DEFAULT true,
    `quietHoursStart` INTEGER NULL,
    `quietHoursEnd` INTEGER NULL,
    `minIntervalHours` INTEGER NOT NULL DEFAULT 24,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ReminderPreference_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ReminderPreference` ADD CONSTRAINT `ReminderPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
