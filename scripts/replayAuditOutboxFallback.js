import 'dotenv/config'
import { connectPostGreSQL, prisma } from '../config/prismaClient.js'
import { replayAuditOutboxFallback } from '../audit/auditOutboxRepo.js'

async function main() {
  await connectPostGreSQL()
  const limit = Number(process.argv[2] || 500)
  const result = await replayAuditOutboxFallback({ limit })
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        replayed: result.replayed,
        remaining: result.remaining
      },
      null,
      2
    )
  )
}

main()
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error('[AuditReplay] Failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

