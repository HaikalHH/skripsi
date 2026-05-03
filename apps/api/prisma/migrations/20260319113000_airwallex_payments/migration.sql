-- CreateEnum
ALTER TABLE `Subscription`
ADD COLUMN `provider` ENUM('DUMMY', 'AIRWALLEX') NOT NULL DEFAULT 'DUMMY',
ADD COLUMN `providerSubscriptionId` VARCHAR(191) NULL,
ADD COLUMN `providerCustomerId` VARCHAR(191) NULL,
ADD COLUMN `providerPriceId` VARCHAR(191) NULL,
ADD COLUMN `providerStatus` VARCHAR(191) NULL,
ADD COLUMN `currentPeriodStartAt` DATETIME(3) NULL,
ADD COLUMN `currentPeriodEndAt` DATETIME(3) NULL,
ADD COLUMN `cancelAt` DATETIME(3) NULL,
ADD COLUMN `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN `cancelledAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Subscription_providerSubscriptionId_key` ON `Subscription`(`providerSubscriptionId`);
CREATE INDEX `Subscription_userId_provider_createdAt_idx` ON `Subscription`(`userId`, `provider`, `createdAt`);

ALTER TABLE `PaymentSession`
ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
ADD COLUMN `provider` ENUM('DUMMY', 'AIRWALLEX') NOT NULL DEFAULT 'DUMMY',
ADD COLUMN `customerEmail` VARCHAR(191) NULL,
ADD COLUMN `providerCheckoutId` VARCHAR(191) NULL,
ADD COLUMN `providerSubscriptionId` VARCHAR(191) NULL,
ADD COLUMN `providerCustomerId` VARCHAR(191) NULL,
ADD COLUMN `providerStatus` VARCHAR(191) NULL,
ADD COLUMN `checkoutUrl` TEXT NULL,
ADD COLUMN `checkoutExpiresAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `PaymentSession_providerCheckoutId_key` ON `PaymentSession`(`providerCheckoutId`);
CREATE INDEX `PaymentSession_userId_provider_status_idx` ON `PaymentSession`(`userId`, `provider`, `status`);
CREATE INDEX `PaymentSession_providerSubscriptionId_idx` ON `PaymentSession`(`providerSubscriptionId`);

CREATE TABLE `PaymentProviderEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `provider` ENUM('DUMMY', 'AIRWALLEX') NOT NULL,
  `providerEventId` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `payloadJson` JSON NOT NULL,
  `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PaymentProviderEvent_provider_providerEventId_key`(`provider`, `providerEventId`),
  INDEX `PaymentProviderEvent_provider_eventType_createdAt_idx`(`provider`, `eventType`, `createdAt`),
  INDEX `PaymentProviderEvent_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PaymentProviderEvent`
ADD CONSTRAINT `PaymentProviderEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
