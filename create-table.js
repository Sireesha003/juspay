import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LocationWaitlist" (
      "id" TEXT NOT NULL,
      "mobileNumber" TEXT NOT NULL,
      "pincode" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "notifiedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "LocationWaitlist_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "LocationWaitlist_mobileNumber_pincode_key" ON "LocationWaitlist"("mobileNumber", "pincode");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LocationWaitlist_pincode_idx" ON "LocationWaitlist"("pincode");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LocationWaitlist_status_idx" ON "LocationWaitlist"("status");`);
  console.log('Table created successfully!');
}
main().catch(console.error).finally(() => prisma.$disconnect());
