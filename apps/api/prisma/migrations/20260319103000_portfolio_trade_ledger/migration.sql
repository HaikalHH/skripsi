-- CreateTable
CREATE TABLE `PortfolioTrade` (
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
  `side` ENUM('BUY', 'SELL') NOT NULL,
  `symbol` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `quantity` DECIMAL(24, 8) NOT NULL,
  `unit` VARCHAR(191) NOT NULL,
  `pricePerUnit` DECIMAL(18, 2) NOT NULL,
  `totalAmount` DECIMAL(18, 2) NOT NULL,
  `realizedPnL` DECIMAL(18, 2) NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `PortfolioTrade_userId_occurredAt_idx`(`userId`, `occurredAt`),
  INDEX `PortfolioTrade_userId_symbol_occurredAt_idx`(`userId`, `symbol`, `occurredAt`),
  INDEX `PortfolioTrade_userId_side_occurredAt_idx`(`userId`, `side`, `occurredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PortfolioTrade`
ADD CONSTRAINT `PortfolioTrade_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
