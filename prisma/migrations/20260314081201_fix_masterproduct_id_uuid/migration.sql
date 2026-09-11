/*
SAFE MIGRATION
Convert TEXT id → UUID without dropping data
*/

-- 1️⃣ Drop FK from MasterProductVariant first
ALTER TABLE "MasterProductVariant"
DROP CONSTRAINT IF EXISTS "MasterProductVariant_masterProductId_fkey";

-- 2️⃣ Drop FK from join table
ALTER TABLE "_MasterSupplierProducts"
DROP CONSTRAINT IF EXISTS "_MasterSupplierProducts_A_fkey";

-- 3️⃣ Convert MasterProduct.id to UUID
ALTER TABLE "MasterProduct"
ALTER COLUMN "id"
TYPE uuid
USING "id"::uuid;

-- 4️⃣ Convert MasterProductVariant.masterProductId
ALTER TABLE "MasterProductVariant"
ALTER COLUMN "masterProductId"
TYPE uuid
USING "masterProductId"::uuid;

-- 5️⃣ Convert join table column A
ALTER TABLE "_MasterSupplierProducts"
ALTER COLUMN "A"
TYPE uuid
USING "A"::uuid;

-- 6️⃣ Add column to Product
ALTER TABLE "Product"
ADD COLUMN "masterProductId" uuid;

-- 7️⃣ Create index
CREATE INDEX "Product_masterProductId_idx"
ON "Product"("masterProductId");

-- 8️⃣ Recreate FK for Product
ALTER TABLE "Product"
ADD CONSTRAINT "Product_masterProductId_fkey"
FOREIGN KEY ("masterProductId")
REFERENCES "MasterProduct"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- 9️⃣ Recreate FK for MasterProductVariant
ALTER TABLE "MasterProductVariant"
ADD CONSTRAINT "MasterProductVariant_masterProductId_fkey"
FOREIGN KEY ("masterProductId")
REFERENCES "MasterProduct"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- 🔟 Recreate FK for join table
ALTER TABLE "_MasterSupplierProducts"
ADD CONSTRAINT "_MasterSupplierProducts_A_fkey"
FOREIGN KEY ("A")
REFERENCES "MasterProduct"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;