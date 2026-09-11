import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://ecommerce_app:ECOMMERCE_DB%40%24321@villagkart-dev.c5ia646a42c8.ap-south-1.rds.amazonaws.com:5432/ecommerce?sslmode=no-verify'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected via pg client to RDS...');
    await client.query('ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "status" VARCHAR(255) DEFAULT \'PENDING\';');
    console.log('🎉 SUCCESS: Column "status" added to OrderItem table!');
  } catch (error) {
    console.error('pg error:', error.message);
  } finally {
    await client.end();
  }
}

run();
