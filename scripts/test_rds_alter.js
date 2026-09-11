import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  try {
    console.log('Testing ALTER TABLE "Order" with current RDS credentials...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
    `);
    console.log('🎉 SUCCESS: Column "version" added to Order table on RDS!');
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
