ALTER TABLE "VodRequest" ADD COLUMN "userDeletedAt" TIMESTAMP(3);

CREATE INDEX "VodRequest_userId_userDeletedAt_createdAt_idx"
ON "VodRequest"("userId", "userDeletedAt", "createdAt");
