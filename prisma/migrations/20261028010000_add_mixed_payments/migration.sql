ALTER TABLE "StripePayment" ADD COLUMN "balanceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StripePayment" ADD COLUMN "balanceState" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "StripePayment" ADD CONSTRAINT "StripePayment_balance_check" CHECK (
  "balanceCents" >= 0 AND "balanceState" IN ('NONE', 'HELD', 'CONSUMED', 'RELEASED') AND
  (("balanceCents" = 0 AND "balanceState" = 'NONE') OR ("balanceCents" > 0 AND "balanceState" <> 'NONE'))
);
