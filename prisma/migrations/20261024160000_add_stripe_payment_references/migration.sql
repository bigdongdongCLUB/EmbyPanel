ALTER TABLE "StripePayment" ADD COLUMN "paymentIntentId" TEXT;
ALTER TABLE "StripePayment" ADD COLUMN "stripePaidAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "StripePayment_paymentIntentId_key" ON "StripePayment"("paymentIntentId");
