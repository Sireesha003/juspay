import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOwner() {
  try {
    const res = await prisma.$queryRawUnsafe(`
      SELECT tableowner, tablename FROM pg_tables WHERE tablename ILIKE 'order';
    `);
    console.log('Order table info:', res);
  } catch (err) {
    console.error('Query error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkOwner();
