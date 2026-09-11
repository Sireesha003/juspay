const IGNORE_KEYS = new Set(['updatedAt', 'lastHeartbeatAt', 'lastLocationUpdate'])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function buildAuditDiff(beforeValue, afterValue) {
  if (!isObject(beforeValue) || !isObject(afterValue)) {
    return null
  }

  const keys = new Set([
    ...Object.keys(beforeValue || {}),
    ...Object.keys(afterValue || {})
  ])
  const diff = {}

  for (const key of keys) {
    if (IGNORE_KEYS.has(key)) continue

    const before = beforeValue?.[key]
    const after = afterValue?.[key]
    if (JSON.stringify(before) === JSON.stringify(after)) continue

    diff[key] = { before, after }
  }

  return Object.keys(diff).length ? diff : null
}

