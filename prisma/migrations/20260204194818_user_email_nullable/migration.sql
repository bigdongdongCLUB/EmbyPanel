-- Ensure email is nullable (optional)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
