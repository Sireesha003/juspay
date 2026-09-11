-- AlterTable
ALTER TABLE "ContentManagement" RENAME CONSTRAINT "ContentManagment_pkey" TO "ContentManagement_pkey";

-- RenameIndex
ALTER INDEX "ContentManagment_type_isDeleted_idx" RENAME TO "ContentManagement_type_isDeleted_idx";

-- RenameIndex
ALTER INDEX "ContentManagment_type_isDeleted_key" RENAME TO "ContentManagement_type_isDeleted_key";
