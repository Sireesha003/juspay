// controllers/chatController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

/**
 * Format chat message for response
 */
function formatChatMessage(message) {
  return {
    id: message.id,
    orderId: message.orderId,
    senderId: message.senderId,
    receiverId: message.receiverId,
    message: message.message,
    messageType: message.messageType,
    mediaUrl: message.mediaUrl,
    isRead: message.isRead,
    readAt: message.readAt,
    createdAt: message.createdAt,
    sender: message.sender ? {
      id: message.sender.id,
      name: message.sender.name,
      avatar: message.sender.avatar
    } : null,
    receiver: message.receiver ? {
      id: message.receiver.id,
      name: message.receiver.name,
      avatar: message.receiver.avatar
    } : null,
    order: message.order ? {
      id: message.order.id,
      orderNumber: message.order.orderNumber,
      status: message.order.status
    } : null
  }
}

/**
 * POST /api/v1/chat
 * Send a chat message
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId, receiverId, message, messageType = 'TEXT', mediaUrl } = req.body

  logger.info('[Chat] Sending message', { userId, orderId, receiverId, messageType })

  // Validate receiver exists
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { id: true, name: true, role: true }
  })

  if (!receiver) {
    return errorResponse(res, 404, 'Receiver not found')
  }

  // If orderId is provided, validate order exists and user has access
  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, consumerId: true, agentId: true }
    })

    if (!order) {
      return errorResponse(res, 404, 'Order not found')
    }

    // User must be either consumer or agent of the order
    if (order.consumerId !== userId && order.agentId !== userId) {
      return errorResponse(res, 403, 'Access denied to this order')
    }

    // Receiver must be the other party (consumer or agent)
    if (receiverId !== order.consumerId && receiverId !== order.agentId) {
      return errorResponse(res, 400, 'Receiver must be the consumer or agent of this order')
    }
  }

  // Create chat message
  const chatMessage = await prisma.chat.create({
    data: {
      orderId: orderId || null,
      senderId: userId,
      receiverId,
      message,
      messageType,
      mediaUrl: mediaUrl || null,
      isRead: false
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      },
      receiver: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      },
      order: orderId ? {
        select: {
          id: true,
          orderNumber: true,
          status: true
        }
      } : false
    }
  })

  logger.info('[Chat] Message sent', { userId, messageId: chatMessage.id })

  return successResponse(res, 201, { message: formatChatMessage(chatMessage) }, 'Message sent successfully')
})

/**
 * GET /api/v1/chat/orders/:orderId
 * Get chat history for an order
 */
export const getOrderChat = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params
  const { page: pageParam, limit: limitParam } = req.query

  // Validate and constrain pagination parameters
  const pageNum = Math.max(1, parseInt(pageParam) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Chat] Fetching order chat', { userId, orderId, page: pageNum, limit: limitNum })

  // Validate order exists and user has access
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, consumerId: true, agentId: true }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  // User must be either consumer or agent of the order
  if (order.consumerId !== userId && order.agentId !== userId) {
    return errorResponse(res, 403, 'Access denied to this order')
  }

  const skip = (pageNum - 1) * limitNum
  const take = limitNum

  const [messages, total] = await Promise.all([
    prisma.chat.findMany({
      where: { orderId },
      skip,
      take,
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        }
      }
    }),
    prisma.chat.count({ where: { orderId } })
  ])

  // Mark messages as read if user is the receiver
  const unreadMessageIds = messages
    .filter(msg => msg.receiverId === userId && !msg.isRead)
    .map(msg => msg.id)

  if (unreadMessageIds.length > 0) {
    await prisma.chat.updateMany({
      where: {
        id: { in: unreadMessageIds }
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    })
  }

  const formattedMessages = messages.map(msg => formatChatMessage(msg))
  const totalPages = Math.ceil(total / take)

  return successResponse(res, 200, {
    messages: formattedMessages,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  }, 'Chat messages fetched successfully')
})

/**
 * GET /api/v1/chat/conversations
 * Get all conversations for the user
 */
export const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { page: pageParam, limit: limitParam } = req.query

  // Validate and constrain pagination parameters
  const pageNum = Math.max(1, parseInt(pageParam) || 1)
  const limitNum = Math.min(
    Math.max(1, parseInt(limitParam) || DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  )

  logger.info('[Chat] Fetching conversations', { userId, page: pageNum, limit: limitNum })

  // Get all messages where user is sender or receiver
  // Note: This fetches all messages to group conversations - could be optimized for large datasets
  const allMessages = await prisma.chat.findMany({
    where: {
      OR: [
        { senderId: userId },
        { receiverId: userId }
      ]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          avatar: true,
          role: true
        }
      },
      receiver: {
        select: {
          id: true,
          name: true,
          avatar: true,
          role: true
        }
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true
        }
      }
    }
  })

  // Group messages by conversation (orderId + otherUserId)
  const conversationMap = new Map()

  allMessages.forEach((message) => {
    const otherUserId = message.senderId === userId ? message.receiverId : message.senderId
    const conversationKey = `${message.orderId || 'no-order'}-${otherUserId}`

    if (!conversationMap.has(conversationKey)) {
      conversationMap.set(conversationKey, {
        orderId: message.orderId,
        otherUserId,
        lastMessage: message,
        unreadCount: 0
      })
    }

    // Count unread messages
    if (message.receiverId === userId && !message.isRead) {
      const conv = conversationMap.get(conversationKey)
      conv.unreadCount++
    }
  })

  // Convert map to array and get user details
  const conversationList = await Promise.all(
    Array.from(conversationMap.values()).map(async (conv) => {
      const otherUser = await prisma.user.findUnique({
        where: { id: conv.otherUserId },
        select: { id: true, name: true, avatar: true, role: true }
      })

      return {
        orderId: conv.orderId,
        order: conv.lastMessage.order ? {
          id: conv.lastMessage.order.id,
          orderNumber: conv.lastMessage.order.orderNumber,
          status: conv.lastMessage.order.status
        } : null,
        otherUser: otherUser ? {
          id: otherUser.id,
          name: otherUser.name,
          avatar: otherUser.avatar,
          role: otherUser.role
        } : null,
        lastMessage: {
          id: conv.lastMessage.id,
          message: conv.lastMessage.message,
          messageType: conv.lastMessage.messageType,
          createdAt: conv.lastMessage.createdAt,
          isRead: conv.lastMessage.isRead
        },
        unreadCount: conv.unreadCount
      }
    })
  )

  // Sort by last message time (most recent first)
  conversationList.sort((a, b) => {
    return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt)
  })

  // Apply pagination
  const skip = (pageNum - 1) * limitNum
  const paginatedConversations = conversationList.slice(skip, skip + limitNum)
  const total = conversationList.length
  const totalPages = Math.ceil(total / limitNum)

  return successResponse(res, 200, {
    conversations: paginatedConversations,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  }, 'Conversations fetched successfully')
})

/**
 * PATCH /api/v1/chat/:messageId/read
 * Mark message as read
 */
export const markMessageAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { messageId } = req.params

  logger.info('[Chat] Marking message as read', { userId, messageId })

  const message = await prisma.chat.findUnique({
    where: { id: messageId },
    select: { id: true, receiverId: true, isRead: true }
  })

  if (!message) {
    return errorResponse(res, 404, 'Message not found')
  }

  if (message.receiverId !== userId) {
    return errorResponse(res, 403, 'Access denied')
  }

  if (message.isRead) {
    return successResponse(res, 200, { message: { id: messageId, isRead: true } }, 'Message already read')
  }

  const updatedMessage = await prisma.chat.update({
    where: { id: messageId },
    data: {
      isRead: true,
      readAt: new Date()
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      },
      receiver: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      }
    }
  })

  logger.info('[Chat] Message marked as read', { userId, messageId })

  return successResponse(res, 200, { message: formatChatMessage(updatedMessage) }, 'Message marked as read')
})

/**
 * PATCH /api/v1/chat/orders/:orderId/read-all
 * Mark all messages in an order chat as read
 */
export const markOrderChatAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { orderId } = req.params

  logger.info('[Chat] Marking order chat as read', { userId, orderId })

  // Validate order exists and user has access
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, consumerId: true, agentId: true }
  })

  if (!order) {
    return errorResponse(res, 404, 'Order not found')
  }

  // User must be either consumer or agent of the order
  if (order.consumerId !== userId && order.agentId !== userId) {
    return errorResponse(res, 403, 'Access denied to this order')
  }

  const result = await prisma.chat.updateMany({
    where: {
      orderId,
      receiverId: userId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  })

  logger.info('[Chat] Order chat marked as read', { userId, orderId, count: result.count })

  return successResponse(res, 200, { 
    orderId,
    markedCount: result.count 
  }, `${result.count} messages marked as read`)
})

