-- CreateTable
CREATE TABLE "WarehouseSubCategory" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "warehouseCategoryId" TEXT NOT NULL,
    "subCategoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseSubCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseSubCategory_warehouseId_idx" ON "WarehouseSubCategory"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseSubCategory_warehouseCategoryId_subCategoryId_key" ON "WarehouseSubCategory"("warehouseCategoryId", "subCategoryId");

-- AddForeignKey
ALTER TABLE "WarehouseSubCategory" ADD CONSTRAINT "WarehouseSubCategory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseSubCategory" ADD CONSTRAINT "WarehouseSubCategory_warehouseCategoryId_fkey" FOREIGN KEY ("warehouseCategoryId") REFERENCES "WarehouseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseSubCategory" ADD CONSTRAINT "WarehouseSubCategory_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "SubCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
