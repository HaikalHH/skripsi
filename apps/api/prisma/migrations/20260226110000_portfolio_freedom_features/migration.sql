-- CreateTable
CREATE TABLE `PortfolioAsset` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `assetType` ENUM(
    'GOLD',
    'STOCK',
    'MUTUAL_FUND',
    'CRYPTO',
    'DEPOSIT',
    'PROPERTY',
    'BUSINESS',
    'OTHER'
  ) NOT NULL,
  `symbol` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `quantity` DECIMAL(24, 8) NOT NULL,
  `unit` VARCHAR(191) NOT NULL,
  `averageBuyPrice` DECIMAL(18, 2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PortfolioAsset_userId_assetType_symbol_key`(`userId`, `assetType`, `symbol`),
  INDEX `PortfolioAsset_userId_assetType_idx`(`userId`, `assetType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialFreedomProfile` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `monthlyExpense` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `targetYears` INTEGER NOT NULL DEFAULT 15,
  `safeWithdrawalRate` DECIMAL(5, 4) NOT NULL DEFAULT 0.04,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `FinancialFreedomProfile_userId_key`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PortfolioAsset`
ADD CONSTRAINT `PortfolioAsset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialFreedomProfile`
ADD CONSTRAINT `FinancialFreedomProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
