-- Card code management
CREATE TYPE "CardCodeType" AS ENUM ('BALANCE', 'SUBSCRIPTION');
CREATE TYPE "CardCodeStatus" AS ENUM ('UNUSED', 'USED', 'DISABLED');

CREATE TABLE "CardCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "CardCodeType" NOT NULL,
  "status" "CardCodeStatus" NOT NULL DEFAULT 'UNUSED',
  "amountCents" INTEGER,
  "planId" TEXT,
  "payCycle" "PayCycle",
  "subscriptionDays" INTEGER,
  "batchTag" TEXT,
  "note" TEXT,
  "usedAt" TIMESTAMP(3),
  "usedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CardCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardCode_code_key" ON "CardCode"("code");
CREATE INDEX "CardCode_type_status_createdAt_idx" ON "CardCode"("type", "status", "createdAt");
CREATE INDEX "CardCode_planId_idx" ON "CardCode"("planId");

ALTER TABLE "CardCode"
  ADD CONSTRAINT "CardCode_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CardCode"
  ADD CONSTRAINT "CardCode_usedByUserId_fkey"
  FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
