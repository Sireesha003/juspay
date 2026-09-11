-- Restore columns dropped by 20260326130000_drop_fcm_device_presence_assignment; required by current schema.prisma.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastBatteryPercent" INTEGER,
ADD COLUMN IF NOT EXISTS "lastBatteryAlertKey" TEXT;

ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "fcmToken" TEXT,
ADD COLUMN IF NOT EXISTS "platform" TEXT,
ADD COLUMN IF NOT EXISTS "appVersion" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_fcmToken_key" ON "DeviceToken"("fcmToken");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assignmentDueAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "assignmentAcknowledgedAt" TIMESTAMP(3);
