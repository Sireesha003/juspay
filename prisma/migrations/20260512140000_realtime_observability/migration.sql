-- Realtime / observability tables (shared across VillagKart services using same DB)

CREATE TABLE "DeliveryLocationHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "agentId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "source" TEXT DEFAULT 'DELIVERY_API',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryLocationHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryLocationHistory_orderId_createdAt_idx" ON "DeliveryLocationHistory"("orderId", "createdAt");
CREATE INDEX "DeliveryLocationHistory_agentId_createdAt_idx" ON "DeliveryLocationHistory"("agentId", "createdAt");

ALTER TABLE "DeliveryLocationHistory" ADD CONSTRAINT "DeliveryLocationHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryLocationHistory" ADD CONSTRAINT "DeliveryLocationHistory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NotificationDispatchLog" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "type" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "orderId" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "fcmMessageId" TEXT,
    "error" TEXT,
    "correlationId" TEXT,
    "sourceService" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDispatchLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDispatchLog_idempotencyKey_key" ON "NotificationDispatchLog"("idempotencyKey");
CREATE INDEX "NotificationDispatchLog_recipientUserId_createdAt_idx" ON "NotificationDispatchLog"("recipientUserId", "createdAt");
CREATE INDEX "NotificationDispatchLog_orderId_createdAt_idx" ON "NotificationDispatchLog"("orderId", "createdAt");
CREATE INDEX "NotificationDispatchLog_type_status_createdAt_idx" ON "NotificationDispatchLog"("type", "status", "createdAt");

CREATE TABLE "SocketSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "socketId" TEXT NOT NULL,
    "serverInstanceId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    CONSTRAINT "SocketSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocketSession_userId_namespace_idx" ON "SocketSession"("userId", "namespace");
CREATE INDEX "SocketSession_connectedAt_idx" ON "SocketSession"("connectedAt");

ALTER TABLE "SocketSession" ADD CONSTRAINT "SocketSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationQueueLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationQueueLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationQueueLog_jobName_createdAt_idx" ON "NotificationQueueLog"("jobName", "createdAt");
CREATE INDEX "NotificationQueueLog_status_createdAt_idx" ON "NotificationQueueLog"("status", "createdAt");
