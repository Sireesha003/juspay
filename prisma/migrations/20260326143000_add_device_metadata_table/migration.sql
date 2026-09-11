CREATE TABLE "DeviceMetadata" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceToken" TEXT,
    "platform" TEXT,
    "deviceModel" TEXT,
    "deviceBrand" TEXT,
    "deviceManufacturer" TEXT,
    "deviceName" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "buildNumber" TEXT,
    "sdkVersion" TEXT,
    "networkType" TEXT,
    "ipAddress" TEXT,
    "language" TEXT,
    "timezone" TEXT,
    "country" TEXT,
    "notificationEnabled" BOOLEAN,
    "isEmulator" BOOLEAN,
    "isRooted" BOOLEAN,
    "clientUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceMetadata_userId_deviceId_key" ON "DeviceMetadata"("userId", "deviceId");
CREATE INDEX "DeviceMetadata_userId_idx" ON "DeviceMetadata"("userId");
CREATE INDEX "DeviceMetadata_deviceToken_idx" ON "DeviceMetadata"("deviceToken");
CREATE INDEX "DeviceMetadata_updatedAt_idx" ON "DeviceMetadata"("updatedAt");

ALTER TABLE "DeviceMetadata" ADD CONSTRAINT "DeviceMetadata_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
