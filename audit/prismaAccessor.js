let prismaRef = null

export function setAuditPrismaClient(prisma) {
  prismaRef = prisma
}

export function getAuditPrismaClient() {
  if (!prismaRef) {
    throw new Error('Audit Prisma client is not initialized')
  }
  return prismaRef
}

