-- Add optional external URL for user-facing server address
ALTER TABLE "EmbyServer"
ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
