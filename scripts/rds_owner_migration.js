import { PrismaClient } from '@prisma/client';

const villagkartDevUrl = 'postgresql://villagkart_dev:ECOMMERCE_DB%40%24321@villagkart-dev.c5ia646a42c8.ap-south-1.rds.amazonaws.com:5432/ecommerce?sslmode=no-verify';
const prisma = new PrismaClient({ datasources: { db: { url: villagkartDevUrl } } });

async function run() {
  try {
    console.log('Connecting as table owner (villagkart_dev)...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
    `);
    console.log('SUCCESS: Column "version" added to Order table on RDS!');
  } catch (error) {
    console.error('Migration Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
