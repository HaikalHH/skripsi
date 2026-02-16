-- AlterTable
ALTER TABLE `User`
MODIFY `onboardingStep` ENUM(
  'WAIT_REGISTER',
  'ASK_NAME',
  'ASK_CURRENCY',
  'ASK_MONTHLY_BUDGET',
  'ASK_SAVINGS_TARGET',
  'COMPLETED'
) NOT NULL DEFAULT 'WAIT_REGISTER';

-- Normalize pending users to waiting state
UPDATE `User`
SET `onboardingStep` = 'WAIT_REGISTER'
WHERE `registrationStatus` = 'PENDING';
