-- Backend stabilization (part 1/2): extend DeliveryStatus and PaymentStatus only.
-- PostgreSQL rejects using new enum labels in the same transaction that adds them (55P04).
-- Part 2: migration 20260507180001_backend_stabilization_order_delivery_and_tables

-- ---------------------------------------------------------------------------
-- 1) Extend DeliveryStatus (idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN ALTER TYPE "DeliveryStatus" ADD VALUE 'REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "DeliveryStatus" ADD VALUE 'PICKUP_OTP_PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "DeliveryStatus" ADD VALUE 'DELIVERY_OTP_PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "DeliveryStatus" ADD VALUE 'RETURN_IN_TRANSIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "DeliveryStatus" ADD VALUE 'RETURN_COMPLETED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2) Extend PaymentStatus (idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN ALTER TYPE "PaymentStatus" ADD VALUE 'INITIATED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
