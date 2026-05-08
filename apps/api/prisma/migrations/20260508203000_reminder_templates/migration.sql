-- CreateTable
CREATE TABLE `ReminderTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `templateKey` VARCHAR(191) NOT NULL,
    `reminderType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `marker` VARCHAR(191) NOT NULL,
    `messageText` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ReminderTemplate_templateKey_key`(`templateKey`),
    INDEX `ReminderTemplate_reminderType_idx`(`reminderType`),
    INDEX `ReminderTemplate_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
