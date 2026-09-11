/**
 * Chat API - Chat Management
 *
 * This router handles all chat-related operations including:
 * - Sending messages
 * - Getting chat history for orders
 * - Getting all conversations
 * - Marking messages as read
 *
 * INTEGRATION:
 * 1. Mount this router in your main app (e.g., services/apiRoutes.js):
 *    import chatRouter from './routes/chat.router.js';
 *    app.use('/api/v1/chat', chatRouter);
 */

import express from 'express'
import { validationResult } from 'express-validator'
import { validationErrorResponse } from '../utils/responseHelper.js'
import {
  sendMessageValidation,
  messageIdValidation,
  orderIdValidation,
  conversationsValidation
} from '../validations/chatValidation.js'
import {
  sendMessage,
  getOrderChat,
  getConversations,
  markMessageAsRead,
  markOrderChatAsRead
} from '../controllers/chatController.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return validationErrorResponse(res, errors)
  }
  next()
}

// All chat routes require authentication
router.use(authMiddleware)

/**
 * POST /api/v1/chat
 * Send a chat message
 */
router.post('/', sendMessageValidation, validate, sendMessage)

/**
 * GET /api/v1/chat/orders/:orderId
 * Get chat history for an order
 */
router.get('/orders/:orderId', orderIdValidation, validate, getOrderChat)

/**
 * GET /api/v1/chat/conversations
 * Get all conversations for the user
 */
router.get('/conversations', conversationsValidation, validate, getConversations)

/**
 * PATCH /api/v1/chat/:messageId/read
 * Mark message as read
 */
router.patch('/:messageId/read', messageIdValidation, validate, markMessageAsRead)

/**
 * PATCH /api/v1/chat/orders/:orderId/read-all
 * Mark all messages in an order chat as read
 */
router.patch('/orders/:orderId/read-all', orderIdValidation, validate, markOrderChatAsRead)

export default router



