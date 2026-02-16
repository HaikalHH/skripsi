-- Normalize OutboundMessage column type if the table already exists.
-- This migration was created before OutboundMessage table creation in some environments,
-- so it must be resilient when the table is not present yet.
SET @target_table := (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'OutboundMessage'
    ) THEN 'OutboundMessage'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'outboundmessage'
    ) THEN 'outboundmessage'
    ELSE NULL
  END
);

SET @sql := IF(
  @target_table IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @target_table, '` MODIFY `messageText` VARCHAR(191) NOT NULL')
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
