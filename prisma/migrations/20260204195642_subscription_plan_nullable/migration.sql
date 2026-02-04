-- Allow subscriptions without Plan (server-only subscription for MVP)
ALTER TABLE "Subscription" ALTER COLUMN "planId" DROP NOT NULL;
