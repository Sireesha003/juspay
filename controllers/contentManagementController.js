import { prisma } from '../config/prismaClient.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';

// Default policies fallback in case DB entry isn't created yet by admin
const DEFAULT_POLICIES = {
  TERMS_AND_CONDITIONS: {
    type: 'TERMS_AND_CONDITIONS',
    title: 'Terms of Use',
    content: 'Welcome to VillagKart. By using our app, you agree to our standard terms and conditions.',
    status: 'ACTIVE'
  },
  PRIVACY_POLICY: {
    type: 'PRIVACY_POLICY',
    title: 'Privacy Policy',
    content: 'Your privacy is important to us. VillagKart collects essential data only to fulfill your orders and improve services.',
    status: 'ACTIVE'
  },
  CANCELLATIONS_AND_REFUNDS: {
    type: 'CANCELLATIONS_AND_REFUNDS',
    title: 'Cancellations & Refunds Policy',
    content: 'Orders can be cancelled before dispatch. Refunds for online payments are processed within 24-48 hours.',
    status: 'ACTIVE'
  },
  ABOUT_US: {
    type: 'ABOUT_US',
    title: 'About VillagKart',
    content: 'VillagKart connects local farmers and suppliers directly to consumers with fresh products delivered fast.',
    status: 'ACTIVE'
  }
};

/**
 * Raw query helper to fetch active content policies without Prisma enum strictness.
 */
async function fetchContentFromDb(typeFilter = null) {
  let query = 'SELECT id, type::text, title, content, status::text, "updatedAt" FROM "ContentManagement" WHERE "isDeleted" = false AND status::text = \'ACTIVE\'';
  const params = [];
  if (typeFilter) {
    query += ' AND type::text = $1';
    params.push(typeFilter);
  }
  return await prisma.$queryRawUnsafe(query, ...params);
}

/**
 * GET /api/v1/content/:type
 * Get single dynamic content/policy by type (with fallback support & alias mapping)
 */
export const getContentByType = asyncHandler(async (req, res) => {
  const typeParam = req.params.type || req.query.type || req.body?.type;
  const rawType = (typeParam || '').toString().trim().toUpperCase();

  if (!rawType) {
    return errorResponse(res, 400, 'Content type parameter is required');
  }

  // Map alias inputs to exact ContentType enum values
  let mappedType = rawType;
  if (mappedType === 'TERMS' || mappedType === 'TERMS_OF_USE') mappedType = 'TERMS_AND_CONDITIONS';
  if (mappedType === 'PRIVACY') mappedType = 'PRIVACY_POLICY';
  if (mappedType === 'CANCELLATION' || mappedType === 'REFUND' || mappedType === 'REFUNDS') mappedType = 'CANCELLATIONS_AND_REFUNDS';
  if (mappedType === 'ABOUT') mappedType = 'ABOUT_US';

  try {
    const rows = await fetchContentFromDb(mappedType);
    const data = rows && rows.length > 0 ? rows[0] : null;

    if (!data) {
      if (DEFAULT_POLICIES[mappedType]) {
        return successResponse(
          res,
          200,
          DEFAULT_POLICIES[mappedType],
          'Default policy content retrieved (DB content not yet created by admin)'
        );
      }
      return errorResponse(res, 404, `Content for '${mappedType}' not found`);
    }

    return successResponse(res, 200, data, 'Content fetched successfully');
  } catch (error) {
    logger.error(`[ContentManagement] Error fetching ${mappedType}: ${error.message}`, { error });
    if (DEFAULT_POLICIES[mappedType]) {
      return successResponse(
        res,
        200,
        DEFAULT_POLICIES[mappedType],
        'Fallback content retrieved'
      );
    }
    return errorResponse(res, 500, 'Failed to fetch content policy');
  }
});

/**
 * GET /api/v1/content/all
 * Get all active content policies as a key-value object (ideal for app startup/settings loading)
 */
export const getAllActiveContent = asyncHandler(async (req, res) => {
  try {
    const dbItems = await fetchContentFromDb();

    // Map DB items by type
    const result = { ...DEFAULT_POLICIES };
    if (Array.isArray(dbItems)) {
      for (const item of dbItems) {
        result[item.type] = item;
      }
    }

    return successResponse(res, 200, result, 'All dynamic consumer settings & content policies fetched successfully');
  } catch (error) {
    logger.error(`[ContentManagement] Error fetching all content: ${error.message}`, { error });
    return successResponse(
      res,
      200,
      DEFAULT_POLICIES,
      'Default consumer content settings retrieved'
    );
  }
});

/**
 * POST /api/v1/content
 * Create or update content document by type (upsert)
 */
export const upsertContent = asyncHandler(async (req, res) => {
  const { type: rawType, title, content } = req.body;
  const type = String(rawType).toUpperCase();

  logger.info('[ContentManagement] Upserting content', { type, title });

  try {
    const existingRows = await prisma.$queryRawUnsafe(
      'SELECT id FROM "ContentManagement" WHERE type = $1 AND "isDeleted" = false LIMIT 1',
      type
    );

    let savedItem;
    if (existingRows && existingRows.length > 0) {
      const existingId = existingRows[0].id;
      savedItem = await prisma.contentManagement.update({
        where: { id: existingId },
        data: {
          title: title !== undefined ? title : type,
          content,
          status: 'ACTIVE',
          updatedAt: new Date()
        }
      });
      logger.info('[ContentManagement] Updated existing content', { id: savedItem.id, type });
    } else {
      savedItem = await prisma.contentManagement.create({
        data: {
          type,
          title: title || type,
          content,
          status: 'ACTIVE',
          isDeleted: false
        }
      });
      logger.info('[ContentManagement] Created new content', { id: savedItem.id, type });
    }

    return successResponse(
      res,
      200,
      { content: savedItem },
      `${type} content saved successfully`
    );
  } catch (error) {
    logger.error('[ContentManagement] Upsert content failed', { error: error.message, stack: error.stack });
    return errorResponse(res, 500, 'Failed to save content');
  }
});

/**
 * PUT /api/v1/content/:id
 * Update content document by ID
 */
export const updateContentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, content, status } = req.body;

  logger.info('[ContentManagement] Updating content by ID', { id });

  try {
    const existing = await prisma.contentManagement.findUnique({
      where: { id }
    });

    if (!existing || existing.isDeleted) {
      return errorResponse(res, 404, 'Content record not found');
    }

    const updated = await prisma.contentManagement.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(status !== undefined ? { status } : {}),
        updatedAt: new Date()
      }
    });

    logger.info('[ContentManagement] Content updated by ID successfully', { id });
    return successResponse(
      res,
      200,
      { content: updated },
      'Content updated successfully'
    );
  } catch (error) {
    logger.error('[ContentManagement] Update by ID failed', { error: error.message, stack: error.stack });
    return errorResponse(res, 500, 'Failed to update content');
  }
});

/**
 * DELETE /api/v1/content/:id
 * Soft delete content document by ID
 */
export const deleteContentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info('[ContentManagement] Soft deleting content', { id });

  try {
    const existing = await prisma.contentManagement.findUnique({
      where: { id }
    });

    if (!existing || existing.isDeleted) {
      return errorResponse(res, 404, 'Content record not found');
    }

    await prisma.contentManagement.update({
      where: { id },
      data: {
        isDeleted: true,
        status: 'INACTIVE',
        updatedAt: new Date()
      }
    });

    logger.info('[ContentManagement] Content soft deleted', { id });
    return successResponse(
      res,
      200,
      {},
      'Content deleted successfully'
    );
  } catch (error) {
    logger.error('[ContentManagement] Delete content failed', { error: error.message, stack: error.stack });
    return errorResponse(res, 500, 'Failed to delete content');
  }
});
