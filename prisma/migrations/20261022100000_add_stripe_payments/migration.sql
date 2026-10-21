ALTER TABLE "ServiceOrder" ADD COLUMN "paymentSource" TEXT,
  ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "fulfillmentJson" JSONB,
  ADD COLUMN "fulfillmentUpdatedAt" TIMESTAMP(3);
CREATE TABLE "StripePayment" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "methodId" TEXT NOT NULL,
  "sessionId" TEXT, "checkoutUrl" TEXT, "amountCents" INTEGER NOT NULL,
  "feeCents" INTEGER NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'cny',
  "livemode" BOOLEAN NOT NULL, "state" TEXT NOT NULL DEFAULT 'CREATING',
  "credentials" JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastEventId" TEXT, "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StripePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StripePayment_amount_check" CHECK ("amountCents" > 0 AND "feeCents" >= 0),
  CONSTRAINT "StripePayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StripePayment_orderId_key" ON "StripePayment"("orderId");
CREATE UNIQUE INDEX "StripePayment_sessionId_key" ON "StripePayment"("sessionId");
CREATE INDEX "StripePayment_state_updatedAt_idx" ON "StripePayment"("state", "updatedAt");
CREATE INDEX "StripePayment_methodId_idx" ON "StripePayment"("methodId");
