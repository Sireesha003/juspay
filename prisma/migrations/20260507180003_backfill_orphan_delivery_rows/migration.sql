-- Backfill Delivery rows for in-flight Orders that never had one.
--
-- After the enum collapse, many handlers (verifyPickupOtp legacy branch,
-- resendOrderOtpHandler, rejectAssignment, etc.) read `order.delivery?.status`
-- and treat a missing row as "not applicable". For historical Orders that were
-- stuck in OUT_FOR_DELIVERY without a Delivery row this would lock the workflow.
--
-- We create a best-effort Delivery row for every OUT_FOR_DELIVERY order without
-- one, defaulting to status = ASSIGNED (it has an agent) or PENDING (no agent).
-- Safe to re-run because the WHERE NOT EXISTS clause filters out rows that
-- already have a Delivery.

INSERT INTO "Delivery" ("id", "orderId", "agentId", "status", "assignedAt")
SELECT
  gen_random_uuid()::text AS id,
  o.id AS "orderId",
  o."agentId" AS "agentId",
  (CASE WHEN o."agentId" IS NULL THEN 'PENDING' ELSE 'ASSIGNED' END)::"DeliveryStatus" AS status,
  COALESCE(o."assignedAt", NOW()) AS "assignedAt"
FROM "Order" o
WHERE o.status = 'OUT_FOR_DELIVERY'
  AND NOT EXISTS (SELECT 1 FROM "Delivery" d WHERE d."orderId" = o.id);
