/**
 * Enforce that a delivery address is serviceable by the cart’s warehouse:
 * pincode in warehouse.servicePincodes OR straight-line distance within radius (default 12 km).
 */
import { prisma } from '../config/prismaClient.js'
import { calculateDeliveryDistance } from './distanceUtils.js'
import logger from './logger.js'

const DEFAULT_SERVICE_RADIUS_KM = 12

export function getWarehouseDeliveryRadiusKm() {
  const n = parseFloat(process.env.WAREHOUSE_DELIVERY_RADIUS_KM)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SERVICE_RADIUS_KM
}

function normalizePincode(pincode) {
  if (pincode == null) return ''
  return String(pincode).trim()
}

/**
 * @param {string} warehouseId
 * @param {{ pincode?: string | null, location?: unknown }} address
 * @throws {Error} when address is outside service area or warehouse inactive
 */
export async function assertAddressServiceableForWarehouse(warehouseId, address) {
  if (!warehouseId || !address) {
    throw new Error('Address and warehouse are required for delivery')
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: {
      id: true,
      name: true,
      isActive: true,
      servicePincodes: true,
      location: true,
    },
  })

  if (!warehouse) {
    throw new Error('Warehouse not found')
  }
  if (!warehouse.isActive) {
    throw new Error('This store is not active. Please choose another store.')
  }

  const pinNorm = normalizePincode(address.pincode)
  const pincodes = Array.isArray(warehouse.servicePincodes) ? warehouse.servicePincodes : []
  const pincodeMatches =
    pincodes.length > 0 && pincodes.some((p) => normalizePincode(p) === pinNorm)

  let withinRadius = false
  let distanceKm = null
  if (warehouse.location && address.location) {
    distanceKm = calculateDeliveryDistance(warehouse.location, address.location)
    const radiusKm = getWarehouseDeliveryRadiusKm()
    if (distanceKm != null && distanceKm <= radiusKm) {
      withinRadius = true
    }
  }

  if (pincodeMatches || withinRadius) {
    logger.debug('[WarehouseServiceability] OK', {
      warehouseId,
      pincodeMatches,
      withinRadius,
      distanceKm,
    })
    return
  }

  logger.info('[WarehouseServiceability] Address not serviceable', {
    warehouseId,
    pincode: pinNorm,
    hasWarehouseLocation: Boolean(warehouse.location),
    hasAddressLocation: Boolean(address.location),
    distanceKm,
    radiusKm: getWarehouseDeliveryRadiusKm(),
    listedPincodes: pincodes.length,
  })

  throw new Error(
    'This delivery address is not in the selected store’s service area. Use an address within the store’s delivery zone or choose a different store.'
  )
}

/**
 * Check if a pincode is in the selected warehouse’s service list (same rule as order checkout).
 * Does not use distance fallback (caller must pass coordinates via assertAddressServiceableForWarehouse for that).
 *
 * @param {string} warehouseId
 * @param {string | null | undefined} pincode
 * @returns {Promise<{ serviceable: boolean, reason: string, message: string }>}
 */
export async function evaluatePincodeWarehouseServiceability(warehouseId, pincode) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: {
      id: true,
      isActive: true,
      approvalStatus: true,
      servicePincodes: true,
    },
  })

  if (!warehouse) {
    return {
      serviceable: false,
      reason: 'Selected warehouse or store could not be found',
      message:
        'Customer delivery address is not within the selected warehouse/store radius',
    }
  }

  if (!warehouse.isActive) {
    return {
      serviceable: false,
      reason: 'This store is not active. Please choose another store.',
      message:
        'Customer delivery address is not within the selected warehouse/store radius',
    }
  }

  if (warehouse.approvalStatus !== 'APPROVED') {
    return {
      serviceable: false,
      reason: 'Selected store is not available for delivery yet',
      message:
        'Customer delivery address is not within the selected warehouse/store radius',
    }
  }

  const pinNorm = normalizePincode(pincode)
  if (!pinNorm) {
    return {
      serviceable: false,
      reason: 'Delivery address is outside the selected warehouse/store service area',
      message:
        'Customer delivery address is not within the selected warehouse/store radius',
    }
  }

  const pincodes = Array.isArray(warehouse.servicePincodes)
    ? warehouse.servicePincodes
    : []
  const pincodeMatches = pincodes.some((p) => normalizePincode(p) === pinNorm)

  if (pincodeMatches) {
    return {
      serviceable: true,
      reason: 'Pincode is within the serviceable area',
      message: 'Serviceable',
    }
  }

  return {
    serviceable: false,
    reason:
      'Delivery address is outside the selected warehouse/store service area',
    message:
      'Customer delivery address is not within the selected warehouse/store radius',
  }
}
