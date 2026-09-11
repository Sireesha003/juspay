/*
  Warnings:

  - The primary key for the `Unit` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `parent` on the `Unit` table. All the data in the column will be lost.
  - Added the required column `unitTypeId` to the `Unit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."unitTypeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "public"."Unit" DROP CONSTRAINT "Unit_pkey",
DROP COLUMN "parent",
ADD COLUMN     "unitTypeId" TEXT NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "shortCode" SET DATA TYPE TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "Unit_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "public"."MasterProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "shortDescription" TEXT,
    "images" TEXT[],
    "tags" TEXT[],
    "brandId" UUID,
    "categoryId" UUID NOT NULL,
    "subCategoryId" UUID,
    "productType" TEXT,
    "inventoryType" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "mrp" DOUBLE PRECISION,
    "discountType" TEXT,
    "discountValue" DOUBLE PRECISION,
    "finalPrice" DOUBLE PRECISION,
    "costPrice" DOUBLE PRECISION,
    "taxRate" DOUBLE PRECISION DEFAULT 0,
    "unitType" TEXT,
    "unit" TEXT NOT NULL,
    "measurement" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "threshold" INTEGER NOT NULL DEFAULT 5,
    "minOrderQty" INTEGER,
    "maxOrderQty" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."ProductStatus" NOT NULL DEFAULT 'PENDING',
    "variantName" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "variantStatus" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metaTitle" TEXT,
    "metaKeywords" TEXT,
    "metaDescription" TEXT,
    "schemaMarkup" TEXT,
    "manufacturer" TEXT,
    "madeIn" TEXT,
    "fssaiLicNo" TEXT,
    "isReturnable" BOOLEAN NOT NULL DEFAULT false,
    "isCancelable" BOOLEAN NOT NULL DEFAULT false,
    "isCodAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MasterProductVariant" (
    "id" TEXT NOT NULL,
    "masterProductId" TEXT NOT NULL,
    "sku" TEXT,
    "gtin" TEXT,
    "barcodeImage" TEXT,
    "variantName" TEXT NOT NULL,
    "unit" TEXT,
    "unitType" TEXT NOT NULL,
    "measurement" TEXT,
    "primaryImages" TEXT[],
    "secondaryImages" TEXT[],
    "metaTitle" TEXT,
    "metaKeywords" TEXT,
    "metaDescription" TEXT,
    "schemaMarkup" TEXT,
    "status" "public"."VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mrp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellingPrice" DOUBLE PRECISION,
    "landingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountType" TEXT,
    "discountValue" DOUBLE PRECISION,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER DEFAULT 5,
    "minOrderQty" INTEGER DEFAULT 1,
    "maxOrderQty" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UnitType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."unitTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_MasterSupplierProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MasterSupplierProducts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterProduct_slug_key" ON "public"."MasterProduct"("slug");

-- CreateIndex
CREATE INDEX "MasterProduct_name_idx" ON "public"."MasterProduct"("name");

-- CreateIndex
CREATE INDEX "MasterProduct_categoryId_isActive_idx" ON "public"."MasterProduct"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "MasterProduct_brandId_isActive_idx" ON "public"."MasterProduct"("brandId", "isActive");

-- CreateIndex
CREATE INDEX "MasterProduct_sku_idx" ON "public"."MasterProduct"("sku");

-- CreateIndex
CREATE INDEX "MasterProduct_barcode_idx" ON "public"."MasterProduct"("barcode");

-- CreateIndex
CREATE INDEX "MasterProduct_status_isActive_idx" ON "public"."MasterProduct"("status", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MasterProductVariant_sku_key" ON "public"."MasterProductVariant"("sku");

-- CreateIndex
CREATE INDEX "MasterProductVariant_masterProductId_idx" ON "public"."MasterProductVariant"("masterProductId");

-- CreateIndex
CREATE INDEX "MasterProductVariant_sku_idx" ON "public"."MasterProductVariant"("sku");

-- CreateIndex
CREATE INDEX "MasterProductVariant_status_idx" ON "public"."MasterProductVariant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UnitType_name_key" ON "public"."UnitType"("name");

-- CreateIndex
CREATE INDEX "UnitType_status_displayOrder_idx" ON "public"."UnitType"("status", "displayOrder");

-- CreateIndex
CREATE INDEX "_MasterSupplierProducts_B_index" ON "public"."_MasterSupplierProducts"("B");

-- CreateIndex
CREATE INDEX "Unit_unitTypeId_idx" ON "public"."Unit"("unitTypeId");

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "public"."UnitType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MasterProduct" ADD CONSTRAINT "MasterProduct_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MasterProduct" ADD CONSTRAINT "MasterProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MasterProduct" ADD CONSTRAINT "MasterProduct_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "public"."SubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MasterProductVariant" ADD CONSTRAINT "MasterProductVariant_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "public"."MasterProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_MasterSupplierProducts" ADD CONSTRAINT "_MasterSupplierProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."MasterProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_MasterSupplierProducts" ADD CONSTRAINT "_MasterSupplierProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
