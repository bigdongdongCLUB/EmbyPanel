CREATE TABLE IF NOT EXISTS "PlaybackEvent" (
  "id" TEXT PRIMARY KEY,
  "embyServerId" TEXT NOT NULL,
  "activityId" TEXT,
  "embyUserId" TEXT,
  "userName" TEXT,
  "eventType" TEXT NOT NULL,
  "mediaName" TEXT NOT NULL,
  "mediaKey" TEXT NOT NULL,
  "client" TEXT,
  "ip" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "sourceJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaybackEvent_embyServerId_fkey" FOREIGN KEY ("embyServerId") REFERENCES "EmbyServer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlaybackEvent_embyServerId_activityId_key" ON "PlaybackEvent"("embyServerId", "activityId");
CREATE INDEX IF NOT EXISTS "PlaybackEvent_embyServerId_embyUserId_occurredAt_idx" ON "PlaybackEvent"("embyServerId", "embyUserId", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlaybackEvent_embyServerId_userName_occurredAt_idx" ON "PlaybackEvent"("embyServerId", "userName", "occurredAt");
CREATE INDEX IF NOT EXISTS "PlaybackEvent_occurredAt_idx" ON "PlaybackEvent"("occurredAt");
