import { PrismaClient } from '@prisma/client';

// Use active .env DATABASE_URL
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('Granting table ownership / privileges or adding version column...');
    // Grant ownership of table Order to ecommerce_app or alter column directly
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
    `);
    console.log('SUCCESS');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
