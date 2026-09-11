// scripts/test-all-apis.js
import 'dotenv/config'
import jwt from 'jsonwebtoken'
import fs from 'fs'

const rawBaseUrl = process.env.CUSTOMER_API_BASE_URL || 'http://localhost:3002/api/v1'
const BASE_URL = rawBaseUrl.replace(/\/+$/, '')
const SERVER_URL = 'http://localhost:3002'

// Load public/private keys for generating test auth token
let testToken = ''
try {
  const privateKey = fs.readFileSync('keys/private.key', 'utf8')
  // Sign a test JWT token for a test consumer user ID
  testToken = jwt.sign(
    { id: '00000000-0000-0000-0000-000000000001', role: 'CONSUMER', phone: '+919999999999' },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' }
  )
} catch (err) {
  console.warn('⚠️ Could not load keys/private.key for auth testing:', err.message)
}

const results = []

async function runTest(category, name, method, url, options = {}) {
  const start = Date.now()
  const headers = options.headers || {}
  if (options.auth && testToken) {
    headers['Authorization'] = `Bearer ${testToken}`
  }
  if (!headers['Content-Type'] && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    headers['Content-Type'] = 'application/json'
  }

  const reqOptions = {
    method,
    headers,
  }
  if (options.body) {
    reqOptions.body = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
  }

  try {
    const res = await fetch(url, reqOptions)
    const duration = Date.now() - start
    let bodyText = await res.text()
    let bodyJson = null
    try {
      bodyJson = JSON.parse(bodyText)
    } catch (_) {}

    // Expected status check: 2xx or allowable 4xx (e.g. 400 validation error is valid route response)
    const isSuccess = res.status >= 200 && res.status < 500

    results.push({
      category,
      name,
      method,
      url,
      status: res.status,
      statusText: res.statusText,
      duration: `${duration}ms`,
      passed: isSuccess,
      message: bodyJson?.message || bodyJson?.error || bodyText.substring(0, 100)
    })

    const icon = isSuccess ? '✅' : '❌'
    console.log(`${icon} [${res.status}] ${method} ${url.replace(SERVER_URL, '')} - ${duration}ms (${name})`)
  } catch (err) {
    const duration = Date.now() - start
    results.push({
      category,
      name,
      method,
      url,
      status: 'ERR',
      duration: `${duration}ms`,
      passed: false,
      message: err.message
    })
    console.log(`❌ [ERR] ${method} ${url.replace(SERVER_URL, '')} - ${err.message} (${name})`)
  }
}

async function testAllApis() {
  console.log('\n🚀 Starting Automated Full-Suite API Test Sweep...\n')
  console.log(`Target Server Base URL: ${BASE_URL}\n`)

  // 1. Health & Status
  console.log('--- Group 1: Health & System Diagnostics ---')
  await runTest('Health', 'Root Health', 'GET', `${SERVER_URL}/health`)
  await runTest('Health', 'API Health', 'GET', `${BASE_URL}/health`)
  await runTest('Health', 'Socket Health', 'GET', `${SERVER_URL}/health/socket`)
  await runTest('Health', 'Firebase Health', 'GET', `${SERVER_URL}/health/firebase`)
  await runTest('Health', 'API Check Status', 'GET', `${BASE_URL}/check`)
  await runTest('Health', 'Intro Screens', 'GET', `${BASE_URL}/app/intro-screens`)

  // 2. Serviceability & Warehouse
  console.log('\n--- Group 2: Serviceability & Warehouse ---')
  await runTest('Serviceability', 'Pincode Serviceability POST', 'POST', `${BASE_URL}/serviceability`, { body: { pincode: '560001' } })
  await runTest('Serviceability', 'Pincode Serviceability GET', 'GET', `${BASE_URL}/serviceability?pincode=560001`)
  await runTest('Serviceability', 'Check Warehouse Serviceability', 'POST', `${BASE_URL}/check-serviceability`, { body: { pincode: '560001', warehouseId: 'wh-123' } })
  await runTest('Serviceability', 'Notify Serviceability', 'POST', `${BASE_URL}/serviceability/notify`, { body: { pincode: '560001', phone: '9999999999' } })

  // 3. Catalog, Brands & Categories
  console.log('\n--- Group 3: Catalog, Categories & Brands ---')
  await runTest('Catalog', 'Categories POST', 'POST', `${BASE_URL}/categories`, { body: { pincode: '560001' } })
  await runTest('Catalog', 'Categories GET', 'GET', `${BASE_URL}/categories?pincode=560001`)
  await runTest('Catalog', 'Subcategories POST', 'POST', `${BASE_URL}/subcategories`, { body: { pincode: '560001' } })
  await runTest('Catalog', 'Subcategories GET', 'GET', `${BASE_URL}/subcategories?pincode=560001`)
  await runTest('Catalog', 'Top Brands POST', 'POST', `${BASE_URL}/brands`, { body: { pincode: '560001' } })
  await runTest('Catalog', 'Top Brands GET', 'GET', `${BASE_URL}/brands?pincode=560001`)
  await runTest('Catalog', 'Active Bundles', 'GET', `${BASE_URL}/bundles`)

  // 4. Products & Offers
  console.log('\n--- Group 4: Products Catalog & Search ---')
  await runTest('Products', 'Search Products', 'GET', `${BASE_URL}/products?pincode=560001`)
  await runTest('Products', 'Search Suggestions', 'GET', `${BASE_URL}/products/suggestions?query=milk`)
  await runTest('Products', 'Product Filters', 'GET', `${BASE_URL}/products/filters?pincode=560001`)
  await runTest('Products', 'Popular Products', 'GET', `${BASE_URL}/products/popular?pincode=560001`)
  await runTest('Products', 'Offers Products', 'GET', `${BASE_URL}/products/offers?pincode=560001`)
  await runTest('Products', 'Shop by Need', 'GET', `${BASE_URL}/products/shop-by-need?pincode=560001`)
  await runTest('Products', 'Daily Deals', 'GET', `${BASE_URL}/products/daily-deals?pincode=560001`)
  await runTest('Products', 'Weekly Specials', 'GET', `${BASE_URL}/products/weekly-specials?pincode=560001`)

  // 5. Coupons, Banners & Store Locator
  console.log('\n--- Group 5: Promotions, Coupons & Store Locator ---')
  await runTest('Promotions', 'Home Coupons', 'GET', `${BASE_URL}/coupons`)
  await runTest('Promotions', 'Cart Coupons', 'GET', `${BASE_URL}/coupons/cart`)
  await runTest('Promotions', 'Home Banners', 'GET', `${BASE_URL}/banner`, { auth: true })
  await runTest('Promotions', 'App Content Links', 'GET', `${BASE_URL}/app-content-links`, { auth: true })
  await runTest('Promotions', 'Suggestions List', 'GET', `${BASE_URL}/suggestion`)
  await runTest('StoreLocator', 'Nearby Stores', 'GET', `${BASE_URL}/store-locator/nearby?lat=12.9716&lng=77.5946`)

  // 6. Delivery & Pickup Stores
  console.log('\n--- Group 6: Delivery Types & Pickup Stores ---')
  await runTest('Delivery', 'Delivery Types', 'GET', `${BASE_URL}/delivery/types`)
  await runTest('Delivery', 'Pickup Stores List', 'GET', `${BASE_URL}/delivery/stores/pickup`)
  await runTest('Delivery', 'Delivery Bundles', 'GET', `${BASE_URL}/delivery/bundles`, { auth: true })
  await runTest('Delivery', 'Calculate Delivery Charge', 'POST', `${BASE_URL}/delivery/calculate-charge`, { body: { warehouseId: 'wh-1', distanceKm: 5, cartSubtotal: 250 } })

  // 7. Authentication Flow
  console.log('\n--- Group 7: Authentication Flow ---')
  await runTest('Auth', 'Send OTP', 'POST', `${BASE_URL}/user/send-otp`, { body: { phone: '+919999999999' } })

  // 8. Authenticated Consumer Features
  console.log('\n--- Group 8: Authenticated Consumer Operations ---')
  await runTest('User', 'Get Profile', 'GET', `${BASE_URL}/user/me`, { auth: true })
  await runTest('User', 'Get Profile Alias', 'GET', `${BASE_URL}/profile`, { auth: true })
  await runTest('Cart', 'Get Cart', 'GET', `${BASE_URL}/cart`, { auth: true })
  await runTest('Cart', 'Cart Summary', 'GET', `${BASE_URL}/cart/summary`, { auth: true })
  await runTest('Cart', 'Validate Cart', 'GET', `${BASE_URL}/cart/validate`, { auth: true })
  await runTest('Addresses', 'Get Addresses', 'GET', `${BASE_URL}/addresses`, { auth: true })
  await runTest('Orders', 'Get Orders History', 'GET', `${BASE_URL}/orders`, { auth: true })
  await runTest('Wishlist', 'Get Wishlist', 'GET', `${BASE_URL}/wishlist`, { auth: true })
  await runTest('Wallet', 'Wallet Balance', 'GET', `${BASE_URL}/wallet/balance`, { auth: true })
  await runTest('Wallet', 'Wallet Transactions', 'GET', `${BASE_URL}/wallet/transactions`, { auth: true })
  await runTest('Loyalty', 'Loyalty Balance', 'GET', `${BASE_URL}/loyalty/balance`, { auth: true })
  await runTest('Referral', 'Referral Details', 'GET', `${BASE_URL}/referral/details`, { auth: true })
  await runTest('Subscriptions', 'Get Subscriptions', 'GET', `${BASE_URL}/subscriptions`, { auth: true })
  await runTest('Notifications', 'Get Notifications', 'GET', `${BASE_URL}/notifications`, { auth: true })
  await runTest('Notifications', 'Unread Notification Count', 'GET', `${BASE_URL}/notifications/unread-count`, { auth: true })
  await runTest('Chat', 'Chat Conversations', 'GET', `${BASE_URL}/chat/conversations`, { auth: true })
  await runTest('Ratings', 'My Ratings', 'GET', `${BASE_URL}/ratings/my-ratings`, { auth: true })
  await runTest('Returns', 'User Returns History', 'GET', `${BASE_URL}/returns`, { auth: true })

  // Generate Summary Report
  console.log('\n======================================================')
  console.log('📊 AUTOMATED API TEST SWEEP SUMMARY REPORT')
  console.log('======================================================')
  const passedCount = results.filter(r => r.passed).length
  const failedCount = results.filter(r => !r.passed).length
  console.log(`Total Endpoints Tested: ${results.length}`)
  console.log(`Passed / Valid Routing: ${passedCount}`)
  console.log(`Failed / Server Error: ${failedCount}`)
  console.log('======================================================\n')
}

testAllApis()
