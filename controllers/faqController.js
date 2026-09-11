import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'

// Comprehensive default dynamic FAQs for instant availability
const DEFAULT_FAQS = [
  {
    id: "faq-1",
    category: "Orders & Delivery",
    question: "How do I track my order?",
    answer: "You can track your live order progress under the 'Orders' section in the app, or click on live tracking from your order confirmation details.",
    sortOrder: 1,
    isActive: true
  },
  {
    id: "faq-2",
    category: "Orders & Delivery",
    question: "What are the delivery slots available?",
    answer: "We offer Fast Delivery and Scheduled Delivery slots based on your pincode serviceability.",
    sortOrder: 2,
    isActive: true
  },
  {
    id: "faq-3",
    category: "Payments & Refunds",
    question: "What payment methods are supported?",
    answer: "We support UPI (GPay, PhonePe, Paytm), Credit/Debit Cards, Net Banking, Razorpay, and Cash on Delivery (COD).",
    sortOrder: 3,
    isActive: true
  },
  {
    id: "faq-4",
    category: "Payments & Refunds",
    question: "When will I receive my refund for a cancelled order?",
    answer: "Refunds for online payments are processed automatically within 24-48 hours back to your original payment method.",
    sortOrder: 4,
    isActive: true
  },
  {
    id: "faq-5",
    category: "Returns & Cancellation",
    question: "Can I return fresh vegetables or fruits?",
    answer: "If fresh items are damaged or unfit, you can raise a return/replacement request at the time of delivery or within 6 hours of receipt.",
    sortOrder: 5,
    isActive: true
  },
  {
    id: "faq-6",
    category: "Returns & Cancellation",
    question: "How do I cancel an order?",
    answer: "You can cancel your order directly from the order details page before it is dispatched for delivery.",
    sortOrder: 6,
    isActive: true
  },
  {
    id: "faq-7",
    category: "Account & Support",
    question: "How do I update my delivery address?",
    answer: "Go to Profile > Saved Addresses to add, edit, or set a default delivery address.",
    sortOrder: 7,
    isActive: true
  },
  {
    id: "faq-8",
    category: "Account & Support",
    question: "How can I contact customer support?",
    answer: "You can reach out to our customer support via in-app Live Chat, email at support@villagkart.com, or call our toll-free support line.",
    sortOrder: 8,
    isActive: true
  }
]

// ➤ GET /api/v1/faqs (Get all active FAQs)
export const getFaqs = asyncHandler(async (req, res) => {
  logger.info("[FAQController] Fetching FAQs", { query: req.query })

  try {
    const { category, search } = req.query

    // Try fetching from DeliveryRelatedQuestion / AppContentLink if available
    let dbQuestions = []
    try {
      dbQuestions = await prisma.deliveryRelatedQuestion.findMany({
        where: { isActive: true }
      })
    } catch (e) {
      logger.warn("[FAQController] DeliveryRelatedQuestion fetch fallback", { error: e.message })
    }

    let combinedFaqs = [...DEFAULT_FAQS]

    if (dbQuestions && dbQuestions.length > 0) {
      const dynamicDbFaqs = dbQuestions.map((q, idx) => ({
        id: q.id || `db-faq-${idx}`,
        category: "Delivery & Service",
        question: q.question,
        answer: "Our team will assist you with any delivery queries related to this question.",
        sortOrder: 10 + idx,
        isActive: true
      }))
      combinedFaqs = [...combinedFaqs, ...dynamicDbFaqs]
    }

    // Filter by Category if provided
    if (category) {
      combinedFaqs = combinedFaqs.filter(
        f => f.category.toLowerCase() === String(category).toLowerCase()
      )
    }

    // Filter by Search Query if provided
    if (search) {
      const term = String(search).toLowerCase()
      combinedFaqs = combinedFaqs.filter(
        f => f.question.toLowerCase().includes(term) || f.answer.toLowerCase().includes(term)
      )
    }

    // Extract unique categories
    const categories = Array.from(new Set(DEFAULT_FAQS.map(f => f.category)))

    return successResponse(
      res,
      200,
      {
        faqs: combinedFaqs,
        categories,
        total: combinedFaqs.length
      },
      "FAQs fetched successfully"
    )
  } catch (error) {
    logger.error("[FAQController] Failed to fetch FAQs", { error: error.message })
    return errorResponse(res, 500, "Failed to fetch FAQs")
  }
})

// ➤ GET /api/v1/faqs/categories
export const getFaqCategories = asyncHandler(async (req, res) => {
  const categories = Array.from(new Set(DEFAULT_FAQS.map(f => f.category)))
  return successResponse(
    res,
    200,
    { categories },
    "FAQ categories fetched successfully"
  )
})

// ➤ GET /api/v1/faqs/:id
export const getFaqById = asyncHandler(async (req, res) => {
  const { id } = req.params
  const faq = DEFAULT_FAQS.find(f => f.id === id)

  if (!faq) {
    return errorResponse(res, 404, "FAQ entry not found")
  }

  return successResponse(res, 200, { faq }, "FAQ fetched successfully")
})
