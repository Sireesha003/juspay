-- Create enums for durable sync retry mechanism
CREATE TYPE "SyncEventType" AS ENUM ('STATUS_UPDATE', 'ASSIGNMENT');
CREATE TYPE "FailedSyncStatus" AS ENUM ('PENDING', 'FAILED', 'SUCCESS');

-- Create table for failed downstream sync events
CREATE TABLE "FailedSyncEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "eventType" "SyncEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "status" "FailedSyncStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FailedSyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FailedSyncEvent_status_createdAt_idx"
  ON "FailedSyncEvent"("status", "createdAt");

CREATE INDEX "FailedSyncEvent_orderId_status_idx"
  ON "FailedSyncEvent"("orderId", "status");
