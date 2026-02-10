CREATE TYPE "ServiceOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

CREATE TABLE "ServiceOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "payCycle" "PayCycle" NOT NULL,
  "days" INTEGER NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "status" "ServiceOrderStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),

  CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceOrder_userId_status_createdAt_idx" ON "ServiceOrder"("userId", "status", "createdAt");

ALTER TABLE "ServiceOrder"
  ADD CONSTRAINT "ServiceOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceOrder"
  ADD CONSTRAINT "ServiceOrder_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
