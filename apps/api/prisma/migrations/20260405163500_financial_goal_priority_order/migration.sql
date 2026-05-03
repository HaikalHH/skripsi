ALTER TABLE `FinancialGoal`
ADD COLUMN `priorityOrder` INTEGER NOT NULL DEFAULT 999;

CREATE INDEX `FinancialGoal_userId_priorityOrder_idx`
ON `FinancialGoal`(`userId`, `priorityOrder`);
