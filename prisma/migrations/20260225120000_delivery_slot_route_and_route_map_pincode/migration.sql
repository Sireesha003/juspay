-- Phase 1: DeliverySlot routeMapId + RouteMapPincode
-- Run once (both APIs use same DB). Zero downtime.

-- 1. Add routeMapId to DeliverySlot
ALTER TABLE "DeliverySlot" ADD COLUMN IF NOT EXISTS "routeMapId" TEXT;

-- 2. FK (nullable, SET NULL on RouteMap delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeliverySlot_routeMapId_fkey'
  ) THEN
    ALTER TABLE "DeliverySlot"
      ADD CONSTRAINT "DeliverySlot_routeMapId_fkey"
      FOREIGN KEY ("routeMapId") REFERENCES "RouteMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Index for routeMapId
CREATE INDEX IF NOT EXISTS "DeliverySlot_routeMapId_idx" ON "DeliverySlot"("routeMapId");

-- 4. Drop old unique (allows one row per warehouse+date+slot before routeMapId)
ALTER TABLE "DeliverySlot" DROP CONSTRAINT IF EXISTS "DeliverySlot_warehouseId_date_slot_key";

-- 5. Partial unique: at most one legacy row per (warehouseId, date, slot)
CREATE UNIQUE INDEX IF NOT EXISTS "DeliverySlot_legacy_key"
  ON "DeliverySlot"("warehouseId", "date", "slot") WHERE "routeMapId" IS NULL;

-- 6. Partial unique: one row per (warehouseId, date, slot, routeMapId) when route is set
CREATE UNIQUE INDEX IF NOT EXISTS "DeliverySlot_route_key"
  ON "DeliverySlot"("warehouseId", "date", "slot", "routeMapId") WHERE "routeMapId" IS NOT NULL;

-- 7. RouteMapPincode table (pincode → route mapping)
CREATE TABLE IF NOT EXISTS "RouteMapPincode" (
  "id" TEXT NOT NULL,
  "routeMapId" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RouteMapPincode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RouteMapPincode" DROP CONSTRAINT IF EXISTS "RouteMapPincode_routeMapId_fkey";
ALTER TABLE "RouteMapPincode"
  ADD CONSTRAINT "RouteMapPincode_routeMapId_fkey"
  FOREIGN KEY ("routeMapId") REFERENCES "RouteMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "RouteMapPincode_routeMapId_pincode_key"
  ON "RouteMapPincode"("routeMapId", "pincode");
CREATE INDEX IF NOT EXISTS "RouteMapPincode_pincode_idx" ON "RouteMapPincode"("pincode");
CREATE INDEX IF NOT EXISTS "RouteMapPincode_routeMapId_idx" ON "RouteMapPincode"("routeMapId");
