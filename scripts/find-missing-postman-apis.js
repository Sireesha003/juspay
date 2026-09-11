// scripts/find-missing-postman-apis.js
import fs from 'fs'

const postmanContent = fs.readFileSync('v10_VillagKart_Customer_App_API.postman_collection.json', 'utf8')
const postmanObj = JSON.parse(postmanContent)

function extractPostmanRequests(item, list = []) {
  if (item.request && item.request.url) {
    const rawUrl = typeof item.request.url === 'string' ? item.request.url : (item.request.url.raw || '')
    const method = (item.request.method || 'GET').toUpperCase()
    list.push({ name: item.name, method, url: rawUrl })
  }
  if (item.item) {
    item.item.forEach(sub => extractPostmanRequests(sub, list))
  }
  return list
}

const postmanRequests = extractPostmanRequests(postmanObj)

// Normalize URL path by replacing {{base_url}}, http://localhost:3002, etc.
function normalizePath(rawUrl) {
  let pathStr = rawUrl
    .replace(/^https?:\/\/[^\/]+/, '')
    .replace('{{base_url}}', '')
    .replace('{{consumer_url}}', '')
    .split('?')[0]
  if (!pathStr.startsWith('/')) pathStr = '/' + pathStr
  return pathStr
}

const postmanPaths = postmanRequests.map(r => ({
  name: r.name,
  method: r.method,
  path: normalizePath(r.url)
}))

// Exhaustive list of all registered Express routes in the codebase
const allCodebaseRoutes = [
  // Health & System
  { method: 'GET', path: '/health', description: 'Root health check' },
  { method: 'GET', path: '/api/v1/health', description: 'API health check' },
  { method: 'GET', path: '/health/socket', description: 'Socket.IO connection health' },
  { method: 'GET', path: '/health/firebase', description: 'Firebase Admin SDK health' },
  { method: 'GET', path: '/api/v1/check', description: 'API check & realtime status' },
  { method: 'GET', path: '/api/v1/app/intro-screens', description: 'Intro screens slides' },

  // Auth & Profile
  { method: 'POST', path: '/api/v1/user/send-otp', description: 'Send OTP via MSG91' },
  { method: 'POST', path: '/api/v1/user/login', description: 'Login OTP request alias' },
  { method: 'POST', path: '/api/v1/user/register', description: 'Register OTP request alias' },
  { method: 'POST', path: '/api/v1/user/resend-otp', description: 'Resend OTP' },
  { method: 'POST', path: '/api/v1/user/verify-otp', description: 'Verify OTP & issue JWT token' },
  { method: 'POST', path: '/api/v1/user/social-login', description: 'Social login sign-in' },
  { method: 'GET', path: '/api/v1/user/me', description: 'Get logged-in user profile' },
  { method: 'GET', path: '/api/v1/profile', description: 'Get profile alias' },
  { method: 'PATCH', path: '/api/v1/user/update-profile', description: 'Update profile details' },
  { method: 'PATCH', path: '/api/v1/profile', description: 'Update profile alias' },
  { method: 'DELETE', path: '/api/v1/user/account', description: 'Delete / deactivate user account' },
  { method: 'POST', path: '/api/v1/updateToken', description: 'Update FCM device token & metadata' },

  // Serviceability
  { method: 'POST', path: '/api/v1/serviceability', description: 'Check pincode / geofence serviceability' },
  { method: 'GET', path: '/api/v1/serviceability', description: 'Check pincode serviceability GET query' },
  { method: 'POST', path: '/api/v1/serviceability/notify', description: 'Request serviceability notification' },
  { method: 'POST', path: '/api/v1/check-serviceability', description: 'Check warehouse serviceability for checkout' },

  // Categories, Subcategories, Brands & Bundles
  { method: 'POST', path: '/api/v1/categories', description: 'Fetch categories POST' },
  { method: 'GET', path: '/api/v1/categories', description: 'Fetch categories GET' },
  { method: 'POST', path: '/api/v1/subcategories', description: 'Fetch subcategories POST' },
  { method: 'GET', path: '/api/v1/subcategories', description: 'Fetch subcategories GET' },
  { method: 'POST', path: '/api/v1/brands', description: 'Fetch top brands POST' },
  { method: 'GET', path: '/api/v1/brands', description: 'Fetch top brands GET' },
  { method: 'GET', path: '/api/v1/bundles', description: 'Get active virtual bundle deals' },

  // Products
  { method: 'GET', path: '/api/v1/products', description: 'Search products' },
  { method: 'GET', path: '/api/v1/products/suggestions', description: 'Search autocomplete suggestions' },
  { method: 'GET', path: '/api/v1/products/filters', description: 'Product filters metadata' },
  { method: 'GET', path: '/api/v1/products/category/:categoryId', description: 'Products by category' },
  { method: 'GET', path: '/api/v1/products/subcategory/:subCategoryId', description: 'Products by subcategory' },
  { method: 'GET', path: '/api/v1/products/popular', description: 'Popular / trending products' },
  { method: 'GET', path: '/api/v1/products/offers', description: 'Offer products (MRP > Selling price)' },
  { method: 'GET', path: '/api/v1/products/shop-by-need', description: 'Shop by need products' },
  { method: 'GET', path: '/api/v1/products/daily-deals', description: 'Daily deal products' },
  { method: 'GET', path: '/api/v1/products/weekly-specials', description: 'Weekly special products' },
  { method: 'GET', path: '/api/v1/products/:productId', description: 'Product detail view' },

  // Coupons
  { method: 'GET', path: '/api/v1/coupons', description: 'Home screen coupons' },
  { method: 'GET', path: '/api/v1/coupons/cart', description: 'Cart-applicable coupons' },

  // Cart
  { method: 'GET', path: '/api/v1/cart', description: 'Get shopping cart' },
  { method: 'POST', path: '/api/v1/cart', description: 'Add item / bundle to cart' },
  { method: 'PUT', path: '/api/v1/cart/:itemId', description: 'Update cart item quantity' },
  { method: 'DELETE', path: '/api/v1/cart/:itemId', description: 'Remove cart item' },
  { method: 'DELETE', path: '/api/v1/cart', description: 'Clear entire cart' },
  { method: 'GET', path: '/api/v1/cart/summary', description: 'Cart summary breakdown' },
  { method: 'GET', path: '/api/v1/cart/validate', description: 'Validate cart stock' },
  { method: 'POST', path: '/api/v1/cart/coupon', description: 'Apply coupon code to cart' },
  { method: 'DELETE', path: '/api/v1/cart/coupon', description: 'Remove active coupon' },

  // Checkout & Orders
  { method: 'POST', path: '/api/v1/checkout', description: 'OMS checkout process' },
  { method: 'POST', path: '/api/v1/orders', description: 'Create order' },
  { method: 'GET', path: '/api/v1/orders', description: 'Get user orders' },
  { method: 'GET', path: '/api/v1/orders/slots/availability', description: 'Get delivery slots availability' },
  { method: 'GET', path: '/api/v1/orders/:orderId', description: 'Get order details' },
  { method: 'PATCH', path: '/api/v1/orders/:orderId/cancel', description: 'Cancel order' },
  { method: 'GET', path: '/api/v1/orders/:orderId/tracking', description: 'Order milestone tracking' },
  { method: 'GET', path: '/api/v1/orders/:orderId/tracking/live', description: 'Order live tracking' },
  { method: 'GET', path: '/api/v1/orders/:orderId/live-tracking', description: 'Order live tracking canonical alias' },
  { method: 'GET', path: '/api/v1/orders/:orderId/tracking-history', description: 'Order tracking history events' },
  { method: 'POST', path: '/api/v1/orders/:orderId/tracking/location', description: 'Update delivery agent location' },
  { method: 'PATCH', path: '/api/v1/orders/:orderId/delivery', description: 'Modify order delivery slot' },
  { method: 'PATCH', path: '/api/v1/orders/:orderId/items', description: 'Modify order items' },
  { method: 'POST', path: '/api/v1/orders/:orderId/items/:itemId/cancel', description: 'Cancel single order item' },
  { method: 'POST', path: '/api/v1/orders/:orderId/reorder', description: 'Reorder past order' },
  { method: 'GET', path: '/api/v1/orders/:orderId/invoice', description: 'Get order invoice' },

  // Delivery
  { method: 'GET', path: '/api/v1/delivery/slots', description: 'Get available delivery slots' },
  { method: 'POST', path: '/api/v1/delivery/calculate-charge', description: 'Calculate delivery charge preview' },
  { method: 'GET', path: '/api/v1/delivery/types', description: 'Get delivery types' },
  { method: 'GET', path: '/api/v1/delivery/stores/pickup', description: 'Get pickup stores list' },
  { method: 'GET', path: '/api/v1/delivery/stores/:storeId/pickup-slots', description: 'Get store pickup slots' },
  { method: 'GET', path: '/api/v1/delivery/schedule', description: 'Get village delivery schedule' },
  { method: 'GET', path: '/api/v1/delivery/schedule/villages', description: 'Get serviceable villages list' },
  { method: 'GET', path: '/api/v1/delivery/schedule/detail', description: 'Get village schedule detail' },
  { method: 'GET', path: '/api/v1/delivery/bundles', description: 'Get delivery bundle deals' },

  // Addresses
  { method: 'GET', path: '/api/v1/addresses', description: 'Get user addresses' },
  { method: 'POST', path: '/api/v1/addresses', description: 'Create address' },
  { method: 'PATCH', path: '/api/v1/addresses/:addressId', description: 'Update address' },
  { method: 'DELETE', path: '/api/v1/addresses/:addressId', description: 'Delete address' },
  { method: 'PATCH', path: '/api/v1/addresses/:addressId/set-default', description: 'Set default address' },

  // Payments
  { method: 'POST', path: '/api/v1/payments/razorpay/webhook', description: 'Razorpay webhook' },
  { method: 'POST', path: '/api/v1/payments/initiate', description: 'Initiate Razorpay payment' },
  { method: 'POST', path: '/api/v1/payments/verify', description: 'Verify Razorpay payment signature' },
  { method: 'GET', path: '/api/v1/payments/:paymentId', description: 'Get payment status' },
  { method: 'POST', path: '/api/v1/payments/:paymentId/retry', description: 'Retry failed payment' },
  { method: 'GET', path: '/api/v1/payments/saved', description: 'Get saved payment methods' },
  { method: 'POST', path: '/api/v1/payments/saved', description: 'Add saved payment method' },
  { method: 'DELETE', path: '/api/v1/payments/saved/:id', description: 'Delete saved payment method' },

  // Notifications
  { method: 'GET', path: '/api/v1/notifications', description: 'Get notifications feed' },
  { method: 'GET', path: '/api/v1/notifications/unread-count', description: 'Get unread notification count' },
  { method: 'GET', path: '/api/v1/notifications/:notificationId', description: 'Get notification detail' },
  { method: 'PATCH', path: '/api/v1/notifications/:notificationId/read', description: 'Mark notification as read' },
  { method: 'PATCH', path: '/api/v1/notifications/read-all', description: 'Mark all notifications as read' },

  // Ratings
  { method: 'POST', path: '/api/v1/products/:productId/ratings', description: 'Submit product rating & review' },
  { method: 'GET', path: '/api/v1/products/:productId/ratings', description: 'Get product ratings' },
  { method: 'GET', path: '/api/v1/ratings/my-ratings', description: 'Get user submitted ratings' },
  { method: 'PATCH', path: '/api/v1/ratings/:ratingId', description: 'Update submitted rating' },
  { method: 'DELETE', path: '/api/v1/ratings/:ratingId', description: 'Delete submitted rating' },
  { method: 'POST', path: '/api/v1/order-rating', description: 'Submit order rating' },

  // Returns
  { method: 'POST', path: '/api/v1/orders/:orderId/returns', description: 'Initiate return request' },
  { method: 'GET', path: '/api/v1/orders/:orderId/returns', description: 'Get return status for order' },
  { method: 'GET', path: '/api/v1/returns', description: 'Get user return requests' },
  { method: 'POST', path: '/api/v1/returns/:returnId/cancel', description: 'Cancel return request' },

  // Chat
  { method: 'POST', path: '/api/v1/chat', description: 'Send chat message' },
  { method: 'GET', path: '/api/v1/chat/orders/:orderId', description: 'Get order chat history' },
  { method: 'GET', path: '/api/v1/chat/conversations', description: 'Get user chat conversations' },

  // Wishlist
  { method: 'POST', path: '/api/v1/wishlist/add', description: 'Add to wishlist' },
  { method: 'GET', path: '/api/v1/wishlist', description: 'Get wishlist' },
  { method: 'DELETE', path: '/api/v1/wishlist/remove/:productId', description: 'Remove from wishlist' },
  { method: 'PATCH', path: '/api/v1/wishlist/clear', description: 'Clear wishlist' },

  // Wallet, Loyalty, Referral, Subscriptions
  { method: 'GET', path: '/api/v1/wallet/balance', description: 'Get wallet balance' },
  { method: 'GET', path: '/api/v1/wallet/transactions', description: 'Get wallet transactions' },
  { method: 'POST', path: '/api/v1/wallet/add-funds', description: 'Add funds to wallet' },
  { method: 'GET', path: '/api/v1/loyalty/balance', description: 'Get loyalty points balance' },
  { method: 'GET', path: '/api/v1/referral/details', description: 'Get referral code details' },
  { method: 'POST', path: '/api/v1/subscriptions', description: 'Create subscription' },
  { method: 'GET', path: '/api/v1/subscriptions', description: 'Get subscriptions' },
  { method: 'PATCH', path: '/api/v1/subscriptions/:id', description: 'Update subscription status' },

  // Vehicles
  { method: 'GET', path: '/api/v1/vehicles', description: 'Get vehicles by warehouse' },
  { method: 'GET', path: '/api/v1/vehicles/:id/track', description: 'Get vehicle real-time tracking data' },

  // Banners & Misc
  { method: 'GET', path: '/api/v1/banner', description: 'Get promotional banners' },
  { method: 'GET', path: '/api/v1/app-content-links', description: 'Get app content links' },
  { method: 'GET', path: '/api/v1/suggestion', description: 'Get suggestions list' },
  { method: 'GET', path: '/api/v1/store-locator/nearby', description: 'Get nearby stores' }
]

function isRouteInPostman(route) {
  return postmanPaths.some(p => {
    if (p.method !== route.method) return false
    const cleanP = p.path.replace(/\/+$/, '')
    const cleanR = route.path.replace(/\/+$/, '')

    // Check exact path or parameterized match (e.g. :orderId vs {{orderId}} or :id vs {{id}})
    const regexStr = '^' + cleanR
      .replace(/\/:[^\/]+/g, '/[^/]+')
      .replace(/\//g, '\\/') + '$'
    const reg = new RegExp(regexStr)
    return reg.test(cleanP)
  })
}

const missingRoutes = allCodebaseRoutes.filter(r => !isRouteInPostman(r))
const presentRoutes = allCodebaseRoutes.filter(r => isRouteInPostman(r))

console.log(`Total Codebase Routes Checked: ${allCodebaseRoutes.length}`)
console.log(`Routes PRESENT in Postman: ${presentRoutes.length}`)
console.log(`Routes MISSING from Postman: ${missingRoutes.length}\n`)

console.log('--- MISSING ROUTES LIST ---')
missingRoutes.forEach((r, i) => {
  console.log(`${i+1}. [${r.method}] ${r.path} (${r.description})`)
})
