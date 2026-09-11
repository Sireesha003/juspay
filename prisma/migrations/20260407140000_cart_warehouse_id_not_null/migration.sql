-- Cart.warehouseId must be non-null: backfill from line items, drop orphan rows, enforce NOT NULL.

UPDATE "Cart" AS c
SET "warehouseId" = p."warehouseId"
FROM "CartItem" AS ci
INNER JOIN "Product" AS p ON p.id = ci."productId"
WHERE c.id = ci."cartId"
  AND c."warehouseId" IS NULL;

-- Backfill can create duplicates for (userId, warehouseId) when legacy NULL carts existed.
-- Merge duplicate carts into a single keeper cart per (userId, warehouseId).
WITH ranked_carts AS (
  SELECT
    c.id,
    c."userId",
    c."warehouseId",
    ROW_NUMBER() OVER (
      PARTITION BY c."userId", c."warehouseId"
      ORDER BY c."updatedAt" DESC, c.id DESC
    ) AS rn
  FROM "Cart" c
  WHERE c."warehouseId" IS NOT NULL
),
dup_map AS (
  SELECT d.id AS drop_id, k.id AS keep_id
  FROM ranked_carts d
  JOIN ranked_carts k
    ON k."userId" = d."userId"
   AND k."warehouseId" = d."warehouseId"
   AND k.rn = 1
  WHERE d.rn > 1
)
-- 1) Merge overlapping cart lines (same product + variant) by summing quantity.
UPDATE "CartItem" tgt
SET quantity = tgt.quantity + src.quantity
FROM "CartItem" src
JOIN dup_map dm ON dm.drop_id = src."cartId"
WHERE tgt."cartId" = dm.keep_id
  AND tgt."productId" = src."productId"
  AND tgt."productVariantId" IS NOT DISTINCT FROM src."productVariantId";

WITH ranked_carts AS (
  SELECT
    c.id,
    c."userId",
    c."warehouseId",
    ROW_NUMBER() OVER (
      PARTITION BY c."userId", c."warehouseId"
      ORDER BY c."updatedAt" DESC, c.id DESC
    ) AS rn
  FROM "Cart" c
  WHERE c."warehouseId" IS NOT NULL
),
dup_map AS (
  SELECT d.id AS drop_id, k.id AS keep_id
  FROM ranked_carts d
  JOIN ranked_carts k
    ON k."userId" = d."userId"
   AND k."warehouseId" = d."warehouseId"
   AND k.rn = 1
  WHERE d.rn > 1
)
-- 2) Remove source lines that now conflict with merged target lines.
DELETE FROM "CartItem" src
USING "CartItem" tgt, dup_map dm
WHERE src."cartId" = dm.drop_id
  AND tgt."cartId" = dm.keep_id
  AND tgt."productId" = src."productId"
  AND tgt."productVariantId" IS NOT DISTINCT FROM src."productVariantId";

WITH ranked_carts AS (
  SELECT
    c.id,
    c."userId",
    c."warehouseId",
    ROW_NUMBER() OVER (
      PARTITION BY c."userId", c."warehouseId"
      ORDER BY c."updatedAt" DESC, c.id DESC
    ) AS rn
  FROM "Cart" c
  WHERE c."warehouseId" IS NOT NULL
),
dup_map AS (
  SELECT d.id AS drop_id, k.id AS keep_id
  FROM ranked_carts d
  JOIN ranked_carts k
    ON k."userId" = d."userId"
   AND k."warehouseId" = d."warehouseId"
   AND k.rn = 1
  WHERE d.rn > 1
)
-- 3) Move remaining non-conflicting lines to keeper carts.
UPDATE "CartItem" ci
SET "cartId" = dm.keep_id
FROM dup_map dm
WHERE ci."cartId" = dm.drop_id;

WITH ranked_carts AS (
  SELECT
    c.id,
    c."userId",
    c."warehouseId",
    ROW_NUMBER() OVER (
      PARTITION BY c."userId", c."warehouseId"
      ORDER BY c."updatedAt" DESC, c.id DESC
    ) AS rn
  FROM "Cart" c
  WHERE c."warehouseId" IS NOT NULL
),
dup_map AS (
  SELECT d.id AS drop_id, k.id AS keep_id
  FROM ranked_carts d
  JOIN ranked_carts k
    ON k."userId" = d."userId"
   AND k."warehouseId" = d."warehouseId"
   AND k.rn = 1
  WHERE d.rn > 1
)
-- 4) Delete duplicate cart rows after their items are merged/moved.
DELETE FROM "Cart" c
USING dup_map dm
WHERE c.id = dm.drop_id;

DELETE FROM "Cart" WHERE "warehouseId" IS NULL;

ALTER TABLE "Cart" ALTER COLUMN "warehouseId" SET NOT NULL;
