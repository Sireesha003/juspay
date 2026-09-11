/*
  Warnings:

  - You are about to drop the column `appVersion` on the `DeviceToken` table. All the data in the column will be lost.
  - You are about to drop the column `fcmToken` on the `DeviceToken` table. All the data in the column will be lost.
  - You are about to drop the column `platform` on the `DeviceToken` table. All the data in the column will be lost.
  - You are about to drop the column `assignmentAcknowledgedAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `assignmentDueAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `lastBatteryAlertKey` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lastBatteryPercent` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lastHeartbeatAt` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX IF EXISTS "DeviceToken_fcmToken_key";

-- AlterTable
ALTER TABLE "DeviceToken" DROP COLUMN IF EXISTS "appVersion",
DROP COLUMN IF EXISTS "fcmToken",
DROP COLUMN IF EXISTS "platform";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN IF EXISTS "assignmentAcknowledgedAt",
DROP COLUMN IF EXISTS "assignmentDueAt";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastBatteryAlertKey",
DROP COLUMN IF EXISTS "lastBatteryPercent",
DROP COLUMN IF EXISTS "lastHeartbeatAt";
