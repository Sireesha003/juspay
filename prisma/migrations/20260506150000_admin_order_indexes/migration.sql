-- CreateIndex
CREATE INDEX "Order_deliveryType_status_createdAt_idx" ON "Order"("deliveryType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_warehouseId_createdAt_idx" ON "Order"("warehouseId", "createdAt");
