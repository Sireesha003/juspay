import crypto from 'node:crypto'
import { runWithAuditContext } from '../audit/auditContext.js'
import { AUDIT_ORIGIN } from '../audit/auditConstants.js'

function normalizeOrigin(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return Object.values(AUDIT_ORIGIN).includes(normalized)
    ? normalized
    : AUDIT_ORIGIN.publicApi
}

export default function requestContextMiddleware(req, res, next) {
  const requestId = req.header('x-request-id') || crypto.randomUUID()
  const idempotencyKey = req.header('x-idempotency-key') || null
  const auditOrigin = normalizeOrigin(req.header('x-audit-origin'))
  const parentEventId = req.header('x-parent-event-id') || null

  const actorId = req.user?.id || null
  const actorRole = req.user?.role || null

  const context = {
    requestId,
    idempotencyKey,
    auditOrigin,
    parentEventId,
    actorId,
    actorRole,
    method: req.method,
    route: req.originalUrl,
    ipAddress: req.ip,
    userAgent: req.header('user-agent') || null
  }

  res.setHeader('x-request-id', requestId)

  runWithAuditContext(context, () => next())
}

