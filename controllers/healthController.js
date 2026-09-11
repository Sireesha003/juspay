import { getOrderNotificationQueueHealth } from '../queues/orderNotificationQueue.js'
import { isSocketInitialized } from '../config/socket.js'
import { snapshotCounters } from '../services/metrics/realtimeMetrics.js'
import config from '../config/config.js'
import { admin, firebaseInitialized } from '../config/firebase.js'

function firebasePingSync() {
  try {
    const ok = Boolean(firebaseInitialized && admin?.apps?.length > 0)
    return { ok, apps: admin?.apps?.length || 0 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function healthAggregate(_req, res) {
  const queue = await getOrderNotificationQueueHealth()
  const fb = firebasePingSync()
  const socketOk = isSocketInitialized()
  const queueOk = Boolean(queue.skipped || queue.ok)
  const ok = socketOk && queueOk
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    service: config.app.name,
    timestamp: new Date().toISOString(),
    checks: { socket: { ok: socketOk }, notificationDispatch: queue, firebase: fb },
    metrics: snapshotCounters()
  })
}

export async function healthSocket(_req, res) {
  const ok = isSocketInitialized()
  res.status(ok ? 200 : 503).json({ ok })
}

export async function healthFirebase(_req, res) {
  const fb = firebasePingSync()
  res.status(fb.ok ? 200 : 503).json(fb)
}
