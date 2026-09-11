import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'


/**
 * CREATE BANNER
 */
export const createBanner = async (req, res) => {
  try {
    logger.info("[BANNER] Create request", req.body);

    const banner = await prisma.banner.create({
      data: req.body,
    });

    logger.info("[BANNER] Created", { id: banner.id });
    return successResponse(res, 201, banner, "Banner created successfully");

  } catch (err) {
    logger.error("[BANNER] Create failed", err);
    return errorResponse(res, 500, "Failed to create banner");
  }
};


/**
 * GET ALL BANNERS
 */
export const getAllBanners = async (req, res) => {
  try {
    const { section, bannerType, isActive, warehouseId } = req.query;

    // Frontend may send section or bannerType
    const finalBannerType = bannerType || section;

    const where = {
      ...(finalBannerType && { bannerType: finalBannerType }),
      ...(isActive !== undefined && { isActive: isActive === "true" }),
      ...(warehouseId && { warehouseId }),
    };

    logger.info("[BANNER] Fetching all banners", where);

    const banners = await prisma.banner.findMany({
      where,
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });

    if (req.isTranslated) {

    }

    const successMessage = req.t ? req.t("BANNER_FETCHED") : "Banners fetched successfully";
    return successResponse(res, 200, banners, successMessage);
  } catch (err) {
    logger.error("[BANNER] Fetch failed", err);
    return errorResponse(res, 500, "Failed to fetch banners");
  }
};


/**
 * GET BANNER BY ID
 */
export const getBannerById = async (req, res) => {
  try {
    const { id } = req.params;

    logger.info("[BANNER] Fetch by id", { id });

    const banner = await prisma.banner.findUnique({ where: { id } });

    if (!banner) {
      return errorResponse(res, 404, "Banner not found");
    }

    if (req.isTranslated) {

    }

    const successMessage = req.t ? req.t("BANNER_FETCHED") : "Banner fetched successfully";
    return successResponse(res, 200, banner, successMessage);

  } catch (err) {
    logger.error("[BANNER] Get by id failed", err);
    return errorResponse(res, 500, "Failed to fetch banner");
  }
};

/**
 * SOFT DELETE BANNER (only isActive = false)
 */
export const softDeleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    logger.info("[BANNER] Soft delete request", { id });

    const banner = await prisma.banner.findUnique({
      where: { id },
      select: { id: true, isActive: true }
    });

    if (!banner) {
      return errorResponse(res, 404, "Banner not found");
    }

    if (!banner.isActive) {
      return errorResponse(res, 400, "Banner already inactive");
    }

    const deletedBanner = await prisma.banner.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        title: true,
        isActive: true,
        updatedAt: true
      }
    });

    logger.info("[BANNER] Soft deleted", { id });
    return successResponse(res, 200, deletedBanner, "Banner deleted successfully");

  } catch (err) {
    logger.error("[BANNER] Soft delete failed", err);
    return errorResponse(res, 500, "Failed to delete banner");
  }
};

export const restoreBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await prisma.banner.findUnique({
      where: { id },
      select: { id: true, isActive: true }
    });

    if (!banner) return errorResponse(res, 404, "Banner not found");
    if (banner.isActive) return errorResponse(res, 400, "Banner already active");

    const restored = await prisma.banner.update({
      where: { id },
      data: { isActive: true }
    });

    return successResponse(res, 200, restored, "Banner restored successfully");

  } catch (err) {
    logger.error("[BANNER] Restore failed", err);
    return errorResponse(res, 500, "Failed to restore banner");
  }
};


/**
 * UPDATE BANNER
 */
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    logger.info("[BANNER] Update request", { id, data });

    // Check if banner exists
    const existingBanner = await prisma.banner.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existingBanner) {
      return errorResponse(res, 404, "Banner not found");
    }

    // Prevent unsafe updates
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const updatedBanner = await prisma.banner.update({
      where: { id },
      data,
    });

    logger.info("[BANNER] Updated", { id });
    return successResponse(res, 200, updatedBanner, "Banner updated successfully");

  } catch (err) {
    logger.error("[BANNER] Update failed", err);
    return errorResponse(res, 500, "Failed to update banner");
  }
};

