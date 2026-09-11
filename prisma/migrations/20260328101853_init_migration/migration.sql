/*
  Warnings:

  - You are about to drop the column `radius` on the `WarehouseLocation` table. All the data in the column will be lost.
  - Added the required column `geoJson` to the `Pincode` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Pincode" ADD COLUMN     "geoJson" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "public"."WarehouseLocation" DROP COLUMN "radius",
ADD COLUMN     "area" TEXT,
ADD COLUMN     "geoPolygon" JSONB;

-- CreateTable
CREATE TABLE "public"."WarehousePincodeCoverage" (
    "id" TEXT NOT NULL,
    "warehouseLocationId" UUID NOT NULL,
    "pincode" TEXT NOT NULL,
    "coveragePercentage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehousePincodeCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehousePincodeCoverage_warehouseLocationId_idx" ON "public"."WarehousePincodeCoverage"("warehouseLocationId");

-- CreateIndex
CREATE INDEX "WarehousePincodeCoverage_pincode_idx" ON "public"."WarehousePincodeCoverage"("pincode");

-- AddForeignKey
ALTER TABLE "public"."WarehousePincodeCoverage" ADD CONSTRAINT "WarehousePincodeCoverage_warehouseLocationId_fkey" FOREIGN KEY ("warehouseLocationId") REFERENCES "public"."WarehouseLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
