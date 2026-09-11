-- Rollback Phase 1 (run only if no route-scoped slots are in use, or after clearing them)

-- RouteMapPincode
DROP TABLE IF EXISTS "RouteMapPincode";

-- DeliverySlot partial uniques
DROP INDEX IF EXISTS "DeliverySlot_route_key";
DROP INDEX IF EXISTS "DeliverySlot_legacy_key";

-- Restore original unique
CREATE UNIQUE INDEX IF NOT EXISTS "DeliverySlot_warehouseId_date_slot_key"
  ON "DeliverySlot"("warehouseId", "date", "slot");

-- FK and column
ALTER TABLE "DeliverySlot" DROP CONSTRAINT IF EXISTS "DeliverySlot_routeMapId_fkey";
DROP INDEX IF EXISTS "DeliverySlot_routeMapId_idx";
ALTER TABLE "DeliverySlot" DROP COLUMN IF EXISTS "routeMapId";
