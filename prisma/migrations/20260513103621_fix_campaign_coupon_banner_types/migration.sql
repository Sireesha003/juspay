/*
  Warnings:

  - You are about to drop the column `promoCodeId` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the `PromoCode` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name,categoryId,subCategoryId]` on the table `Brand` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[warehouseId,bannerId,couponId]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[warehouseId,warehouseCategoryId,subCategoryId]` on the table `WarehouseSubCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_promoCodeId_fkey";

-- DropForeignKey
ALTER TABLE "PromoCode" DROP CONSTRAINT "PromoCode_warehouseId_fkey";

-- DropIndex
DROP INDEX "Brand_name_key";

-- DropIndex
DROP INDEX "Campaign_promoCodeId_idx";

-- DropIndex
DROP INDEX "Order_deliveryType_status_createdAt_idx";

-- DropIndex
DROP INDEX "Order_status_createdAt_idx";

-- DropIndex
DROP INDEX "Order_warehouseId_createdAt_idx";

-- DropIndex
DROP INDEX "WarehouseSubCategory_warehouseCategoryId_subCategoryId_key";

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "promoCodeId",
ADD COLUMN     "couponId" UUID;

-- AlterTable
ALTER TABLE "MasterProduct" ADD COLUMN     "cancellableOrderStatuses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "returnableDays" INTEGER;

-- AlterTable
ALTER TABLE "WarehouseSubCategory" ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "PromoCode";

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_categoryId_subCategoryId_key" ON "Brand"("name", "categoryId", "subCategoryId");

-- CreateIndex
CREATE INDEX "Campaign_couponId_idx" ON "Campaign"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_warehouseId_bannerId_couponId_key" ON "Campaign"("warehouseId", "bannerId", "couponId");

-- CreateIndex
CREATE INDEX "WarehouseSubCategory_warehouseCategoryId_idx" ON "WarehouseSubCategory"("warehouseCategoryId");

-- CreateIndex
CREATE INDEX "WarehouseSubCategory_subCategoryId_idx" ON "WarehouseSubCategory"("subCategoryId");

-- CreateIndex
CREATE INDEX "WarehouseSubCategory_warehouseId_isEnabled_idx" ON "WarehouseSubCategory"("warehouseId", "isEnabled");

-- CreateIndex
CREATE INDEX "WarehouseSubCategory_warehouseCategoryId_isEnabled_idx" ON "WarehouseSubCategory"("warehouseCategoryId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSubCategory_warehouseId_warehouseCategoryId_subCat_key" ON "WarehouseSubCategory"("warehouseId", "warehouseCategoryId", "subCategoryId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
