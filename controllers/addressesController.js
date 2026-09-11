// controllers/addressesController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'

const MAX_ADDRESSES = 5

/**
 * Format address for response
 */
function formatAddress(address) {
  return {
    id: address.id,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    location: address.location,
    isDefault: address.isDefault
  }
}

/**
 * GET /api/v1/addresses
 * Get user's addresses
 */
export const getAddresses = asyncHandler(async (req, res) => {
  const userId = req.user.id

  logger.info('[Addresses] Fetching addresses', { userId })

  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [
      { isDefault: 'desc' }
    ]
  })

  const formattedAddresses = addresses.map(formatAddress)

  logger.info('[Addresses] Addresses fetched', { userId, count: formattedAddresses.length })

  return successResponse(res, 200, { addresses: formattedAddresses }, 'Addresses fetched successfully')
})

/**
 * POST /api/v1/addresses
 * Add new address
 */
export const createAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { label, line1, line2, city, state, pincode, location, isDefault = false } = req.body

  logger.info('[Addresses] Creating address', { userId, pincode })

  // Check address limit
  const addressCount = await prisma.address.count({
    where: { userId }
  })

  if (addressCount >= MAX_ADDRESSES) {
    logger.warn('[Addresses] Address limit reached', { userId, count: addressCount })
    return errorResponse(res, 400, `Maximum ${MAX_ADDRESSES} addresses allowed. Please delete an existing address first.`)
  }

  // If this is set as default, unset other defaults
  if (isDefault) {
    await prisma.address.updateMany({
      where: {
        userId,
        isDefault: true
      },
      data: {
        isDefault: false
      }
    })
  } else {
    // If this is the first address, set it as default
    if (addressCount === 0) {
      logger.info('[Addresses] Setting first address as default', { userId })
      // Will be set below
    }
  }

  // Create address (set as default if first address or if explicitly requested)
  const address = await prisma.address.create({
    data: {
      userId,
      label: label || null,
      line1,
      line2: line2 || null,
      city,
      state,
      pincode,
      location: location || null,
      isDefault: isDefault || addressCount === 0
    }
  })

  logger.info('[Addresses] Address created', { userId, addressId: address.id })

  return successResponse(res, 201, { address: formatAddress(address) }, 'Address created successfully')
})

/**
 * PATCH /api/v1/addresses/:addressId
 * Update address
 */
export const updateAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { addressId } = req.params
  const { label, line1, line2, city, state, pincode, location, isDefault } = req.body

  logger.info('[Addresses] Updating address', { userId, addressId })

  // Get address
  const address = await prisma.address.findUnique({
    where: { id: addressId }
  })

  if (!address) {
    logger.warn('[Addresses] Address not found', { addressId })
    return errorResponse(res, 404, 'Address not found')
  }

  // Verify ownership
  if (address.userId !== userId) {
    logger.warn('[Addresses] Unauthorized address access', { userId, addressId })
    return errorResponse(res, 403, 'Access denied')
  }

  // If setting as default, unset other defaults
  if (isDefault === true) {
    await prisma.address.updateMany({
      where: {
        userId,
        isDefault: true,
        id: { not: addressId }
      },
      data: {
        isDefault: false
      }
    })
  }

  // Update address
  const updateData = {}
  if (label !== undefined) updateData.label = label || null
  if (line1 !== undefined) updateData.line1 = line1
  if (line2 !== undefined) updateData.line2 = line2 || null
  if (city !== undefined) updateData.city = city
  if (state !== undefined) updateData.state = state
  if (pincode !== undefined) updateData.pincode = pincode
  if (location !== undefined) updateData.location = location || null
  if (isDefault !== undefined) updateData.isDefault = isDefault

  const updatedAddress = await prisma.address.update({
    where: { id: addressId },
    data: updateData
  })

  logger.info('[Addresses] Address updated', { userId, addressId })

  return successResponse(res, 200, { address: formatAddress(updatedAddress) }, 'Address updated successfully')
})

/**
 * DELETE /api/v1/addresses/:addressId
 * Delete address
 */
export const deleteAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { addressId } = req.params

  logger.info('[Addresses] Deleting address', { userId, addressId })

  // Get address
  const address = await prisma.address.findUnique({
    where: { id: addressId }
  })

  if (!address) {
    logger.warn('[Addresses] Address not found', { addressId })
    return errorResponse(res, 404, 'Address not found')
  }

  // Verify ownership
  if (address.userId !== userId) {
    logger.warn('[Addresses] Unauthorized address access', { userId, addressId })
    return errorResponse(res, 403, 'Access denied')
  }

  // Check if it's the only address
  const addressCount = await prisma.address.count({
    where: { userId }
  })

  if (addressCount === 1) {
    logger.warn('[Addresses] Cannot delete last address', { userId })
    return errorResponse(res, 400, 'Cannot delete the last address. Please add another address first.')
  }

  // If it was default, set another address as default
  if (address.isDefault) {
    const anotherAddress = await prisma.address.findFirst({
      where: {
        userId,
        id: { not: addressId }
      }
    })

    if (anotherAddress) {
      await prisma.address.update({
        where: { id: anotherAddress.id },
        data: { isDefault: true }
      })
      logger.info('[Addresses] Set new default address', { userId, newDefaultId: anotherAddress.id })
    }
  }

  // Delete address
  await prisma.address.delete({
    where: { id: addressId }
  })

  logger.info('[Addresses] Address deleted', { userId, addressId })

  return successResponse(res, 200, { message: 'Address deleted successfully' }, 'Address deleted successfully')
})

/**
 * PATCH /api/v1/addresses/:addressId/set-default
 * Set address as default
 */
export const setDefaultAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const { addressId } = req.params

  logger.info('[Addresses] Setting default address', { userId, addressId })

  // Get address
  const address = await prisma.address.findUnique({
    where: { id: addressId }
  })

  if (!address) {
    logger.warn('[Addresses] Address not found', { addressId })
    return errorResponse(res, 404, 'Address not found')
  }

  // Verify ownership
  if (address.userId !== userId) {
    logger.warn('[Addresses] Unauthorized address access', { userId, addressId })
    return errorResponse(res, 403, 'Access denied')
  }

  // Unset other defaults
  await prisma.address.updateMany({
    where: {
      userId,
      isDefault: true,
      id: { not: addressId }
    },
    data: {
      isDefault: false
    }
  })

  // Set this address as default
  const updatedAddress = await prisma.address.update({
    where: { id: addressId },
    data: { isDefault: true }
  })

  logger.info('[Addresses] Default address set', { userId, addressId })

  return successResponse(res, 200, { address: formatAddress(updatedAddress) }, 'Default address set successfully')
})

