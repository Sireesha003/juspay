// scripts/add-missing-postman-apis.js
import fs from 'fs'

const collectionPath = 'v10_VillagKart_Customer_App_API.postman_collection.json'
const collectionData = JSON.parse(fs.readFileSync(collectionPath, 'utf8'))

// Helper to find or create a folder in the collection item array
function findOrCreateFolder(folderName) {
  let folder = collectionData.item.find(i => i.name.toLowerCase() === folderName.toLowerCase() || i.name.toLowerCase().includes(folderName.toLowerCase()))
  if (!folder) {
    folder = {
      name: folderName,
      item: []
    }
    collectionData.item.push(folder)
  }
  return folder
}

function createPostmanRequest({ name, method, path, query = [], body = null, auth = true }) {
  const headers = [
    { key: 'Content-Type', value: 'application/json', type: 'text' }
  ]
  if (auth) {
    headers.push({ key: 'Authorization', value: 'Bearer {{authToken}}', type: 'text' })
  }

  const pathSegments = path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean)
  const pathArray = ['api', 'v1', ...pathSegments]

  const reqObj = {
    name,
    request: {
      method,
      header: headers,
      url: {
        raw: `{{base_url}}${path}`,
        host: ['{{base_url}}'],
        path: pathArray
      }
    }
  }

  if (query.length > 0) {
    reqObj.request.url.query = query.map(q => ({ key: q.key, value: q.value }))
    const queryStr = query.map(q => `${q.key}=${q.value}`).join('&')
    reqObj.request.url.raw += `?${queryStr}`
  }

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    reqObj.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2)
    }
  }

  return reqObj
}

// 1. Health & Check
const healthFolder = findOrCreateFolder('00. Health & Check')
healthFolder.item.push(createPostmanRequest({ name: 'Root Health Check', method: 'GET', path: '/health', auth: false }))
healthFolder.item.push(createPostmanRequest({ name: 'API Health Check', method: 'GET', path: '/api/v1/health', auth: false }))
healthFolder.item.push(createPostmanRequest({ name: 'Socket Health Check', method: 'GET', path: '/health/socket', auth: false }))
healthFolder.item.push(createPostmanRequest({ name: 'Firebase Health Check', method: 'GET', path: '/health/firebase', auth: false }))

// 2. Auth
const authFolder = findOrCreateFolder('01. Auth')
authFolder.item.push(createPostmanRequest({ name: 'Login (OTP Request Alias)', method: 'POST', path: '/api/v1/user/login', body: { phone: '{{phone}}' }, auth: false }))
authFolder.item.push(createPostmanRequest({ name: 'Register (OTP Request Alias)', method: 'POST', path: '/api/v1/user/register', body: { phone: '{{phone}}' }, auth: false }))
authFolder.item.push(createPostmanRequest({ name: 'Social Login', method: 'POST', path: '/api/v1/user/social-login', body: { provider: 'google', idToken: 'sample_token' }, auth: false }))
authFolder.item.push(createPostmanRequest({ name: 'Get Profile (Alias)', method: 'GET', path: '/api/v1/profile', auth: true }))
authFolder.item.push(createPostmanRequest({ name: 'Update Profile (Alias)', method: 'PATCH', path: '/api/v1/profile', body: { name: 'Consumer User' }, auth: true }))
authFolder.item.push(createPostmanRequest({ name: 'Delete Account', method: 'DELETE', path: '/api/v1/user/account', auth: true }))

// 3. Serviceability
const serviceabilityFolder = findOrCreateFolder('02. Serviceability')
serviceabilityFolder.item.push(createPostmanRequest({ name: 'Request Serviceability Notify', method: 'POST', path: '/api/v1/serviceability/notify', body: { pincode: '{{pincode}}', phone: '{{phone}}' }, auth: false }))
serviceabilityFolder.item.push(createPostmanRequest({ name: 'Check Warehouse Serviceability for Checkout', method: 'POST', path: '/api/v1/check-serviceability', body: { pincode: '{{pincode}}', warehouseId: '{{warehouseId}}' }, auth: false }))

// 4. Products & Catalog
const productsFolder = findOrCreateFolder('05. Products')
productsFolder.item.push(createPostmanRequest({ name: 'Get Product Filters Metadata', method: 'GET', path: '/api/v1/products/filters', query: [{ key: 'pincode', value: '{{pincode}}' }], auth: false }))
productsFolder.item.push(createPostmanRequest({ name: 'Get Shop By Need Products', method: 'GET', path: '/api/v1/products/shop-by-need', query: [{ key: 'pincode', value: '{{pincode}}' }], auth: false }))
productsFolder.item.push(createPostmanRequest({ name: 'Get Daily Deals Products', method: 'GET', path: '/api/v1/products/daily-deals', query: [{ key: 'pincode', value: '{{pincode}}' }], auth: false }))
productsFolder.item.push(createPostmanRequest({ name: 'Get Weekly Specials Products', method: 'GET', path: '/api/v1/products/weekly-specials', query: [{ key: 'pincode', value: '{{pincode}}' }], auth: false }))

// 5. Cart & Checkout
const cartFolder = findOrCreateFolder('08. Cart')
cartFolder.item.push(createPostmanRequest({ name: 'Add Item / Bundle to Cart (Standard POST)', method: 'POST', path: '/api/v1/cart', body: { productId: '{{productId}}', quantity: 1 }, auth: true }))
cartFolder.item.push(createPostmanRequest({ name: 'Update Cart Item Quantity (Standard PUT)', method: 'PUT', path: '/api/v1/cart/{{cartItemId}}', body: { quantity: 2 }, auth: true }))
cartFolder.item.push(createPostmanRequest({ name: 'Apply Coupon to Cart', method: 'POST', path: '/api/v1/cart/coupon', body: { couponCode: 'SAVE10' }, auth: true }))

const checkoutFolder = findOrCreateFolder('Checkout')
checkoutFolder.item.push(createPostmanRequest({ name: 'Process OMS Checkout Gateway', method: 'POST', path: '/api/v1/checkout', body: { addressId: '{{addressId}}', deliveryType: 'EXPRESS' }, auth: true }))

// 6. Orders
const ordersFolder = findOrCreateFolder('11. Orders')
ordersFolder.item.push(createPostmanRequest({ name: 'Order Live Tracking (Canonical Alias)', method: 'GET', path: '/api/v1/orders/{{orderId}}/live-tracking', auth: true }))
ordersFolder.item.push(createPostmanRequest({ name: 'Get Order Tracking History Events', method: 'GET', path: '/api/v1/orders/{{orderId}}/tracking-history', auth: true }))

// 7. Returns
const returnsFolder = findOrCreateFolder('13. Returns')
returnsFolder.item.push(createPostmanRequest({ name: 'Initiate Return Request', method: 'POST', path: '/api/v1/orders/{{orderId}}/returns', body: { reason: 'DEFECTIVE_PRODUCT', items: [{ orderItemId: '{{orderItemId}}', quantity: 1 }] }, auth: true }))
returnsFolder.item.push(createPostmanRequest({ name: 'Get Return Status for Order', method: 'GET', path: '/api/v1/orders/{{orderId}}/returns', auth: true }))

// 8. Saved Payment Methods
const paymentsFolder = findOrCreateFolder('12. Payments')
paymentsFolder.item.push(createPostmanRequest({ name: 'Get Saved Payment Methods', method: 'GET', path: '/api/v1/payments/saved', auth: true }))
paymentsFolder.item.push(createPostmanRequest({ name: 'Add Saved Payment Method', method: 'POST', path: '/api/v1/payments/saved', body: { cardLast4: '4242', brand: 'VISA' }, auth: true }))
paymentsFolder.item.push(createPostmanRequest({ name: 'Delete Saved Payment Method', method: 'DELETE', path: '/api/v1/payments/saved/{{savedPaymentId}}', auth: true }))

// 9. Digital Wallet & Loyalty
const walletFolder = findOrCreateFolder('Wallet')
walletFolder.item.push(createPostmanRequest({ name: 'Get Wallet Balance', method: 'GET', path: '/api/v1/wallet/balance', auth: true }))
walletFolder.item.push(createPostmanRequest({ name: 'Get Wallet Transactions', method: 'GET', path: '/api/v1/wallet/transactions', auth: true }))
walletFolder.item.push(createPostmanRequest({ name: 'Add Funds to Wallet', method: 'POST', path: '/api/v1/wallet/add-funds', body: { amount: 500 }, auth: true }))

const loyaltyFolder = findOrCreateFolder('Loyalty')
loyaltyFolder.item.push(createPostmanRequest({ name: 'Get Loyalty Points Balance', method: 'GET', path: '/api/v1/loyalty/balance', auth: true }))

// 10. Referral & Subscriptions
const referralFolder = findOrCreateFolder('Referral')
referralFolder.item.push(createPostmanRequest({ name: 'Get Referral Details & Stats', method: 'GET', path: '/api/v1/referral/details', auth: true }))

const subscriptionFolder = findOrCreateFolder('Subscriptions')
subscriptionFolder.item.push(createPostmanRequest({ name: 'Create Product Subscription', method: 'POST', path: '/api/v1/subscriptions', body: { productId: '{{productId}}', frequency: 'DAILY' }, auth: true }))
subscriptionFolder.item.push(createPostmanRequest({ name: 'Get Product Subscriptions', method: 'GET', path: '/api/v1/subscriptions', auth: true }))
subscriptionFolder.item.push(createPostmanRequest({ name: 'Update Subscription Status', method: 'PATCH', path: '/api/v1/subscriptions/{{subscriptionId}}', body: { status: 'PAUSED' }, auth: true }))

// 11. Bundle Deals
const bundleFolder = findOrCreateFolder('Bundle Deals')
bundleFolder.item.push(createPostmanRequest({ name: 'Get Active Virtual Bundle Deals', method: 'GET', path: '/api/v1/bundles', query: [{ key: 'pincode', value: '{{pincode}}' }], auth: false }))
bundleFolder.item.push(createPostmanRequest({ name: 'Get Delivery Bundle Deals', method: 'GET', path: '/api/v1/delivery/bundles', auth: true }))

// 12. Vehicles & Delivery Schedule
const vehiclesFolder = findOrCreateFolder('Vehicles & Tracking')
vehiclesFolder.item.push(createPostmanRequest({ name: 'Get Vehicles by Warehouse', method: 'GET', path: '/api/v1/vehicles', query: [{ key: 'warehouseId', value: '{{warehouseId}}' }, { key: 'customerVillage', value: 'Anakapalle' }], auth: true }))
vehiclesFolder.item.push(createPostmanRequest({ name: 'Track Vehicle Real-Time', method: 'GET', path: '/api/v1/vehicles/{{vehicleId}}/track', auth: true }))

const scheduleFolder = findOrCreateFolder('Village Schedule')
scheduleFolder.item.push(createPostmanRequest({ name: 'Get Village Delivery Schedule Overview', method: 'GET', path: '/api/v1/delivery/schedule', query: [{ key: 'pincode', value: '{{pincode}}' }], auth: true }))
scheduleFolder.item.push(createPostmanRequest({ name: 'Get Serviceable Villages List', method: 'GET', path: '/api/v1/delivery/schedule/villages', query: [{ key: 'pincode', value: '{{pincode}}' }], auth: true }))
scheduleFolder.item.push(createPostmanRequest({ name: 'Get Village Schedule Detail', method: 'GET', path: '/api/v1/delivery/schedule/detail', query: [{ key: 'villageName', value: 'Route A - Vizag Rural' }], auth: true }))

// 13. Store Locator
const storeLocatorFolder = findOrCreateFolder('Store Locator')
storeLocatorFolder.item.push(createPostmanRequest({ name: 'Get Nearby Stores', method: 'GET', path: '/api/v1/store-locator/nearby', query: [{ key: 'lat', value: '12.9716' }, { key: 'lng', value: '77.5946' }], auth: false }))

// 14. Content Management (About Us, Terms & Conditions, Privacy Policy, FAQ)
const contentFolder = findOrCreateFolder('Content Management')
contentFolder.item.push(createPostmanRequest({ name: 'Get Content by Type (ABOUT_US / TERMS / PRIVACY / FAQ)', method: 'GET', path: '/api/v1/content/ABOUT_US', auth: false }))
contentFolder.item.push(createPostmanRequest({ name: 'Get All Content Documents', method: 'GET', path: '/api/v1/content', auth: false }))
contentFolder.item.push(createPostmanRequest({ name: 'Create / Update Content (Upsert)', method: 'POST', path: '/api/v1/content', body: { type: 'FAQ', title: 'Frequently Asked Questions', content: 'Sample FAQ content' }, auth: true }))
contentFolder.item.push(createPostmanRequest({ name: 'Update Content by ID', method: 'PUT', path: '/api/v1/content/{{contentId}}', body: { title: 'Updated Title', content: 'Updated content text' }, auth: true }))
contentFolder.item.push(createPostmanRequest({ name: 'Soft Delete Content by ID', method: 'DELETE', path: '/api/v1/content/{{contentId}}', auth: true }))

// Write updated collection file
fs.writeFileSync(collectionPath, JSON.stringify(collectionData, null, 2), 'utf8')
console.log('✅ Successfully updated v10_VillagKart_Customer_App_API.postman_collection.json with all missing APIs!')
