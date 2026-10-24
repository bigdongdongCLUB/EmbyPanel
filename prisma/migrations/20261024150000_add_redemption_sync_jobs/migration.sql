CREATE TABLE "RedemptionSyncJob" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RedemptionSyncJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RedemptionSyncJob_subscriptionId_key" ON "RedemptionSyncJob"("subscriptionId");
CREATE INDEX "RedemptionSyncJob_status_nextAttemptAt_idx" ON "RedemptionSyncJob"("status", "nextAttemptAt");
ALTER TABLE "RedemptionSyncJob" ADD CONSTRAINT "RedemptionSyncJob_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
