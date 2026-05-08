-- Normalize IntentObservation text columns only if the table already exists.
SET @target_table := (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'IntentObservation'
    ) THEN 'IntentObservation'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'intentobservation'
    ) THEN 'intentobservation'
    ELSE NULL
  END
);

SET @sql := IF(
  @target_table IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE `',
    @target_table,
    '` MODIFY `rawText` VARCHAR(191) NOT NULL, MODIFY `effectiveText` VARCHAR(191) NOT NULL, MODIFY `semanticNormalizedText` VARCHAR(191) NULL'
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Normalize ReminderEvent.messageText only if the table already exists.
SET @target_table := (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'ReminderEvent'
    ) THEN 'ReminderEvent'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'reminderevent'
    ) THEN 'reminderevent'
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
