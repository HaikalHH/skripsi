-- AlterTable
ALTER TABLE `IntentObservation` MODIFY `rawText` VARCHAR(191) NOT NULL,
    MODIFY `effectiveText` VARCHAR(191) NOT NULL,
    MODIFY `semanticNormalizedText` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ReminderEvent` MODIFY `messageText` VARCHAR(191) NOT NULL;
