-- CreateEnum
CREATE TYPE "VodBizStatus" AS ENUM ('PENDING', 'NO_RESOURCE', 'PROCESSING', 'CANNOT_UPDATE', 'COMPLETED');

-- AlterTable
ALTER TABLE "VodRequest" ADD COLUMN "bizStatus" "VodBizStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill from existing status/adminNote
UPDATE "VodRequest"
SET "bizStatus" = CASE
  WHEN "status" = 'APPROVED' THEN 'COMPLETED'::"VodBizStatus"
  WHEN "status" = 'CANCELLED' THEN 'PROCESSING'::"VodBizStatus"
  WHEN "status" = 'PENDING' THEN 'PENDING'::"VodBizStatus"
  WHEN "status" = 'REJECTED' AND COALESCE("adminNote", '') ILIKE '%无法更新%' THEN 'CANNOT_UPDATE'::"VodBizStatus"
  WHEN "status" = 'REJECTED' THEN 'NO_RESOURCE'::"VodBizStatus"
  ELSE 'PENDING'::"VodBizStatus"
END;

-- CreateIndex
CREATE INDEX "VodRequest_userId_bizStatus_createdAt_idx" ON "VodRequest"("userId", "bizStatus", "createdAt");
