-- Partner Coupon: time fields, nullable title, composite unique (code, warehouseId).
-- warehouseId stays TEXT to match Warehouse.id (uuid FK was invalid — see schema).
-- Does not recreate Coupon_warehouseId_idx (already exists from base migration).

-- DropForeignKey
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_warehouseId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Coupon_code_key";

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "startTime" VARCHAR(20),
ALTER COLUMN "title" DROP NOT NULL,
ALTER COLUMN "applicablePincodes" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "RefundTransaction" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_warehouseId_key" ON "Coupon"("code", "warehouseId");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
