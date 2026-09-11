import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const initialContent = [
  {
    type: 'ABOUT_US',
    title: 'About VillagKart',
    content: `
# Welcome to VillagKart

**VillagKart** is a premier rural e-commerce and fresh produce delivery platform dedicated to connecting local farmers, rural hubs, and consumers.

### Our Mission
To empower rural communities and local agriculture by building a direct, seamless digital bridge between producers and consumers, delivering high-quality groceries, fresh farm produce, and daily household essentials directly to your doorstep.

### Key Highlights
- **Direct From Farm**: Fresh fruits, vegetables, and staples sourced directly from local producers.
- **Hub & Village Scheduling**: Dedicated scheduled delivery slots optimized for local routes and mandals.
- **Transparent Pricing**: Fair prices for consumers and sustainable earnings for local partners and delivery personnel.
- **Real-Time Order Tracking**: Live GPS tracking for delivery updates from dispatch to doorstep.

For support or feedback, reach out to us at **support@villagkart.com**.
    `.trim()
  },
  {
    type: 'TERMS_AND_CONDITIONS',
    title: 'Terms & Conditions',
    content: `
# VillagKart Customer Terms & Conditions

*Last Updated: July 2026*

Please read these Terms and Conditions carefully before using the **VillagKart** mobile application or website.

### 1. User Registration & Accounts
- Users must provide a valid mobile phone number and verify via OTP to create an account.
- You are responsible for maintaining the confidentiality of your account credentials and activities under your account.

### 2. Orders & Serviceability
- Order acceptance is subject to warehouse stock availability and pincode serviceability.
- Prices displayed at checkout are inclusive of applicable taxes unless specified otherwise. Delivery charges may apply based on subtotal and location.

### 3. Delivery & Slot Booking
- Delivery schedules (scheduled slots or village route visits) are estimates and may vary due to weather or road conditions.
- Delivery OTP verification is required upon delivery completion.

### 4. Payments
- We accept Cash on Delivery (COD), UPI, Debit/Credit Cards, and Wallet payments via secure gateway partners (Razorpay).

### 5. Returns & Refunds
- Eligible items (damaged, incorrect, or missing produce) can be submitted for return via the app within the specified return window. Refunds will be processed to the original payment method or wallet balance.

For queries regarding these terms, please contact **legal@villagkart.com**.
    `.trim()
  },
  {
    type: 'PRIVACY_POLICY',
    title: 'Privacy Policy',
    content: `
# VillagKart Privacy Policy

*Last Updated: July 2026*

At **VillagKart**, protecting your personal privacy is a top priority. This Privacy Policy explains how we collect, use, and protect your information.

### 1. Information We Collect
- **Personal Information**: Name, mobile phone number, email address, and delivery addresses.
- **Location Data**: Precise geolocation (latitude and longitude) used to verify serviceability, recommend nearest stores, and deliver orders.
- **Device Information**: FCM tokens, device model, operating system version for push notifications and app security.

### 2. How We Use Your Data
- To process, fulfill, and track your orders.
- To send order status updates, delivery agent dispatch alerts, and service notifications.
- To improve store serviceability and optimize delivery logistics.

### 3. Data Protection & Sharing
- We do NOT sell or rent your personal information to third parties.
- Data is securely shared only with necessary service providers (such as payment gateways for transaction processing and delivery agents for order fulfillment).

### 4. Your Rights
- You may view, update, or delete your personal details through the account settings in the application at any time.

If you have questions about privacy, contact us at **privacy@villagkart.com**.
    `.trim()
  },
  {
    type: 'FAQ',
    title: 'Frequently Asked Questions (FAQ)',
    content: `
# Frequently Asked Questions

### Q1: How do I place an order on VillagKart?
**A:** Open the app, set your delivery address or pincode to check serviceability, add items to your cart, select a delivery slot or pickup store, and complete checkout using your preferred payment method.

### Q2: What payment methods are supported?
**A:** We accept Cash on Delivery (COD), Razorpay Online Payments (UPI, Cards, Net Banking), and VillagKart Wallet funds.

### Q3: How do delivery slots work?
**A:** Depending on your pincode, you can choose from Scheduled Delivery Slots, Store Pickup, or Village Route visits. You will receive an estimated arrival time and live tracking details once your order is dispatched.

### Q4: Can I track my order live?
**A:** Yes! Once your delivery agent is assigned and out for delivery, go to **My Orders** and tap **Live Tracking** to view real-time agent GPS coordinates and ETA.

### Q5: How do I cancel or modify an order?
**A:** Orders can be cancelled or edited directly from the **Order Details** screen before the order is marked as *Dispatched*.

### Q6: What should I do if an item is damaged or missing?
**A:** Go to **My Orders**, select the order, and tap **Request Return** to submit a return request for the affected item.
    `.trim()
  }
]

async function seedContent() {
  console.log('Ensuring Postgres ContentType enum has FAQ value...')
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'FAQ';`)
  } catch (e) {
    console.log('ALTER TYPE info:', e.message)
  }

  console.log('Seeding initial content (About Us, Terms & Conditions, Privacy Policy, FAQ)...')

  for (const item of initialContent) {
    // Upsert into ContentManagement table: find existing non-deleted record or create
    const existing = await prisma.contentManagement.findFirst({
      where: {
        type: item.type,
        isDeleted: false
      }
    })

    if (existing) {
      await prisma.contentManagement.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          content: item.content,
          status: 'ACTIVE',
          updatedAt: new Date()
        }
      })
      console.log(`Updated content for: ${item.type}`)
    } else {
      await prisma.contentManagement.create({
        data: {
          type: item.type,
          title: item.title,
          content: item.content,
          status: 'ACTIVE',
          isDeleted: false
        }
      })
      console.log(`Created content for: ${item.type}`)
    }
  }

  console.log('Content seeding completed successfully!')
}

seedContent()
  .catch((e) => {
    console.error('Error seeding content:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
