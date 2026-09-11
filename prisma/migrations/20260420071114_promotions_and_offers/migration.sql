/*
  Warnings:

  - You are about to drop the column `priority` on the `Banner` table. All the data in the column will be lost.
  - You are about to drop the column `section` on the `Banner` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[productId,masterProductVariantId]` on the table `ProductVariant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[warehouseId,promoCode]` on the table `PromoCode` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `warehouseId` to the `PromoCode` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WarehouseCatSubCatApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- DropIndex
DROP INDEX "Banner_priority_idx";

-- DropIndex
DROP INDEX "Banner_section_isActive_idx";

-- DropIndex
DROP INDEX "PromoCode_promoCode_key";

-- AlterTable
ALTER TABLE "Banner" DROP COLUMN "priority",
DROP COLUMN "section",
ADD COLUMN     "bannerType" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "masterProductVariantId" TEXT;

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "appicableOn" TEXT,
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "maxDiscountAmount" DOUBLE PRECISION,
ADD COLUMN     "percentageOff" DOUBLE PRECISION,
ADD COLUMN     "startTime" TEXT,
ADD COLUMN     "warehouseId" TEXT NOT NULL,
ALTER COLUMN "message" DROP NOT NULL,
ALTER COLUMN "noOfUsers" DROP NOT NULL,
ALTER COLUMN "discount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WarehouseCategory" ADD COLUMN     "approvalStatus" "WarehouseCatSubCatApprovalStatus" DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "WarehouseSubCategory" ADD COLUMN     "approvalStatus" "WarehouseCatSubCatApprovalStatus" DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "promoCodeId" TEXT,
    "bannerId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'INACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_warehouseId_idx" ON "Campaign"("warehouseId");

-- CreateIndex
CREATE INDEX "Campaign_warehouseId_status_idx" ON "Campaign"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "Campaign_warehouseId_isActive_idx" ON "Campaign"("warehouseId", "isActive");

-- CreateIndex
CREATE INDEX "Campaign_name_idx" ON "Campaign"("name");

-- CreateIndex
CREATE INDEX "Campaign_promoCodeId_idx" ON "Campaign"("promoCodeId");

-- CreateIndex
CREATE INDEX "Campaign_bannerId_idx" ON "Campaign"("bannerId");

-- CreateIndex
CREATE INDEX "Campaign_startDate_endDate_idx" ON "Campaign"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Banner_warehouseId_idx" ON "Banner"("warehouseId");

-- CreateIndex
CREATE INDEX "Banner_warehouseId_isActive_idx" ON "Banner"("warehouseId", "isActive");

-- CreateIndex
CREATE INDEX "Banner_warehouseId_status_idx" ON "Banner"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "Banner_position_idx" ON "Banner"("position");

-- CreateIndex
CREATE INDEX "Banner_startAt_endAt_idx" ON "Banner"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "ProductVariant_masterProductVariantId_idx" ON "ProductVariant"("masterProductVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_masterProductVariantId_key" ON "ProductVariant"("productId", "masterProductVariantId");

-- CreateIndex
CREATE INDEX "PromoCode_warehouseId_idx" ON "PromoCode"("warehouseId");

-- CreateIndex
CREATE INDEX "PromoCode_warehouseId_status_idx" ON "PromoCode"("warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_warehouseId_promoCode_key" ON "PromoCode"("warehouseId", "promoCode");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_masterProductVariantId_fkey" FOREIGN KEY ("masterProductVariantId") REFERENCES "MasterProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
