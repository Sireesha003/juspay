-- DropIndex
DROP INDEX "DeliverySlot_warehouseId_date_slot_key";

-- AlterTable
ALTER TABLE "RouteMapPincode" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "DeliverySlot_warehouseId_date_slot_idx" ON "DeliverySlot"("warehouseId", "date", "slot");
