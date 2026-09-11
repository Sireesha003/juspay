import crypto from 'node:crypto'
import { getAuditContext } from './auditContext.js'
import {
  AUDIT_ACTOR_TYPE,
  AUDIT_EVENT_CATEGORY,
  AUDIT_FLAGS,
  AUDIT_ORIGIN,
  AUDIT_SEVERITY,
  AUDIT_SERVICE
} from './auditConstants.js'
import { computeIdempotencyKey } from './auditIdempotency.js'
import { maskSensitiveData } from './auditMasking.js'
import { buildAuditDiff } from './auditDiff.js'
import { enqueueAuditOutbox } from './auditOutboxRepo.js'

function resolveEventId(explicitEventId, context) {
  return (
    explicitEventId ||
    context?.idempotencyKey ||
    context?.requestId ||
    crypto.randomUUID()
  )
}

export async function emitCanonicalEvent({
  eventName,
  entityType,
  entityId,
  action,
  payload = {},
  beforeJson = null,
  afterJson = null,
  severity = AUDIT_SEVERITY.info,
  eventId = null
}) {
  if (!AUDIT_FLAGS.enabled || !AUDIT_FLAGS.canonicalEnabled) return

  const context = getAuditContext() || {}
  const resolvedEventId = resolveEventId(eventId, context)
  const maskedPayload = maskSensitiveData(payload)
  const maskedBefore = maskSensitiveData(beforeJson)
  const maskedAfter = maskSensitiveData(afterJson)
  const diffJson = buildAuditDiff(maskedBefore, maskedAfter)

  const outboxEvent = {
    eventId: resolvedEventId,
    idempotencyKey: computeIdempotencyKey({
      service: AUDIT_SERVICE,
      eventName,
      eventId: resolvedEventId,
      entityType,
      entityId: String(entityId),
      action,
      payload: maskedPayload
    }),
    service: AUDIT_SERVICE,
    eventName,
    eventCategory: AUDIT_EVENT_CATEGORY.business,
    severity,
    origin: context.auditOrigin || AUDIT_ORIGIN.system,
    entityType,
    entityId: String(entityId),
    requestId: context.requestId || null,
    parentEventId: context.parentEventId || null,
    payload: {
      ...maskedPayload,
      action,
      actorType: (maskedPayload?.actorId || context.actorId)
        ? AUDIT_ACTOR_TYPE.user
        : AUDIT_ACTOR_TYPE.system,
      actorId: maskedPayload?.actorId || context.actorId || null,
      actorRole: maskedPayload?.actorRole || context.actorRole || null,
      method: context.method || null,
      route: context.route || null,
      ipAddress: context.ipAddress || null,
      userAgent: context.userAgent || null
    },
    beforeJson: maskedBefore,
    afterJson: maskedAfter,
    diffJson
  }

  await enqueueAuditOutbox(outboxEvent)
}

