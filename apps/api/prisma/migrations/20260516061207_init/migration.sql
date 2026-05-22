-- AlterTable
ALTER TABLE `aianalysislog` MODIFY `analysisType` ENUM('INTENT', 'EXTRACTION', 'INSIGHT') NOT NULL;
