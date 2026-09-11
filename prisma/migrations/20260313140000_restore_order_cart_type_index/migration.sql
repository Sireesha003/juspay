-- Restore Order_cartType_idx if it was dropped by 20260313064517_auto_migration (before it was changed to a no-op).
-- Safe to run: IF NOT EXISTS prevents error when index already exists.

CREATE INDEX IF NOT EXISTS "Order_cartType_idx" ON "Order"("cartType");
