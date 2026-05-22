-- Drop legacy budget table. Category limits are now stored in ExpensePlanItem.amount.
DROP TABLE IF EXISTS `Budget`;
DROP TABLE IF EXISTS `budget`;
