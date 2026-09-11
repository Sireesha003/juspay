import { prisma } from "../config/prismaClient.js";
import { asyncHandler } from "../middlewares/errorMiddleware.js";
import { successResponse, errorResponse } from "../utils/responseHelper.js";
import { findNearestWarehouse } from "../utils/warehouseUtils.js";
import logger from "../utils/logger.js";

/**
 * Enrich bundle object with computed expiry metadata
 */
export function enrichBundleWithExpiry(bundle) {
  const now = new Date();
  let earliestExpiry = null;
  let activeItemsCount = 0;
  let hasExpiredItem = false;

  const rawItems = bundle.items || [];
  const items = rawItems
    .filter((item) => item.product && item.product.status === 'APPROVED' && item.product.isActive)
    .map((item) => {
      const flashEnd = item.product?.flashDealEnd ? new Date(item.product.flashDealEnd) : null;
      const isItemExpired = Boolean(flashEnd && flashEnd <= now);

      if (isItemExpired) {
        hasExpiredItem = true;
      } else {
        activeItemsCount++;
      }

      if (flashEnd && (!earliestExpiry || flashEnd < earliestExpiry)) {
        earliestExpiry = flashEnd;
      }

      return {
        ...item,
        isExpired: isItemExpired,
        flashDealEnd: item.product?.flashDealEnd || null
      };
    });

  const isBundleExpired =
    bundle.status === 'EXPIRED' ||
    !bundle.isActive ||
    hasExpiredItem ||
    Boolean(earliestExpiry && earliestExpiry <= now) ||
    activeItemsCount === 0 ||
    items.length === 0;

  return {
    ...bundle,
    expiresAt: earliestExpiry ? earliestExpiry.toISOString() : null,
    isExpired: isBundleExpired,
    dealStatus: isBundleExpired ? 'EXPIRED' : 'ACTIVE',
    items
  };
}

/**
 * @desc    Get all active or specified bundles
 * @route   GET /api/v1/bundles
 * @access  Public
 */
export const getActiveBundles = asyncHandler(async (req, res) => {
  try {
    const pincode = req.query.pincode || req.query.pin;
    const warehouseId = req.query.warehouseId || req.query.storeId || req.headers?.['x-warehouse-id'];
    const includeExpired = req.query.includeExpired === 'true' || req.query.showAll === 'true' || req.query.status === 'EXPIRED';

    let resolvedWarehouseId = warehouseId;

    if (!resolvedWarehouseId && pincode) {
      const warehouse = await prisma.warehouse.findFirst({
        where: {
          servicePincodes: {
            has: pincode
          },
          isActive: true
        },
        select: { id: true }
      });
      if (warehouse) {
        resolvedWarehouseId = warehouse.id;
      }
    }

    if (!resolvedWarehouseId && (req.query.lat || req.query.latitude) && (req.query.lng || req.query.longitude)) {
      const lat = parseFloat(req.query.lat || req.query.latitude);
      const lng = parseFloat(req.query.lng || req.query.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        const warehouses = await prisma.warehouse.findMany({
          where: { isActive: true, location: { not: null } },
          select: { id: true, location: true }
        });
        const nearest = findNearestWarehouse(warehouses, lat, lng);
        if (nearest && nearest.warehouse) {
          resolvedWarehouseId = nearest.warehouse.id;
        }
      }
    }

    const productWhere = {
      status: 'APPROVED',
      isActive: true,
      ...(resolvedWarehouseId
        ? {
            OR: [
              { warehouseId: resolvedWarehouseId },
              { warehouseId: null }
            ]
          }
        : {})
    };

    const where = {
      isActive: includeExpired ? undefined : true,
      status: includeExpired
        ? { in: ['ACTIVE', 'APPROVED', 'EXPIRED'] }
        : { in: ['ACTIVE', 'APPROVED'] },
      ...(resolvedWarehouseId
        ? {
            OR: [
              { warehouseId: resolvedWarehouseId },
              { warehouseId: null },
              { warehouseId: '' }
            ]
          }
        : {}),
      items: {
        some: {
          product: productWhere
        }
      }
    };

    const bundles = await prisma.bundle.findMany({
      where,
      include: {
        items: {
          where: {
            product: productWhere
          },
          include: {
            product: { 
              select: { 
                id: true, 
                name: true, 
                slug: true,
                images: true, 
                price: true,
                mrp: true,
                finalPrice: true,
                unit: true,
                unitType: true,
                stock: true,
                status: true,
                isActive: true,
                flashDealEnd: true,
                warehouseId: true
              } 
            },
            productVariant: {
              select: {
                id: true,
                variantName: true,
                sellingPrice: true,
                mrp: true,
                stockQuantity: true,
                unit: true,
                unitType: true,
                status: true,
                isEnabled: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const enrichedBundles = bundles
      .map(enrichBundleWithExpiry)
      .filter((b) => {
        if (!Array.isArray(b.items) || b.items.length === 0) return false;
        if (!includeExpired && b.isExpired) return false;
        return true;
      });

    return successResponse(res, 200, enrichedBundles, "Bundles fetched successfully");
  } catch (error) {
    logger.error(`[Consumer BundleController] Error fetching active bundles: ${error.message}`);
    return errorResponse(res, 500, "Error fetching active bundles");
  }
});

/**
 * @desc    Get single bundle by ID
 * @route   GET /api/v1/bundles/:id
 * @access  Public
 */
export const getBundleById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const bundle = await prisma.bundle.findUnique({
      where: { id },
      include: {
        items: {
          where: {
            product: {
              status: 'APPROVED',
              isActive: true
            }
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: true,
                price: true,
                mrp: true,
                finalPrice: true,
                unit: true,
                unitType: true,
                stock: true,
                status: true,
                isActive: true,
                flashDealEnd: true,
                warehouseId: true
              }
            },
            productVariant: {
              select: {
                id: true,
                variantName: true,
                sellingPrice: true,
                mrp: true,
                stockQuantity: true,
                unit: true,
                unitType: true,
                status: true,
                isEnabled: true
              }
            }
          }
        }
      }
    });

    if (!bundle) {
      return errorResponse(res, 404, "Bundle not found");
    }

    const enriched = enrichBundleWithExpiry(bundle);
    return successResponse(res, 200, enriched, "Bundle details fetched successfully");
  } catch (error) {
    logger.error(`[Consumer BundleController] Error fetching bundle by ID: ${error.message}`);
    return errorResponse(res, 500, "Error fetching bundle details");
  }
});


