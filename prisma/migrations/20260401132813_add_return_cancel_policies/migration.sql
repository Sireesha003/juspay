-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cancellableOrderStatuses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "returnableDays" INTEGER;
