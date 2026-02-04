-- Allow legacy plaintext apiKey to be null (we store encrypted fields now)
ALTER TABLE "EmbyServer" ALTER COLUMN "apiKey" DROP NOT NULL;
