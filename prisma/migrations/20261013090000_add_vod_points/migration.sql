CREATE TABLE "VodPointEntry" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VodPointEntry_pkey" PRIMARY KEY ("requestId"),
    CONSTRAINT "VodPointEntry_cost_check" CHECK ("cost" > 0 AND "cost" <= 30),
    CONSTRAINT "VodPointEntry_state_check" CHECK ("state" IN ('RESERVED', 'CHARGED', 'RELEASED'))
);
CREATE INDEX "VodPointEntry_userId_month_state_idx" ON "VodPointEntry"("userId", "month", "state");
ALTER TABLE "VodPointEntry" ADD CONSTRAINT "VodPointEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
