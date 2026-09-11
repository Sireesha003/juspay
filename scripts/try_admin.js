import { PrismaClient } from '@prisma/client';

const rdsProdUrl = 'postgresql://postgres:VillagKart1q2w3e24x7@villagkart-dev.c5ia646a42c8.ap-south-1.rds.amazonaws.com:5432/ecommerce?sslmode=no-verify';
const prisma = new PrismaClient({ datasources: { db: { url: rdsProdUrl } } });

async function run() {
  try {
    console.log('Testing connection with postgres:VillagKart1q2w3e24x7 on database ecommerce...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;`);
    console.log('SUCCESS: Added version column using postgres admin credentials!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
