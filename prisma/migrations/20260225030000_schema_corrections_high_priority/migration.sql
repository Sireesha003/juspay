-- =============================================================================
-- Schema corrections (high priority) – run from a single migration runner only
-- Pre-requisites: Backup DB; deploy code using otpExpiresAt and VENDOR first
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ApprovalStatus: SUBMITED → SUBMITTED
-- -----------------------------------------------------------------------------
-- Create new enum with SUBMITTED (do not use ADD VALUE - cannot use new value in same transaction)
CREATE TYPE "ApprovalStatus_new" AS ENUM (
  'PENDING',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'DOCUMENT_VERIFICATION',
  'FIELD_VISIT',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "Warehouse" ALTER COLUMN "approvalStatus" DROP DEFAULT;
ALTER TABLE "Warehouse" ALTER COLUMN "approvalStatus" TYPE "ApprovalStatus_new"
  USING (
    CASE WHEN "approvalStatus"::text = 'SUBMITED' THEN 'SUBMITTED'::"ApprovalStatus_new"
         ELSE "approvalStatus"::text::"ApprovalStatus_new"
    END
  );

DROP TYPE "ApprovalStatus";
ALTER TYPE "ApprovalStatus_new" RENAME TO "ApprovalStatus";

ALTER TABLE "Warehouse" ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING_APPROVAL'::"ApprovalStatus";

-- -----------------------------------------------------------------------------
-- 2. UserRole: VENDER → VENDOR
-- -----------------------------------------------------------------------------
-- Create new enum with VENDOR (do not use ADD VALUE - cannot use new value in same transaction)
CREATE TYPE "UserRole_new" AS ENUM (
  'CONSUMER',
  'WAREHOUSE_STAFF',
  'DELIVERY_AGENT',
  'SUPER_ADMIN',
  'REGIONAL_ADMIN',
  'OPERATIONAL_ADMIN',
  'SUPPLIER',
  'VENDOR',
  'PARTNER',
  'OWNER',
  'DIRECTOR',
  'MANAGER'
);

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE WHEN "role"::text = 'VENDER' THEN 'VENDOR'::"UserRole_new"
         ELSE "role"::text::"UserRole_new"
    END
  );

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CONSUMER'::"UserRole";

-- -----------------------------------------------------------------------------
-- 3. Table rename: ContentManagment → ContentManagement
-- -----------------------------------------------------------------------------
ALTER TABLE "ContentManagment" RENAME TO "ContentManagement";

-- -----------------------------------------------------------------------------
-- 4. Order: remove duplicate otpExpiry (keep otpExpiresAt)
-- -----------------------------------------------------------------------------
UPDATE "Order"
SET "otpExpiresAt" = COALESCE("otpExpiresAt", "otpExpiry")
WHERE "otpExpiry" IS NOT NULL;

ALTER TABLE "Order" DROP COLUMN IF EXISTS "otpExpiry";

-- -----------------------------------------------------------------------------
-- 5. Delivery: rename otpExpiry → otpExpiresAt
-- -----------------------------------------------------------------------------
ALTER TABLE "Delivery" RENAME COLUMN "otpExpiry" TO "otpExpiresAt";

-- -----------------------------------------------------------------------------
-- 6. StockAdjust: add createdById FK, migrate, drop createdBy
-- -----------------------------------------------------------------------------
ALTER TABLE "StockAdjust" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

UPDATE "StockAdjust"
SET "createdById" = "createdBy"
WHERE "createdBy" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "StockAdjust"."createdBy");

ALTER TABLE "StockAdjust" DROP COLUMN IF EXISTS "createdBy";

ALTER TABLE "StockAdjust"
  ADD CONSTRAINT "StockAdjust_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "StockAdjust_createdById_idx" ON "StockAdjust"("createdById");
