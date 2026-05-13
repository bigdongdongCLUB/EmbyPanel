ALTER TABLE "User" ADD COLUMN "maxConcurrentPlaybacksExpiresAt" TIMESTAMP(3);

WITH latest_active_plan_subscription AS (
  SELECT DISTINCT ON ("userId")
    "userId",
    "endAt"
  FROM "Subscription"
  WHERE "status" = 'ACTIVE'
    AND "planId" IS NOT NULL
    AND "endAt" > NOW()
  ORDER BY "userId", "endAt" DESC, "createdAt" DESC
)
UPDATE "User" AS u
SET "maxConcurrentPlaybacksExpiresAt" = s."endAt"
FROM latest_active_plan_subscription AS s
WHERE u."id" = s."userId"
  AND u."maxConcurrentPlaybacks" <> 1;

UPDATE "User"
SET "maxConcurrentPlaybacks" = 1
WHERE "maxConcurrentPlaybacks" <> 1
  AND "maxConcurrentPlaybacksExpiresAt" IS NULL;
