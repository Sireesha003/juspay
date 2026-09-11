-- CreateEnum
CREATE TYPE "public"."CategoryType" AS ENUM ('REGULAR', 'SPECIAL');

-- CreateEnum
CREATE TYPE "public"."SubCategoryType" AS ENUM ('REGULAR', 'SPECIAL');

-- AlterEnum
ALTER TYPE "public"."DeliveryType" ADD VALUE 'PICKUP_AT_VEHICLE';

-- DropIndex
DROP INDEX "public"."Tax_title_key";

-- AlterTable
ALTER TABLE "public"."Category" ADD COLUMN     "categoryType" "public"."CategoryType"[] DEFAULT ARRAY['REGULAR']::"public"."CategoryType"[];

-- AlterTable
ALTER TABLE "public"."SubCategory" ADD COLUMN     "subCategoryType" "public"."SubCategoryType"[] DEFAULT ARRAY['REGULAR']::"public"."SubCategoryType"[];
