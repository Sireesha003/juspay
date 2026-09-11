import logger from '../utils/logger.js'
import { AUDIT_BATCH, AUDIT_FLAGS } from './auditConstants.js'
import { getAuditPrismaClient } from './prismaAccessor.js'

let timer = null
let flushing = false
const LEASE_MS = Number(process.env.AUDIT_OUTBOX_LEASE_MS || 30000)

function backoffMs(retryCount) {
  return Math.min(AUDIT_BATCH.retryBaseMs * Math.pow(2, retryCount), 5 * 60 * 1000)
}

async function flushOnce() {
  if (!AUDIT_FLAGS.enabled || !AUDIT_FLAGS.flushWorkerEnabled || flushing) return
  flushing = true
  try {
    const prisma = getAuditPrismaClient()
    const rows = await prisma.$queryRaw`
      WITH claimable AS (
        SELECT id
        FROM "AuditOutbox"
        WHERE
          (
            ("status" IN ('PENDING', 'FAILED') AND "availableAt" <= now())
            OR
            ("status" = 'PROCESSING' AND ("leaseUntil" IS NULL OR "leaseUntil" < now()))
          )
          AND "retryCount" < ${AUDIT_BATCH.maxRetries}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${AUDIT_BATCH.maxBatchSize}
      )
      UPDATE "AuditOutbox" a
      SET
        "status" = 'PROCESSING',
        "claimedAt" = now(),
        "leaseUntil" = now() + (${LEASE_MS} * interval '1 millisecond')
      FROM claimable
      WHERE a.id = claimable.id
      RETURNING a.*;
    `

    for (const row of rows) {
      try {
        await prisma.$executeRaw`
          INSERT INTO "AuditLog"
          ("id","createdAt","service","env","eventName","eventCategory","severity","requestId","eventId","idempotencyKey","origin","entityType","entityId","payload","beforeJson","afterJson","diffJson","parentEventId")
          VALUES
          (gen_random_uuid(), now(), ${row.service}::"AuditService", ${process.env.NODE_ENV || 'development'}, ${row.eventName}, ${row.eventCategory}::"AuditEventCategory", ${row.severity}::"AuditSeverity", ${row.requestId}, ${row.eventId}, ${row.idempotencyKey}, ${row.origin}::"AuditOrigin", ${row.entityType}, ${row.entityId}, ${row.payload}::jsonb, ${row.beforeJson}::jsonb, ${row.afterJson}::jsonb, ${row.diffJson}::jsonb, ${row.parentEventId})
          ON CONFLICT ("idempotencyKey") DO NOTHING
        `

        await prisma.auditOutbox.update({
          where: { id: row.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            retryCount: row.retryCount + 1,
            claimedAt: null,
            leaseUntil: null
          }
        })
      } catch (error) {
        const nextRetry = row.retryCount + 1
        const exhausted = nextRetry >= AUDIT_BATCH.maxRetries
        await prisma.auditOutbox.update({
          where: { id: row.id },
          data: {
            status: exhausted ? 'DEAD' : 'FAILED',
            retryCount: nextRetry,
            lastError: error.message,
            availableAt: new Date(Date.now() + backoffMs(nextRetry)),
            claimedAt: null,
            leaseUntil: null
          }
        })
        logger.warn('[Audit] Flush row retry scheduled', {
          outboxId: row.id,
          retryCount: nextRetry,
          exhausted
        })
      }
    }
  } catch (error) {
    logger.error('[Audit] Flush worker failed', { message: error.message })
  } finally {
    flushing = false
  }
}

export function startAuditFlushWorker() {
  if (!AUDIT_FLAGS.enabled || !AUDIT_FLAGS.flushWorkerEnabled || timer) return
  timer = setInterval(() => {
    flushOnce().catch(() => {})
  }, AUDIT_BATCH.flushIntervalMs)
}

export function stopAuditFlushWorker() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

export async function flushAuditOutboxNow() {
  if (!AUDIT_FLAGS.enabled || !AUDIT_FLAGS.flushWorkerEnabled) return
  await flushOnce()
}

