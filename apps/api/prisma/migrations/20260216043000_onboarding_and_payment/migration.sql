-- AlterTable
ALTER TABLE `User`
ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
ADD COLUMN `monthlyBudget` DECIMAL(12, 2) NULL,
ADD COLUMN `registrationStatus` ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
ADD COLUMN `onboardingStep` ENUM('ASK_NAME', 'ASK_CURRENCY', 'ASK_MONTHLY_BUDGET', 'ASK_SAVINGS_TARGET', 'COMPLETED') NOT NULL DEFAULT 'ASK_NAME',
ADD COLUMN `onboardingCompletedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PaymentSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `status` ENUM('PENDING', 'PAID', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  `paidAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PaymentSession_token_key`(`token`),
  INDEX `PaymentSession_userId_status_idx`(`userId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboundMessage` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `waNumber` VARCHAR(191) NOT NULL,
  `messageText` TEXT NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `errorMessage` VARCHAR(191) NULL,
  `sentAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `OutboundMessage_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `OutboundMessage_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaymentSession`
ADD CONSTRAINT `PaymentSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutboundMessage`
ADD CONSTRAINT `OutboundMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
