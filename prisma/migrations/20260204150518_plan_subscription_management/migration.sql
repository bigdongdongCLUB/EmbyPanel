/*
  Warnings:

  - You are about to drop the column `durationDays` on the `Plan` table. All the data in the column will be lost.
  - You are about to drop the column `maxConcurrentStreams` on the `Plan` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ServerAssignStrategy" AS ENUM ('ALL', 'LOAD_BALANCE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayCycle" ADD VALUE 'TRIAL';
ALTER TYPE "PayCycle" ADD VALUE 'HALF_YEARLY';
ALTER TYPE "PayCycle" ADD VALUE 'TWO_YEARLY';

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
