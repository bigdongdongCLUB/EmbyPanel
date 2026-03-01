-- Default new users to expiry reminder enabled
ALTER TABLE "User"
ALTER COLUMN "expiryReminderEnabled" SET DEFAULT true;

-- Backfill existing users to enabled
UPDATE "User"
SET "expiryReminderEnabled" = true
WHERE "expiryReminderEnabled" = false;
