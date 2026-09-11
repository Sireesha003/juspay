/*
  Warnings:

  - The `isOperating` column on the `WarehouseBusiness` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."WarehouseBusiness" DROP COLUMN "isOperating",
ADD COLUMN     "isOperating" TEXT[] DEFAULT ARRAY[]::TEXT[];
