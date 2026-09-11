/*
  Warnings:

  - A unique constraint covering the columns `[warehouseId,name,bannerId,couponId]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Campaign_warehouseId_bannerId_couponId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_warehouseId_name_bannerId_couponId_key" ON "Campaign"("warehouseId", "name", "bannerId", "couponId");
