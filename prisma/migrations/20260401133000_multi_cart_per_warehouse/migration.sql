-- Enable multi-cart per user by warehouse
ALTER TABLE "Cart"
ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Cart_userId_key'
  ) THEN
    ALTER TABLE "Cart" DROP CONSTRAINT "Cart_userId_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Cart_userId_warehouseId_key'
  ) THEN
    ALTER TABLE "Cart"
    ADD CONSTRAINT "Cart_userId_warehouseId_key" UNIQUE ("userId", "warehouseId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Cart_warehouseId_fkey'
  ) THEN
    ALTER TABLE "Cart"
    ADD CONSTRAINT "Cart_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Cart_warehouseId_idx" ON "Cart"("warehouseId");
