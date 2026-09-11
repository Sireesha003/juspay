-- Safe, idempotent one-off DB repair for Cart warehouse integrity.
-- Use only when migration history and DB state have drifted.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Cart_userId_warehouseId_key'
  ) THEN
    ALTER TABLE "Cart" DROP CONSTRAINT "Cart_userId_warehouseId_key";
  END IF;
END $$;

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

WITH ranked AS (
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
  FROM ranked d
  JOIN ranked k
    ON k."userId" = d."userId"
   AND k."warehouseId" = d."warehouseId"
   AND k.rn = 1
  WHERE d.rn > 1
),
overlap AS (
  SELECT s.id AS src_item_id, t.id AS tgt_item_id, s.quantity AS src_qty
  FROM dup_map dm
  JOIN "CartItem" s ON s."cartId" = dm.drop_id
  JOIN "CartItem" t
    ON t."cartId" = dm.keep_id
   AND t."productId" = s."productId"
   AND t."productVariantId" IS NOT DISTINCT FROM s."productVariantId"
)
UPDATE "CartItem" t
SET quantity = t.quantity + overlap.src_qty
FROM overlap
WHERE t.id = overlap.tgt_item_id;

WITH ranked AS (
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
  FROM ranked d
  JOIN ranked k
    ON k."userId" = d."userId"
   AND k."warehouseId" = d."warehouseId"
   AND k.rn = 1
  WHERE d.rn > 1
)
DELETE FROM "CartItem" s
USING "CartItem" t, dup_map dm
WHERE s."cartId" = dm.drop_id
  AND t."cartId" = dm.keep_id
  AND t."productId" = s."productId"
  AND t."productVariantId" IS NOT DISTINCT FROM s."productVariantId";

WITH ranked AS (
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
  FROM ranked d
  JOIN ranked k
    ON k."userId" = d."userId"
   AND k."warehouseId" = d."warehouseId"
   AND k.rn = 1
  WHERE d.rn > 1
)
UPDATE "CartItem" s
SET "cartId" = dm.keep_id
FROM dup_map dm
WHERE s."cartId" = dm.drop_id;

WITH ranked AS (
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
  SELECT d.id AS drop_id
  FROM ranked d
  WHERE d.rn > 1
)
DELETE FROM "Cart" c
USING dup_map dm
WHERE c.id = dm.drop_id;

DELETE FROM "Cart" WHERE "warehouseId" IS NULL;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Cart_userId_warehouseId_key'
  ) THEN
    ALTER TABLE "Cart"
      ADD CONSTRAINT "Cart_userId_warehouseId_key" UNIQUE ("userId", "warehouseId");
  END IF;
END $$;
