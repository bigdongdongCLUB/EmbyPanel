/*
  Warnings:

  - You are about to drop the column `durationDays` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxConcurrentStreams` on the `Plan` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ServerAssignStrategy" AS ENUM ('ALL', 'LOAD_BALANCE');

-- Ensure enum exists before altering (fresh install compatibility)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PayCycle') THEN
    CREATE TYPE "PayCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
  END IF;
END $$;

ALTER TYPE "PayCycle" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "PayCycle" ADD VALUE IF NOT EXISTS 'HALF_YEARLY';
ALTER TYPE "PayCycle" ADD VALUE IF NOT EXISTS 'TWO_YEARLY';

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_planId_fkey";

-- AlterTable
ALTER TABLE "Plan" DROP COLUMN "durationDays",
DROP COLUMN "maxConcurrentStreams",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "pricingJson" JSONB,
ADD COLUMN     "serverAssignStrategy" "ServerAssignStrategy" NOT NULL DEFAULT 'LOAD_BALANCE',
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PlanServerConfig" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "embyServerId" TEXT NOT NULL,
    "templateEmbyUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanServerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanServerConfig_embyServerId_idx" ON "PlanServerConfig"("embyServerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanServerConfig_planId_embyServerId_key" ON "PlanServerConfig"("planId", "embyServerId");

-- AddForeignKey
ALTER TABLE "PlanServerConfig" ADD CONSTRAINT "PlanServerConfig_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanServerConfig" ADD CONSTRAINT "PlanServerConfig_embyServerId_fkey" FOREIGN KEY ("embyServerId") REFERENCES "EmbyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
