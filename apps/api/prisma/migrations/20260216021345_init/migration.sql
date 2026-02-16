-- AlterTable
ALTER TABLE `MessageLog` MODIFY `contentOrCaption` VARCHAR(191) NOT NULL,
    MODIFY `mediaUrlOrLocalPath` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Transaction` MODIFY `rawText` VARCHAR(191) NULL;
