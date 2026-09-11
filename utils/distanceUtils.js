// utils/distanceUtils.js
import { haversineDistanceKm } from './warehouseUtils.js'
import logger from './logger.js'

/**
 * Calculate distance between warehouse and delivery address
 * 
 * @param {Object} warehouseLocation - Warehouse location { latitude, longitude } or { lat, lng }
 * @param {Object} deliveryLocation - Delivery address location { latitude, longitude } or { lat, lng }
 * @returns {number} Distance in kilometers
 */
export function calculateDeliveryDistance(warehouseLocation, deliveryLocation) {
  if (!warehouseLocation || !deliveryLocation) {
    logger.warn('[DistanceUtils] Missing location data', {
      hasWarehouse: !!warehouseLocation,
      hasDelivery: !!deliveryLocation
    })
    return null
  }

  // Extract coordinates
  const warehouseLat = warehouseLocation.latitude || warehouseLocation.lat
  const warehouseLng = warehouseLocation.longitude || warehouseLocation.lng
  const deliveryLat = deliveryLocation.latitude || deliveryLocation.lat
  const deliveryLng = deliveryLocation.longitude || deliveryLocation.lng

  if (!warehouseLat || !warehouseLng || !deliveryLat || !deliveryLng) {
    logger.warn('[DistanceUtils] Invalid coordinates', {
      warehouse: { lat: warehouseLat, lng: warehouseLng },
      delivery: { lat: deliveryLat, lng: deliveryLng }
    })
    return null
  }

  try {
    const distance = haversineDistanceKm(
      parseFloat(warehouseLat),
      parseFloat(warehouseLng),
      parseFloat(deliveryLat),
      parseFloat(deliveryLng)
    )

    // Round to 1 decimal place
    const roundedDistance = Math.round(distance * 10) / 10

    logger.debug('[DistanceUtils] Distance calculated', {
      distance: roundedDistance,
      warehouse: { lat: warehouseLat, lng: warehouseLng },
      delivery: { lat: deliveryLat, lng: deliveryLng }
    })

    return roundedDistance
  } catch (error) {
    logger.error('[DistanceUtils] Error calculating distance', {
      error: error.message,
      warehouseLocation,
      deliveryLocation
    })
    return null
  }
}

/**
 * Calculate fast delivery ETA based on distance
 * 
 * @param {number} distance - Distance in kilometers
 * @returns {Object} ETA information with min/max time range
 */
export function calculateFastDeliveryETA(distance) {
  if (!distance || distance <= 0) {
    return {
      min: null,
      max: null,
      display: 'N/A'
    }
  }

  // Average speeds (km/h)
  const minSpeed = 15 // Slow traffic
  const maxSpeed = 25 // Clear road
  const avgSpeed = 20 // Average

  // Calculate time in minutes
  const minTime = Math.round((distance / maxSpeed) * 60)
  const maxTime = Math.round((distance / minSpeed) * 60)
  const avgTime = Math.round((distance / avgSpeed) * 60)

  // Format for display
  const display = `${minTime} - ${maxTime} min`

  logger.debug('[DistanceUtils] Fast delivery ETA calculated', {
    distance,
    minTime,
    maxTime,
    avgTime,
    display
  })

  return {
    min: minTime,
    max: maxTime,
    avg: avgTime,
    display
  }
}

