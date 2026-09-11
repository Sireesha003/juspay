// utils/etaUtils.js
import logger from './logger.js'

/**
 * Calculate estimated time of arrival (ETA) based on distance and average speed
 * 
 * @param {Object} currentLocation - Current location { lat, lng }
 * @param {Object} destinationLocation - Destination location { lat, lng }
 * @param {number} averageSpeed - Average speed in km/h (default: 30)
 * @returns {Object} ETA information
 */
export function calculateETA(currentLocation, destinationLocation, averageSpeed = 30) {
  if (!currentLocation || !destinationLocation) {
    return {
      eta: null,
      distance: null,
      estimatedMinutes: null
    }
  }

  // Calculate distance using Haversine formula
  const distance = calculateDistance(
    currentLocation.lat || currentLocation.latitude,
    currentLocation.lng || currentLocation.longitude,
    destinationLocation.lat || destinationLocation.latitude,
    destinationLocation.lng || destinationLocation.longitude
  )

  // Calculate ETA (distance in km, speed in km/h)
  const estimatedHours = distance / averageSpeed
  const estimatedMinutes = Math.round(estimatedHours * 60)

  // Calculate ETA timestamp
  const eta = new Date()
  eta.setMinutes(eta.getMinutes() + estimatedMinutes)

  logger.debug('[ETAUtils] ETA calculated', {
    distance: distance.toFixed(2),
    averageSpeed,
    estimatedMinutes
  })

  return {
    eta: eta.toISOString(),
    distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
    estimatedMinutes,
    estimatedHours: Math.round(estimatedHours * 100) / 100
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * 
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c

  return distance
}

/**
 * Convert degrees to radians
 */
function toRad(degrees) {
  return (degrees * Math.PI) / 180
}

/**
 * Format ETA for display
 * 
 * @param {number} estimatedMinutes - Estimated minutes
 * @returns {string} Formatted ETA string
 */
export function formatETA(estimatedMinutes) {
  if (!estimatedMinutes || estimatedMinutes < 0) {
    return 'Calculating...'
  }

  if (estimatedMinutes < 60) {
    return `${estimatedMinutes} min`
  }

  const hours = Math.floor(estimatedMinutes / 60)
  const minutes = estimatedMinutes % 60

  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }

  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} min`
}

