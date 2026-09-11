-- Add CartType enum and Order.cartType for Partner Order Management filter (Single vs Group cart).
-- Group/Shared Cart is planned for Consumer App; partner panel filter is ready.

CREATE TYPE "CartType" AS ENUM ('SINGLE', 'GROUP');

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cartType" "CartType" NOT NULL DEFAULT 'SINGLE';

CREATE INDEX IF NOT EXISTS "Order_cartType_idx" ON "Order"("cartType");
