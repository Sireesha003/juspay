import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  try {
    console.log('Adding missing "status" column to OrderItem table on RDS database safely...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "status" VARCHAR(255) DEFAULT 'PENDING';
    `);
    console.log('🎉 SUCCESS: Column "status" added to OrderItem table on RDS!');
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
