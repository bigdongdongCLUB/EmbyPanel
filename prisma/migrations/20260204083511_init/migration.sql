-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('OPEN', 'IGNORED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('MULTI_DEVICE_CONCURRENCY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "maxConcurrentStreams" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbyServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastHealthAt" TIMESTAMP(3),
    "lastHealthOk" BOOLEAN,
    "lastHealthMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmbyServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionServer" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "embyServerId" TEXT NOT NULL,

    CONSTRAINT "SubscriptionServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbyUserLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "embyServerId" TEXT NOT NULL,
    "embyUserId" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmbyUserLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSnapshot" (
    "id" TEXT NOT NULL,
    "embyServerId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionCount" INTEGER NOT NULL,
    "rawJson" JSONB,

    CONSTRAINT "SessionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL,
    "type" "AnomalyType" NOT NULL,
    "status" "AnomalyStatus" NOT NULL DEFAULT 'OPEN',
    "userId" TEXT NOT NULL,
    "embyServerId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceJson" JSONB NOT NULL,
    "note" TEXT,

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "message" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_endAt_idx" ON "Subscription"("endAt");

-- CreateIndex
CREATE INDEX "EmbyServer_enabled_idx" ON "EmbyServer"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionServer_subscriptionId_embyServerId_key" ON "SubscriptionServer"("subscriptionId", "embyServerId");

-- CreateIndex
CREATE INDEX "EmbyUserLink_embyServerId_idx" ON "EmbyUserLink"("embyServerId");

-- CreateIndex
CREATE UNIQUE INDEX "EmbyUserLink_userId_embyServerId_key" ON "EmbyUserLink"("userId", "embyServerId");

-- CreateIndex
CREATE INDEX "SessionSnapshot_embyServerId_capturedAt_idx" ON "SessionSnapshot"("embyServerId", "capturedAt");

-- CreateIndex
CREATE INDEX "Anomaly_status_detectedAt_idx" ON "Anomaly"("status", "detectedAt");

-- CreateIndex
CREATE INDEX "Anomaly_userId_detectedAt_idx" ON "Anomaly"("userId", "detectedAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionServer" ADD CONSTRAINT "SubscriptionServer_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionServer" ADD CONSTRAINT "SubscriptionServer_embyServerId_fkey" FOREIGN KEY ("embyServerId") REFERENCES "EmbyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbyUserLink" ADD CONSTRAINT "EmbyUserLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbyUserLink" ADD CONSTRAINT "EmbyUserLink_embyServerId_fkey" FOREIGN KEY ("embyServerId") REFERENCES "EmbyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSnapshot" ADD CONSTRAINT "SessionSnapshot_embyServerId_fkey" FOREIGN KEY ("embyServerId") REFERENCES "EmbyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anomaly" ADD CONSTRAINT "Anomaly_embyServerId_fkey" FOREIGN KEY ("embyServerId") REFERENCES "EmbyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
