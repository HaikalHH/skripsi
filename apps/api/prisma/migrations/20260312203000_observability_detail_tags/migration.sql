ALTER TABLE `Transaction`
  ADD COLUMN `detailTag` VARCHAR(191) NULL;

ALTER TABLE `ReminderPreference`
  ADD COLUMN `weeklyReviewEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `monthlyClosingEnabled` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE `IntentObservation` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `messageId` VARCHAR(191) NULL,
  `rawText` TEXT NOT NULL,
  `effectiveText` TEXT NOT NULL,
  `commandKind` VARCHAR(191) NOT NULL,
  `topModule` VARCHAR(191) NULL,
  `moduleOrderJson` JSON NULL,
  `resolutionKind` VARCHAR(191) NOT NULL,
  `resolutionSource` VARCHAR(191) NULL,
  `semanticNormalizedText` TEXT NULL,
  `handledBy` VARCHAR(191) NOT NULL,
  `fallbackStage` VARCHAR(191) NULL,
  `ambiguityFlag` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `IntentObservation_userId_createdAt_idx` ON `IntentObservation`(`userId`, `createdAt`);
CREATE INDEX `IntentObservation_handledBy_createdAt_idx` ON `IntentObservation`(`handledBy`, `createdAt`);
CREATE INDEX `IntentObservation_ambiguityFlag_createdAt_idx` ON `IntentObservation`(`ambiguityFlag`, `createdAt`);

ALTER TABLE `IntentObservation`
  ADD CONSTRAINT `IntentObservation_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
