// utils/mediaUtils.js
/**
 * Utility functions for safe Media model operations
 * Handles optional userId field gracefully
 */

import { prisma } from '../config/prismaClient.js';
import logger from './logger.js';

/**
 * Safely create Media record with optional userId
 * 
 * @param {Object} mediaData - Media data
 * @param {string} mediaData.fileName - File name
 * @param {string} mediaData.extension - File extension
 * @param {string} mediaData.fileType - File type
 * @param {number} mediaData.size - File size
 * @param {string} mediaData.url - File URL
 * @param {string} mediaData.subDirectory - Sub directory
 * @param {string} [mediaData.userId] - Optional user ID
 * @param {string} [mediaData.sellerName] - Optional seller name
 * @returns {Promise<Object>} Created Media record
 */
export async function createMedia(mediaData) {
  try {
    const { userId, ...rest } = mediaData;
    
    // Only include userId if provided (it's optional in schema)
    const data = {
      ...rest,
      ...(userId && { userId }) // Only add userId if it exists
    };

    const media = await prisma.media.create({
      data
    });

    logger.info('[MediaUtils] Media created', {
      mediaId: media.id,
      hasUserId: !!media.userId,
      fileType: media.fileType
    });

    return media;
  } catch (error) {
    logger.error('[MediaUtils] Error creating media', {
      error: error.message,
      fileName: mediaData.fileName
    });
    throw error;
  }
}

/**
 * Safely query Media records with optional userId filter
 * 
 * @param {Object} options - Query options
 * @param {string} [options.userId] - Optional user ID filter
 * @param {boolean} [options.includeDeleted=false] - Include deleted media
 * @param {string} [options.fileType] - Filter by file type
 * @returns {Promise<Array>} Media records
 */
export async function findMedia(options = {}) {
  const { userId, includeDeleted = false, fileType, ...rest } = options;

  const where = {
    ...rest,
    ...(fileType && { fileType }),
    ...(includeDeleted ? {} : { isDeleted: false }),
    // Only filter by userId if provided (handles optional field)
    ...(userId !== undefined && userId !== null ? { userId } : {})
  };

  const media = await prisma.media.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return media;
}

/**
 * Safely query Media by ID with optional userId check
 * 
 * @param {string} mediaId - Media ID
 * @param {string} [userId] - Optional user ID for authorization check
 * @returns {Promise<Object|null>} Media record or null
 */
export async function findMediaById(mediaId, userId = null) {
  const where = {
    id: mediaId,
    isDeleted: false
  };

  // If userId provided, optionally filter by it (for authorization)
  // Note: userId is optional, so media without userId are accessible to all
  if (userId !== null && userId !== undefined) {
    where.userId = userId;
  }

  const media = await prisma.media.findFirst({
    where
  });

  return media;
}

/**
 * Check if user has access to media
 * 
 * @param {string} mediaId - Media ID
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user has access
 */
export async function hasMediaAccess(mediaId, userId) {
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { userId: true, isDeleted: true }
  });

  if (!media || media.isDeleted) {
    return false;
  }

  // If media has no userId, it's public (accessible to all)
  if (!media.userId) {
    return true;
  }

  // If media has userId, only that user has access
  return media.userId === userId;
}

/**
 * Safely delete Media (soft delete)
 * 
 * @param {string} mediaId - Media ID
 * @param {string} [userId] - Optional user ID for authorization
 * @returns {Promise<Object>} Updated Media record
 */
export async function deleteMedia(mediaId, userId = null) {
  // Check access if userId provided
  if (userId !== null && userId !== undefined) {
    const hasAccess = await hasMediaAccess(mediaId, userId);
    if (!hasAccess) {
      throw new Error('Access denied to this media');
    }
  }

  const media = await prisma.media.update({
    where: { id: mediaId },
    data: {
      isDeleted: true,
      deletedAt: new Date()
    }
  });

  logger.info('[MediaUtils] Media deleted', {
    mediaId: media.id,
    deletedBy: userId || 'system'
  });

  return media;
}
