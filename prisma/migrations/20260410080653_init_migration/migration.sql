-- AlterTable
ALTER TABLE "public"."Brand" ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "subCategoryId" UUID;

-- CreateIndex
CREATE INDEX "Brand_categoryId_idx" ON "public"."Brand"("categoryId");

-- CreateIndex
CREATE INDEX "Brand_subCategoryId_idx" ON "public"."Brand"("subCategoryId");
