-- FCM / device registry, agent presence, partner-assignment acknowledgement window
ALTER TABLE "User" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "lastBatteryPercent" INTEGER,
ADD COLUMN "lastBatteryAlertKey" TEXT;

ALTER TABLE "DeviceToken" ADD COLUMN "fcmToken" TEXT,
ADD COLUMN "platform" TEXT,
ADD COLUMN "appVersion" TEXT;

CREATE UNIQUE INDEX "DeviceToken_fcmToken_key" ON "DeviceToken"("fcmToken");

ALTER TABLE "Order" ADD COLUMN "assignmentDueAt" TIMESTAMP(3),
ADD COLUMN "assignmentAcknowledgedAt" TIMESTAMP(3);
