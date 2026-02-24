-- CreateEnum
CREATE TYPE "VodMediaType" AS ENUM ('MOVIE', 'TV');

-- CreateEnum
CREATE TYPE "VodRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "VodRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "mediaType" "VodMediaType" NOT NULL,
    "title" TEXT NOT NULL,
    "titleOriginal" TEXT NOT NULL,
    "posterPath" TEXT,
    "year" TEXT,
    "season" INTEGER,
    "note" TEXT,
    "status" "VodRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VodRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VodRequest_userId_status_createdAt_idx" ON "VodRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VodRequest_tmdbId_mediaType_idx" ON "VodRequest"("tmdbId", "mediaType");

-- AddForeignKey
ALTER TABLE "VodRequest" ADD CONSTRAINT "VodRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
