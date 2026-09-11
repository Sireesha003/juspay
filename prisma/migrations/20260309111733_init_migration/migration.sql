/*
  Warnings:

  - You are about to drop the column `categoryId` on the `WarehouseBusiness` table. All the data in the column will be lost.
  - You are about to drop the column `drugLicenseNumber` on the `WarehouseBusiness` table. All the data in the column will be lost.
  - You are about to drop the column `fssaiNumber` on the `WarehouseBusiness` table. All the data in the column will be lost.
  - You are about to drop the column `gstNumber` on the `WarehouseBusiness` table. All the data in the column will be lost.
  - You are about to drop the column `subCategoryId` on the `WarehouseBusiness` table. All the data in the column will be lost.
  - You are about to drop the column `udyamRegistrationNumber` on the `WarehouseBusiness` table. All the data in the column will be lost.
  - You are about to drop the column `hasDrugLicense` on the `WarehouseBusinessDocument` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."WarehouseBusiness" DROP CONSTRAINT "WarehouseBusiness_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WarehouseBusiness" DROP CONSTRAINT "WarehouseBusiness_subCategoryId_fkey";

-- DropIndex
DROP INDEX "public"."WarehouseBusiness_categoryId_idx";

-- DropIndex
DROP INDEX "public"."WarehouseBusiness_subCategoryId_idx";

-- AlterTable
ALTER TABLE "public"."WarehouseBusiness" DROP COLUMN "categoryId",
DROP COLUMN "drugLicenseNumber",
DROP COLUMN "fssaiNumber",
DROP COLUMN "gstNumber",
DROP COLUMN "subCategoryId",
DROP COLUMN "udyamRegistrationNumber";

-- AlterTable
ALTER TABLE "public"."WarehouseBusinessDocument" DROP COLUMN "hasDrugLicense",
ADD COLUMN     "fssaiNumber" VARCHAR(20),
ADD COLUMN     "gstNumber" VARCHAR(20),
ADD COLUMN     "panNumber" VARCHAR(20),
ADD COLUMN     "udyamRegistrationNumber" VARCHAR(50);

-- AlterTable
ALTER TABLE "public"."WarehouseLocation" ADD COLUMN     "radius" TEXT;
