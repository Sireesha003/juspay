-- Backend stabilization (part 2/2): Delivery backfill, OrderStatus remap, ledger tables.
-- Requires 20260507180000 applied (enum values visible after commit).

-- ---------------------------------------------------------------------------
-- 3) Canonical Delivery rows from legacy Order.status (before Order enum swap)
-- ---------------------------------------------------------------------------
UPDATE "Delivery" AS d
SET status = v.next_status
FROM (
  SELECT
    d2.id AS delivery_id,
    CASE o.status::text
      WHEN 'ASSIGNED_TO_AGENT' THEN
        CASE WHEN d2.status::text = 'PENDING' THEN 'ASSIGNED'::"DeliveryStatus" ELSE d2.status END
      WHEN 'PICKUP_OTP_PENDING' THEN 'PICKUP_OTP_PENDING'::"DeliveryStatus"
      WHEN 'PICKED_UP' THEN 'PICKED_UP'::"DeliveryStatus"
      WHEN 'IN_TRANSIT' THEN 'IN_TRANSIT'::"DeliveryStatus"
    END AS next_status
  FROM "Delivery" d2
  INNER JOIN "Order" o ON o.id = d2."orderId"
  WHERE o.status::text IN ('ASSIGNED_TO_AGENT', 'PICKUP_OTP_PENDING', 'PICKED_UP', 'IN_TRANSIT')
) AS v
WHERE d.id = v.delivery_id AND v.next_status IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Replace OrderStatus enum (removes legacy delivery-misuse labels)
-- ---------------------------------------------------------------------------
CREATE TYPE "OrderStatus_new" AS ENUM (
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURNED',
  'RETURN_INITIATED'
);

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'ASSIGNED_TO_AGENT' THEN 'OUT_FOR_DELIVERY'
    WHEN 'PICKUP_OTP_PENDING' THEN 'OUT_FOR_DELIVERY'
    WHEN 'PICKED_UP' THEN 'OUT_FOR_DELIVERY'
    WHEN 'IN_TRANSIT' THEN 'OUT_FOR_DELIVERY'
    ELSE "status"::text
  END::"OrderStatus_new"
);

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PLACED'::"OrderStatus_new";

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "fromStatus" TYPE "OrderStatus_new" USING (
  CASE
    WHEN "fromStatus" IS NULL THEN NULL
    WHEN "fromStatus"::text IN ('ASSIGNED_TO_AGENT', 'PICKUP_OTP_PENDING', 'PICKED_UP', 'IN_TRANSIT') THEN 'OUT_FOR_DELIVERY'
    ELSE "fromStatus"::text
  END::"OrderStatus_new"
);

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "toStatus" TYPE "OrderStatus_new" USING (
  CASE "toStatus"::text
    WHEN 'ASSIGNED_TO_AGENT' THEN 'OUT_FOR_DELIVERY'
    WHEN 'PICKUP_OTP_PENDING' THEN 'OUT_FOR_DELIVERY'
    WHEN 'PICKED_UP' THEN 'OUT_FOR_DELIVERY'
    WHEN 'IN_TRANSIT' THEN 'OUT_FOR_DELIVERY'
    ELSE "toStatus"::text
  END::"OrderStatus_new"
);

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

-- ---------------------------------------------------------------------------
-- 5) Refund ledger enum + persistence tables
-- ---------------------------------------------------------------------------
CREATE TYPE "RefundTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "DeliveryStatusHistory" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "fromStatus" "DeliveryStatus",
    "toStatus" "DeliveryStatus" NOT NULL,
    "changedBy" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentStatusHistory" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fromStatus" "PaymentStatus",
    "toStatus" "PaymentStatus" NOT NULL,
    "changedBy" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptType" TEXT NOT NULL,
    "outcome" TEXT,
    "metadata" JSONB,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundTransaction" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "RefundTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayRefundId" TEXT,
    "rawResponse" JSONB,
    "requestedBy" TEXT,
    "expectedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    CONSTRAINT "RefundTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderTrackingEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "eventType" TEXT NOT NULL,
    "fingerprint" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "payload" JSONB,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderTrackingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderReturnHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromPhase" TEXT,
    "toPhase" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderReturnHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "bodyHash" TEXT,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundTransaction_idempotencyKey_key" ON "RefundTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "IdempotencyRecord_key_routeKey_key" ON "IdempotencyRecord"("key", "routeKey");

CREATE INDEX "DeliveryStatusHistory_deliveryId_createdAt_idx" ON "DeliveryStatusHistory"("deliveryId", "createdAt");
CREATE INDEX "DeliveryStatusHistory_toStatus_createdAt_idx" ON "DeliveryStatusHistory"("toStatus", "createdAt");

CREATE INDEX "PaymentStatusHistory_paymentId_createdAt_idx" ON "PaymentStatusHistory"("paymentId", "createdAt");
CREATE INDEX "PaymentStatusHistory_toStatus_createdAt_idx" ON "PaymentStatusHistory"("toStatus", "createdAt");

CREATE INDEX "DeliveryAttempt_deliveryId_createdAt_idx" ON "DeliveryAttempt"("deliveryId", "createdAt");
CREATE INDEX "DeliveryAttempt_orderId_createdAt_idx" ON "DeliveryAttempt"("orderId", "createdAt");
CREATE INDEX "DeliveryAttempt_agentId_idx" ON "DeliveryAttempt"("agentId");

CREATE INDEX "RefundTransaction_paymentId_createdAt_idx" ON "RefundTransaction"("paymentId", "createdAt");
CREATE INDEX "RefundTransaction_orderId_idx" ON "RefundTransaction"("orderId");
CREATE INDEX "RefundTransaction_status_createdAt_idx" ON "RefundTransaction"("status", "createdAt");

CREATE INDEX "OrderTrackingEvent_orderId_createdAt_idx" ON "OrderTrackingEvent"("orderId", "createdAt");
CREATE INDEX "OrderTrackingEvent_deliveryId_createdAt_idx" ON "OrderTrackingEvent"("deliveryId", "createdAt");
CREATE INDEX "OrderTrackingEvent_agentId_idx" ON "OrderTrackingEvent"("agentId");
CREATE INDEX "OrderTrackingEvent_fingerprint_idx" ON "OrderTrackingEvent"("fingerprint");

CREATE INDEX "OrderReturnHistory_orderId_createdAt_idx" ON "OrderReturnHistory"("orderId", "createdAt");

CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

ALTER TABLE "DeliveryStatusHistory" ADD CONSTRAINT "DeliveryStatusHistory_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentStatusHistory" ADD CONSTRAINT "PaymentStatusHistory_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefundTransaction" ADD CONSTRAINT "RefundTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundTransaction" ADD CONSTRAINT "RefundTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderTrackingEvent" ADD CONSTRAINT "OrderTrackingEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderTrackingEvent" ADD CONSTRAINT "OrderTrackingEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderTrackingEvent" ADD CONSTRAINT "OrderTrackingEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderReturnHistory" ADD CONSTRAINT "OrderReturnHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
