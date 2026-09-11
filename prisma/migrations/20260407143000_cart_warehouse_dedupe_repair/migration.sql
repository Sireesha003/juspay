-- Repair duplicate/null cart rows without requiring schema reset.

-- 1) Backfill null cart warehouseId from cart line products.
UPDATE "Cart" c
SET "warehouseId" = src."warehouseId"
FROM (
  SELECT ci."cartId", MIN(p."warehouseId") AS "warehouseId"
  FROM "CartItem" ci
  JOIN "Product" p ON p.id = ci."productId"
  GROUP BY ci."cartId"
) src
WHERE c.id = src."cartId"
  AND c."warehouseId" IS NULL;

-- 2) Merge null-origin carts into existing keeper carts when user+warehouse already exists.
WITH keeper_map AS (
  SELECT
    c_null.id AS drop_id,
    c_keep.id AS keep_id
  FROM "Cart" c_null
  JOIN "Cart" c_keep
    ON c_keep."userId" = c_null."userId"
   AND c_keep."warehouseId" = c_null."warehouseId"
   AND c_keep.id <> c_null.id
  WHERE c_null."warehouseId" IS NOT NULL
),
overlap AS (
  SELECT
    s.id AS src_item_id,
    t.id AS tgt_item_id,
    s.quantity AS src_qty
  FROM keeper_map km
  JOIN "CartItem" s ON s."cartId" = km.drop_id
  JOIN "CartItem" t
    ON t."cartId" = km.keep_id
   AND t."productId" = s."productId"
   AND t."productVariantId" IS NOT DISTINCT FROM s."productVariantId"
)
UPDATE "CartItem" t
SET quantity = t.quantity + o.src_qty
FROM overlap o
WHERE t.id = o.tgt_item_id;

WITH keeper_map AS (
  SELECT
    c_null.id AS drop_id,
    c_keep.id AS keep_id
  FROM "Cart" c_null
  JOIN "Cart" c_keep
    ON c_keep."userId" = c_null."userId"
   AND c_keep."warehouseId" = c_null."warehouseId"
   AND c_keep.id <> c_null.id
  WHERE c_null."warehouseId" IS NOT NULL
)
DELETE FROM "CartItem" s
USING "CartItem" t, keeper_map km
WHERE s."cartId" = km.drop_id
  AND t."cartId" = km.keep_id
  AND t."productId" = s."productId"
  AND t."productVariantId" IS NOT DISTINCT FROM s."productVariantId";

WITH keeper_map AS (
  SELECT
    c_null.id AS drop_id,
    c_keep.id AS keep_id
  FROM "Cart" c_null
  JOIN "Cart" c_keep
    ON c_keep."userId" = c_null."userId"
   AND c_keep."warehouseId" = c_null."warehouseId"
   AND c_keep.id <> c_null.id
  WHERE c_null."warehouseId" IS NOT NULL
)
UPDATE "CartItem" s
SET "cartId" = km.keep_id
FROM keeper_map km
WHERE s."cartId" = km.drop_id;

WITH keeper_map AS (
  SELECT
    c_null.id AS drop_id,
    c_keep.id AS keep_id
  FROM "Cart" c_null
  JOIN "Cart" c_keep
    ON c_keep."userId" = c_null."userId"
   AND c_keep."warehouseId" = c_null."warehouseId"
   AND c_keep.id <> c_null.id
  WHERE c_null."warehouseId" IS NOT NULL
)
DELETE FROM "Cart" c
USING keeper_map km
WHERE c.id = km.drop_id;

-- 3) Remove carts still unresolved/null.
DELETE FROM "Cart" WHERE "warehouseId" IS NULL;

-- 4) Enforce NOT NULL if still nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Cart'
      AND column_name = 'warehouseId'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "Cart" ALTER COLUMN "warehouseId" SET NOT NULL;
  END IF;
END $$;
