-- Backend stabilization (part 3/3): scope IdempotencyRecord per-actor.
--
-- Without `userId` in the unique key, two clients that happen to send the same
-- x-idempotency-key for the same route would receive each other's cached response
-- (including 403 / 404). Cap the uniqueness window to (key, routeKey, userId).

-- 1) Add column, backfill the (likely empty) existing rows, then enforce NOT NULL.
ALTER TABLE "IdempotencyRecord" ADD COLUMN IF NOT EXISTS "userId" TEXT;
UPDATE "IdempotencyRecord" SET "userId" = 'system' WHERE "userId" IS NULL;
ALTER TABLE "IdempotencyRecord" ALTER COLUMN "userId" SET NOT NULL;

-- 2) Swap the unique constraint.
ALTER TABLE "IdempotencyRecord" DROP CONSTRAINT IF EXISTS "IdempotencyRecord_key_routeKey_key";
DROP INDEX IF EXISTS "IdempotencyRecord_key_routeKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_key_routeKey_userId_key"
  ON "IdempotencyRecord"("key", "routeKey", "userId");
