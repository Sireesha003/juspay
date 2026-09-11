import express from 'express'
import { getFaqs, getFaqCategories, getFaqById } from '../controllers/faqController.js'

const router = express.Router()

/**
 * GET /api/v1/faqs
 * GET /api/v1/faq
 * List all active FAQs (supports ?category= and ?search=)
 */
router.get('/', getFaqs)

/**
 * GET /api/v1/faqs/categories
 * Get FAQ categories list
 */
router.get('/categories', getFaqCategories)

/**
 * GET /api/v1/faqs/:id
 * Get single FAQ by ID
 */
router.get('/:id', getFaqById)

export default router
