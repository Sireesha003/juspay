import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const passwords = ['ECOMMERCE_DB%40%24321', 'ECOMMERCE_DB@$321', 'VillagKart1q2w3e24x7', 'xkpPS6zTJbH4AjdmBluO', 'postgres'];
  const users = ['villagkart_dev', 'postgres', 'ecommerce_app'];
  const host = 'villagkart-dev.c5ia646a42c8.ap-south-1.rds.amazonaws.com:5432';

  for (const u of users) {
    for (const p of passwords) {
      const url = `postgresql://${u}:${p}@${host}/ecommerce?sslmode=no-verify`;
      const client = new PrismaClient({ datasources: { db: { url } } });
      try {
        await client.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;`);
        console.log(`🎉 SUCCESS! Added version column using user="${u}" and password="${p}"!`);
        await client.$disconnect();
        return;
      } catch (err) {
        console.log(`Failed user="${u}": ${err.message?.slice(0, 80)}`);
      } finally {
        await client.$disconnect();
      }
    }
  }
}

run();
