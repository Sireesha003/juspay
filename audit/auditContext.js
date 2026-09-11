import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

export function runWithAuditContext(context, callback) {
  return storage.run(context, callback)
}

export function getAuditContext() {
  return storage.getStore() || null
}

export function getAuditValue(key, fallback = null) {
  const store = storage.getStore()
  return store?.[key] ?? fallback
}

export function patchAuditContext(values = {}) {
  const store = storage.getStore()
  if (!store || typeof store !== 'object') return
  Object.assign(store, values)
}

