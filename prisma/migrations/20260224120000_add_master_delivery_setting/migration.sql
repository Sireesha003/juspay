-- CreateTable (idempotent) - uses existing DeliveryType enum (FAST, SCHEDULED, PICKUP_STORE)
CREATE TABLE IF NOT EXISTS "MasterDeliverySetting" (
    "id" TEXT NOT NULL,
    "type" "DeliveryType" NOT NULL,
    "label" TEXT NOT NULL,
    "isEnabledByDefault" BOOLEAN NOT NULL DEFAULT true,
    "defaultCharge" DECIMAL(10,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterDeliverySetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "MasterDeliverySetting_type_key" ON "MasterDeliverySetting"("type");
CREATE INDEX IF NOT EXISTS "MasterDeliverySetting_type_idx" ON "MasterDeliverySetting"("type");

-- Insert default rows (idempotent: skip if any row exists)
-- FAST = Express, SCHEDULED = Scheduled Delivery, PICKUP_STORE = Self Pickup
INSERT INTO "MasterDeliverySetting" ("id", "type", "label", "isEnabledByDefault", "defaultCharge", "displayOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'FAST', 'Express Settings', true, 60, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "MasterDeliverySetting" WHERE "type" = 'FAST');

INSERT INTO "MasterDeliverySetting" ("id", "type", "label", "isEnabledByDefault", "defaultCharge", "displayOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'SCHEDULED', 'Scheduled Delivery', true, 30, 2, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "MasterDeliverySetting" WHERE "type" = 'SCHEDULED');

INSERT INTO "MasterDeliverySetting" ("id", "type", "label", "isEnabledByDefault", "defaultCharge", "displayOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'PICKUP_STORE', 'Self Pickup', false, 0, 3, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "MasterDeliverySetting" WHERE "type" = 'PICKUP_STORE');
