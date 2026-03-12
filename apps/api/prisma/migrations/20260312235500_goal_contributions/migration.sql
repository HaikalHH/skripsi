-- CreateTable
CREATE TABLE `GoalContribution` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `goalId` VARCHAR(191) NOT NULL,
    `amount` BIGINT NOT NULL,
    `note` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GoalContribution_userId_occurredAt_idx`(`userId`, `occurredAt`),
    INDEX `GoalContribution_goalId_occurredAt_idx`(`goalId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GoalContribution` ADD CONSTRAINT `GoalContribution_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoalContribution` ADD CONSTRAINT `GoalContribution_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `FinancialGoal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
