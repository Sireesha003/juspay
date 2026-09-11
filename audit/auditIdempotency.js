import crypto from 'node:crypto'

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const keys = Object.keys(value).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`
}

export function hashPayload(value) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
}

export function computeIdempotencyKey({
  service,
  eventName,
  eventId,
  entityType,
  entityId,
  action,
  payload
}) {
  const normalized = [
    service || '',
    eventName || '',
    eventId || '',
    entityType || '',
    entityId || '',
    action || '',
    hashPayload(payload || {})
  ].join('|')

  return crypto.createHash('sha256').update(normalized).digest('hex')
}

