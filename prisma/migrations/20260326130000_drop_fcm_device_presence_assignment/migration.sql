-- Align final schema with current prisma/schema.prisma.
-- This migration intentionally drops fields introduced by 20260326120000_fcm_device_presence_assignment.

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
