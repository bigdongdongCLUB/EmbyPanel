-- add username login (non-email)
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill existing rows. For current admin created earlier:
UPDATE "User"
SET "username" = 'admin'
WHERE "username" IS NULL;

-- Enforce not null + unique
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
