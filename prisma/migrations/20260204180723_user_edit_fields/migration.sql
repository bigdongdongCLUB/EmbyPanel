-- Add user management fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "balanceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "expiryReminderEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Add pay cycle to subscriptions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayCycle') THEN
    CREATE TYPE "PayCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
  END IF;
END $$;

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "payCycle" "PayCycle";
