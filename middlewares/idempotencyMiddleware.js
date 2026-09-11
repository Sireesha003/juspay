import { createHash, randomUUID } from 'crypto'
import { prisma } from '../config/prismaClient.js'

/**
 * Durable idempotency, scoped per actor.
 *
 * Consumer-api uses this on **service-to-service** routes (internal sync from
 * delivery-api, Razorpay webhook), where there is no `req.user`. Falls back to
 * a route-bound service identity (`service:<routeKey>`) so the shared
 * `IdempotencyRecord` table's NOT NULL `userId` column is always populated and
 * different routes never collide on the same idempotency key. If a future route
 * is user-authenticated, scoping automatically tightens to `req.user.id`.
 *
 * Only successful (2xx) responses are cached. 4xx / 5xx are passed through so
 * a transient failure can be retried without being permanently locked out.
 */
export function idempotencyMiddleware(routeKey) {
  const serviceActor = `service:${routeKey}`

  return async function idempotencyMw(req, res, next) {
    const key = req.header('x-idempotency-key')
    if (!key) return next()

    const userId = req.user?.id || serviceActor

    try {
      const bodyHash = createHash('sha256')
        .update(JSON.stringify(req.body || {}))
        .digest('hex')

      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key_routeKey_userId: { key, routeKey, userId } },
      })

      if (existing?.bodyHash && existing.bodyHash !== bodyHash) {
        return res.status(409).json({
          status: false,
          response: 'Idempotency key reused with different request payload',
          data: null,
        })
      }

      if (existing?.responseBody != null && existing.responseStatus != null) {
        return res.status(existing.responseStatus).json(existing.responseBody)
      }

      const originalJson = res.json.bind(res)
      res.json = (body) => {
        const status = res.statusCode || 200
        if (status >= 200 && status < 300) {
          prisma.idempotencyRecord
            .upsert({
              where: { key_routeKey_userId: { key, routeKey, userId } },
              create: {
                id: randomUUID(),
                key,
                routeKey,
                userId,
                bodyHash,
                responseStatus: status,
                responseBody: body,
              },
              update: {
                bodyHash,
                responseStatus: status,
                responseBody: body,
              },
            })
            .catch(() => {})
        }
        return originalJson(body)
      }

      return next()
    } catch {
      return next()
    }
  }
}
