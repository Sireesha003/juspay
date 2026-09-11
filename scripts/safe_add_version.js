import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  try {
    console.log('Adding version column to Order table safely...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
    `);
    console.log('SUCCESS: Column "version" added (or already existed) without any data loss!');
  } catch (error) {
    console.error('ERROR executing migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
