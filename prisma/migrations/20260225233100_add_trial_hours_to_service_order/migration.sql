-- Add trial duration in hours for precise expiration handling
ALTER TABLE "ServiceOrder"
ADD COLUMN IF NOT EXISTS "trialHours" INTEGER;
