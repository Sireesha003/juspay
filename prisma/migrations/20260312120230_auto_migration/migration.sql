/*
  Warnings:

  - A unique constraint covering the columns `[warehouseId,date,slot,routeMapId]` on the table `DeliverySlot` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pickupSlotId" TEXT,
ADD COLUMN     "routeMapId" TEXT,
ADD COLUMN     "scheduledSlotId" TEXT;

-- AlterTable
ALTER TABLE "WarehouseDeliverySetting" ADD COLUMN     "expressDeliveryCharge" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "PickupSlot" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "repeat" BOOLEAN NOT NULL DEFAULT false,
    "repeatType" TEXT,
    "customDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "booked" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseDeliveryBlackout" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseDeliveryBlackout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickupSlot_warehouseId_date_idx" ON "PickupSlot"("warehouseId", "date");

-- CreateIndex
CREATE INDEX "PickupSlot_warehouseId_date_isActive_idx" ON "PickupSlot"("warehouseId", "date", "isActive");

-- CreateIndex
CREATE INDEX "PickupSlot_isActive_date_idx" ON "PickupSlot"("isActive", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PickupSlot_warehouseId_date_startTime_endTime_key" ON "PickupSlot"("warehouseId", "date", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "WarehouseDeliveryBlackout_warehouseId_date_idx" ON "WarehouseDeliveryBlackout"("warehouseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseDeliveryBlackout_warehouseId_date_key" ON "WarehouseDeliveryBlackout"("warehouseId", "date");

-- CreateIndex
CREATE INDEX "DeliverySlot_warehouseId_date_isActive_idx" ON "DeliverySlot"("warehouseId", "date", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverySlot_warehouseId_date_slot_routeMapId_key" ON "DeliverySlot"("warehouseId", "date", "slot", "routeMapId");

-- CreateIndex
CREATE INDEX "Order_deliverySlotId_idx" ON "Order"("deliverySlotId");

-- CreateIndex
CREATE INDEX "Order_warehouseId_deliveryDate_deliverySlot_idx" ON "Order"("warehouseId", "deliveryDate", "deliverySlot");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_routeMapId_fkey" FOREIGN KEY ("routeMapId") REFERENCES "RouteMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_scheduledSlotId_fkey" FOREIGN KEY ("scheduledSlotId") REFERENCES "ScheduledDeliverySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupSlotId_fkey" FOREIGN KEY ("pickupSlotId") REFERENCES "PickupSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseDeliveryBlackout" ADD CONSTRAINT "WarehouseDeliveryBlackout_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
