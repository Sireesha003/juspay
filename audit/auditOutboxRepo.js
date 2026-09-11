import logger from '../utils/logger.js'
import { Prisma } from '@prisma/client'
import { AUDIT_FLAGS } from './auditConstants.js'
import { getAuditPrismaClient } from './prismaAccessor.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const FALLBACK_DIR = path.resolve(process.cwd(), '.audit-fallback')
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'audit-outbox-fallback.jsonl')
const FALLBACK_RETENTION_DAYS = Number(process.env.AUDIT_FALLBACK_RETENTION_DAYS || 14)

function emitAuditMetric(name, value = 1, tags = {}) {
  logger.info('[AuditMetric]', { metric: name, value, ...tags })
}

async function writeFallback(event) {
  await fs.mkdir(FALLBACK_DIR, { recursive: true })
  const record = {
    createdAt: new Date().toISOString(),
    event
  }
  await fs.appendFile(FALLBACK_FILE, `${JSON.stringify(record)}\n`, 'utf8')
}

function isStaleFallbackRecord(record) {
  if (!record?.createdAt) return true
  const ageMs = Date.now() - new Date(record.createdAt).getTime()
  return ageMs > FALLBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000
}

export async function enqueueAuditOutbox(event) {
  if (!AUDIT_FLAGS.enabled || !AUDIT_FLAGS.outboxEnabled) return

  try {
    const prisma = getAuditPrismaClient()
    await prisma.auditOutbox.create({
      data: {
        eventId: event.eventId,
        idempotencyKey: event.idempotencyKey,
        service: event.service,
        eventName: event.eventName,
        eventCategory: event.eventCategory,
        severity: event.severity,
        origin: event.origin,
        entityType: event.entityType,
        entityId: event.entityId,
        requestId: event.requestId,
        parentEventId: event.parentEventId,
        payload: event.payload,
        beforeJson: event.beforeJson,
        afterJson: event.afterJson,
        diffJson: event.diffJson
      }
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      emitAuditMetric('audit.outbox.duplicate_suppressed', 1, {
        eventName: event.eventName
      })
      return
    }
    logger.error('[Audit] Failed to enqueue outbox event', {
      message: error.message,
      eventName: event.eventName,
      idempotencyKey: event.idempotencyKey,
      criticalAlert: true
    })
    emitAuditMetric('audit_outbox_insert_failed_total', 1, {
      eventName: event.eventName,
      severity: 'critical'
    })

    try {
      await writeFallback(event)
      emitAuditMetric('audit_outbox_fallback_success_total', 1, {
        eventName: event.eventName
      })
      logger.error('[Audit] Outbox fallback persistence succeeded', {
        eventName: event.eventName,
        idempotencyKey: event.idempotencyKey,
        fallbackFile: FALLBACK_FILE,
        criticalAlert: true
      })
    } catch (fallbackError) {
      emitAuditMetric('audit_outbox_fallback_failed_total', 1, {
        eventName: event.eventName
      })
      logger.error('[Audit] Outbox fallback persistence failed', {
        eventName: event.eventName,
        idempotencyKey: event.idempotencyKey,
        fallbackError: fallbackError.message,
        criticalAlert: true
      })
    }
  }
}

export async function replayAuditOutboxFallback({ limit = 500 } = {}) {
  let raw = ''
  try {
    raw = await fs.readFile(FALLBACK_FILE, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { replayed: 0, remaining: 0 }
    }
    throw error
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return { replayed: 0, remaining: 0 }

  const prisma = getAuditPrismaClient()
  const toProcess = lines.slice(0, limit)
  const tail = lines.slice(limit)
  const remainingRecords = []
  let replayed = 0

  for (const line of toProcess) {
    try {
      const parsed = JSON.parse(line)
      if (!parsed?.event || isStaleFallbackRecord(parsed)) {
        continue
      }

      await prisma.auditOutbox.create({ data: parsed.event })
      replayed += 1
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        continue
      }
      remainingRecords.push(line)
    }
  }

  const allRemaining = [...remainingRecords, ...tail]
  const content = allRemaining.length ? `${allRemaining.join('\n')}\n` : ''
  await fs.writeFile(FALLBACK_FILE, content, 'utf8')

  logger.info('[Audit] Fallback replay completed', {
    replayed,
    remaining: allRemaining.length,
    fallbackFile: FALLBACK_FILE
  })

  return { replayed, remaining: allRemaining.length }
}

