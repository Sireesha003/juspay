//services/apiRoutes.js
//Import Route Path
import swaggerUi from 'swagger-ui-express'
import { swaggerDocument } from '../config/swagger.js'
import authRouter from '../modules/auth/authRoutes.js'
import cartRouter from '../modules/cart/cartRoutes.js'
import userRouter from '../modules/users/userRoutes.js'
import checkoutRouter from '../modules/checkout/checkoutRoutes.js'
import ordersRouter from '../routes/orders.router.js'
import { getIntroScreens } from '../controllers/introController.js'
import config from '../config/config.js'
import serviceabilityRouter from '../routes/serviceability.js'
import checkServiceabilityRouter from '../routes/checkServiceability.router.js'
import couponsRouter from '../routes/couponsForYou.js'
import categoriesRouter from '../routes/categories.router.js'
import subcategoriesRouter from '../routes/subcategories.router.js'
import productsRouter from '../routes/products.router.js'
import bundleRoutes from '../routes/bundleRoutes.js'
import brandsRouter from '../routes/brands.router.js'
import addressesRouter from '../routes/addresses.router.js'
import paymentsRouter from '../routes/payments.router.js'
import notificationsRouter from '../routes/notifications.router.js'
import deliveryRouter from '../routes/delivery.router.js'
import ratingsRouter from '../routes/ratings.router.js'
import returnsRouter from '../routes/returns.router.js'
import chatRouter from '../routes/chat.router.js'
import wishlistRoutes from '../routes/wishlist.router.js'
import appContentLinkRoutes from '../routes/appContentLink.router.js'
import suggestionRouter from '../routes/suggestion.router.js'
import orderRatingRouter from '../routes/orderRating.router.js'
import bannerRouter from '../routes/banner.router.js'
import tokenRouter from '../routes/token.router.js'
import walletRouter from '../routes/wallet.router.js'
import referralRouter from '../routes/referral.router.js'
import loyaltyRouter from '../routes/loyalty.router.js'
import storeLocatorRouter from '../routes/storeLocator.router.js'
import subscriptionRouter from '../routes/subscription.router.js'
import internalSyncRouter from '../routes/internalSync.router.js'
import vehiclesRouter from '../routes/vehicles.router.js'
import faqRouter from '../routes/faq.router.js'
import contentManagementRouter from '../routes/contentManagement.router.js'
import { internalApiRateLimiter } from '../middlewares/internalApiRateLimiter.js'
import {
  healthAggregate,
  healthFirebase,
  healthSocket
} from '../controllers/healthController.js'

const routes = (app) => {
  const { fullPrefix } = config.api

  // Swagger UI Routes
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

  // Auth routes
  app.use(`${fullPrefix}/user`, authRouter)
  app.use(`${fullPrefix}/auth`, authRouter)

  // User routes
  app.use(`${fullPrefix}`, userRouter)

  // Serviceability routes (pincode-based warehouse selection)
  app.use(`${fullPrefix}/serviceability`, serviceabilityRouter)

  // Pincode vs selected warehouse (checkout)
  app.use(`${fullPrefix}/check-serviceability`, checkServiceabilityRouter)

  // Coupons routes (personalized and global coupons)
  app.use(`${fullPrefix}/coupons`, couponsRouter)

  // Categories routes (warehouse-based category listing)
  app.use(`${fullPrefix}/categories`, categoriesRouter)

  // Sub-categories routes (warehouse-based sub-category listing)
  app.use(`${fullPrefix}/subcategories`, subcategoriesRouter)

  // Products routes (category and sub-category based product listing)
  // Note: /popular route is handled within productsRouter to avoid route conflicts
  app.use(`${fullPrefix}/products`, productsRouter)

  // Bundles routes
  app.use(`${fullPrefix}/bundles`, bundleRoutes)

  // Brands routes (top brands available in warehouse)
  app.use(`${fullPrefix}/brands`, brandsRouter)

  // Cart routes (shopping cart management)
  app.use(`${fullPrefix}/cart`, cartRouter)

  // Checkout routes (OMS order capture gateway)
  app.use(`${fullPrefix}/checkout`, checkoutRouter)

  // Orders routes
  app.use(`${fullPrefix}/orders`, ordersRouter)
  app.use(`${fullPrefix}/order`, ordersRouter)
  app.use('/orders', ordersRouter)
  app.use('/order', ordersRouter)

  // Addresses routes (address management)
  app.use(`${fullPrefix}/addresses`, addressesRouter)

  // Payments routes (payment processing)
  app.use(`${fullPrefix}/payments`, paymentsRouter)

  // Notifications routes (notification management)
  app.use(`${fullPrefix}/notifications`, notificationsRouter)

  // Delivery routes (delivery slots and charge calculation)

  app.use(`${fullPrefix}/delivery`, deliveryRouter)

  // Ratings routes (product ratings and reviews)
  app.use(`${fullPrefix}`, ratingsRouter)

  // Returns routes (order returns and refunds)
  app.use(`${fullPrefix}`, returnsRouter)

  // Chat routes (order chat and messaging)
  app.use(`${fullPrefix}/chat`, chatRouter)

  // App routes (public)
  app.get(`${fullPrefix}/app/intro-screens`, getIntroScreens)

  // Wishlist routes
  app.use(`${fullPrefix}/wishlist`, wishlistRoutes)

  
  // App Content Link routes
  app.use(`${fullPrefix}/app-content-links`, appContentLinkRoutes);

  // Suggestion routes
  app.use(`${fullPrefix}/suggestion`, suggestionRouter);

  // Order Rating routes
  app.use(`${fullPrefix}/order-rating`, orderRatingRouter);
  //banner Router
  app.use(`${fullPrefix}/banner`, bannerRouter);

  // Device token update route
  app.use(`${fullPrefix}`, tokenRouter)

  // Wallet routes
  app.use(`${fullPrefix}/wallet`, walletRouter)

  // Referral routes
  app.use(`${fullPrefix}/referral`, referralRouter)

  // Loyalty routes
  app.use(`${fullPrefix}/loyalty`, loyaltyRouter)

  // VSMS Vehicles & Route Tracking routes
  app.use(`${fullPrefix}/vehicles`, vehiclesRouter)

  // Store locator routes
  app.use(`${fullPrefix}/store-locator`, storeLocatorRouter)

  // Subscription routes
  app.use(`${fullPrefix}/subscriptions`, subscriptionRouter)

  // Dynamic FAQ routes (FAQ listing, search, categories)
  app.use(`${fullPrefix}/faqs`, faqRouter)
  app.use(`${fullPrefix}/faq`, faqRouter)

  // Dynamic Content & Policies (Terms, Privacy, Cancellations, About Us set via Admin Consumer Settings)
  app.use(`${fullPrefix}/content`, contentManagementRouter)
  app.use(`${fullPrefix}/content-management`, contentManagementRouter)

  // Internal service-to-service sync routes (delivery-api -> consumer projection)
  app.use(`${fullPrefix}/internal`, internalApiRateLimiter, internalSyncRouter)

  app.get('/health', healthAggregate)
  app.get(`${fullPrefix}/health`, healthAggregate)
  app.get('/health/socket', healthSocket)
  app.get(`${fullPrefix}/health/socket`, healthSocket)
  app.get('/health/firebase', healthFirebase)
  app.get(`${fullPrefix}/health/firebase`, healthFirebase)

  // Health check
  app.get(`${fullPrefix}/check`, (req, res) => {
    res.json({
      message: 'VillagKart-Consumer API is running',
      status: 'success',
      timestamp: new Date().toISOString(),
      version: config.api.version,
      realtime: {
        mode: 'single-node',
        namespaces: ['/consumer', '/delivery', '/partner', '/admin']
      }
    })
  })
}

export default routes
