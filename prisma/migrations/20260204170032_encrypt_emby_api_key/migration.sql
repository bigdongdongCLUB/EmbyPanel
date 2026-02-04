-- Store Emby API key encrypted (AES-256-GCM)
ALTER TABLE "EmbyServer" ADD COLUMN IF NOT EXISTS "apiKeyEnc" TEXT;
ALTER TABLE "EmbyServer" ADD COLUMN IF NOT EXISTS "apiKeyIv"  TEXT;
ALTER TABLE "EmbyServer" ADD COLUMN IF NOT EXISTS "apiKeyTag" TEXT;

-- Keep apiKey column for backward compatibility (will be nulled after backfill).
