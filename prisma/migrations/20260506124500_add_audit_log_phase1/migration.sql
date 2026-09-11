-- Phase 1 audit logging foundation

CREATE TYPE "AuditService" AS ENUM ('CONSUMER', 'DELIVERY', 'PARTNER', 'ADMIN');
CREATE TYPE "AuditEventCategory" AS ENUM ('BUSINESS', 'PROJECTION', 'TRANSPORT');
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');
CREATE TYPE "AuditOrigin" AS ENUM ('PUBLIC_API', 'INTERNAL_SYNC', 'WEBHOOK', 'CRON', 'WORKER', 'SYSTEM');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD');

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "service" "AuditService" NOT NULL,
  "env" VARCHAR(32) NOT NULL,
  "eventName" VARCHAR(128) NOT NULL,
  "eventCategory" "AuditEventCategory" NOT NULL,
  "severity" "AuditSeverity" NOT NULL,
  "requestId" VARCHAR(128),
  "eventId" VARCHAR(128) NOT NULL,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "parentEventId" VARCHAR(128),
  "origin" "AuditOrigin" NOT NULL,
  "entityType" VARCHAR(64) NOT NULL,
  "entityId" VARCHAR(64) NOT NULL,
  "payload" JSONB,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "diffJson" JSONB,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditOutbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "processedAt" TIMESTAMPTZ(6),
  "claimedAt" TIMESTAMPTZ(6),
  "leaseUntil" TIMESTAMPTZ(6),
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 12,
  "lastError" TEXT,
  "eventId" VARCHAR(128) NOT NULL,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "service" "AuditService" NOT NULL,
  "eventName" VARCHAR(128) NOT NULL,
  "eventCategory" "AuditEventCategory" NOT NULL,
  "severity" "AuditSeverity" NOT NULL,
  "origin" "AuditOrigin" NOT NULL,
  "entityType" VARCHAR(64) NOT NULL,
  "entityId" VARCHAR(64) NOT NULL,
  "requestId" VARCHAR(128),
  "parentEventId" VARCHAR(128),
  "payload" JSONB,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "diffJson" JSONB,
  CONSTRAINT "AuditOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_auditlog_idempotency_key" ON "AuditLog" ("idempotencyKey");
CREATE UNIQUE INDEX "uq_auditoutbox_idempotency_key" ON "AuditOutbox" ("idempotencyKey");

CREATE INDEX "idx_auditlog_created_at" ON "AuditLog" ("createdAt");
CREATE INDEX "idx_auditlog_service_created" ON "AuditLog" ("service", "createdAt");
CREATE INDEX "idx_auditlog_event_created" ON "AuditLog" ("eventName", "createdAt");
CREATE INDEX "idx_auditlog_entity_created" ON "AuditLog" ("entityType", "entityId", "createdAt");
CREATE INDEX "idx_auditlog_request_id" ON "AuditLog" ("requestId");
CREATE INDEX "idx_auditlog_event_id" ON "AuditLog" ("eventId");

CREATE INDEX "idx_auditoutbox_status_available" ON "AuditOutbox" ("status", "availableAt");
CREATE INDEX "idx_auditoutbox_service_status_available" ON "AuditOutbox" ("service", "status", "availableAt");
CREATE INDEX "idx_auditoutbox_created" ON "AuditOutbox" ("createdAt");
CREATE INDEX "idx_auditoutbox_event_id" ON "AuditOutbox" ("eventId");
CREATE INDEX "idx_auditoutbox_status_lease" ON "AuditOutbox" ("status", "leaseUntil");

