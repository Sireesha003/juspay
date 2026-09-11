import 'dotenv/config';
import { createJuspaySession } from './utils/juspayUtils.js';

async function testGateway() {
  console.log('Initiating test connection to Juspay Gateway...');
  try {
    // Generate a random order ID for testing
    const testOrderId = `TEST_ORD_${Date.now()}`;
    
    console.log(`Creating payment session for Order ID: ${testOrderId}`);
    console.log(`Amount: 10.00 INR\n`);

    const sessionData = await createJuspaySession({
      orderId: testOrderId,
      amount: 10.00,
      customerId: 'test_customer_123',
      customerEmail: 'test@example.com',
      customerPhone: '9876543210',
      returnUrl: 'https://juspay-5b6q.onrender.com/return'
    });

    console.log('✅ GATEWAY IS WORKING PERFECTLY!\n');
    console.log('--- Session Details ---');
    console.log(`Status: ${sessionData.status}`);
    console.log(`Juspay Order ID: ${sessionData.order_id}`);
    
    if (sessionData.payment_links && sessionData.payment_links.web) {
      console.log(`\n🔗 Test Checkout URL (You can open this in your browser to see the gateway):`);
      console.log(sessionData.payment_links.web);
    } else {
      console.log('\nSession data received, but no web link was provided (this might be normal for purely SDK-based integrations).');
    }

  } catch (error) {
    console.error('\n❌ GATEWAY TEST FAILED!');
    console.error(`Error: ${error.message}`);
    if (error.raw) {
      console.error('Details:', JSON.stringify(error.raw, null, 2));
    }
  }
}

testGateway();
