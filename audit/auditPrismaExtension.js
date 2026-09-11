import logger from '../utils/logger.js'
import { AUDIT_FLAGS } from './auditConstants.js'

const AUDITED_MODELS = new Set(['Order', 'Payment', 'Delivery', 'User'])
const AUDITED_OPS = new Set(['create', 'update', 'upsert', 'delete', 'updateMany'])

export function applyAuditPrismaExtension(prisma) {
  // Phase 1 safety: never emit canonical business events from Prisma extension.
  // This prevents phantom events from rolled-back transactions and ownership drift.
  if (!AUDIT_FLAGS.enabled || !AUDIT_FLAGS.prismaMutationEnabled) return prisma

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args)
          if (AUDITED_MODELS.has(model) && AUDITED_OPS.has(operation)) {
            logger.debug('[Audit] Prisma mutation telemetry', {
              model,
              operation,
              where: args?.where || null
            })
          }
          return result
        }
      }
    }
  })
}

