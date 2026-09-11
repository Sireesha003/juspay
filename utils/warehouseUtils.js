// utils/warehouseUtils.js
// Shared utility functions for warehouse selection and geolocation

/**
 * Extract latitude and longitude from warehouse location JSON
 * Supports both { latitude, longitude } and { lat, lng } formats
 */
export function extractLatLngFromLocation(locationJson) {
  if (!locationJson || typeof locationJson !== 'object') {
    return null
  }

  // Try { latitude, longitude } format
  if (locationJson.latitude !== undefined && locationJson.longitude !== undefined) {
    return {
      lat: parseFloat(locationJson.latitude),
      lng: parseFloat(locationJson.longitude)
    }
  }

  // Try { lat, lng } format
  if (locationJson.lat !== undefined && locationJson.lng !== undefined) {
    return {
      lat: parseFloat(locationJson.lat),
      lng: parseFloat(locationJson.lng)
    }
  }

  return null
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees) {
  return degrees * (Math.PI / 180)
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 === null || lat1 === undefined || isNaN(lat1) ||
    lon1 === null || lon1 === undefined || isNaN(lon1) ||
    lat2 === null || lat2 === undefined || isNaN(lat2) ||
    lon2 === null || lon2 === undefined || isNaN(lon2)
  ) {
    return Infinity
  }

  const R = 6371 // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c

  return distance
}

/**
 * Prisma Decimal can be object or string; normalize to number or null
 */
export function toNumberOrNull(value) {
  if (value == null) return null
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'object' && typeof value.toNumber === 'function')
    return value.toNumber()
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

/**
 * Calculate the minimum distance between user coordinates and a warehouse.
 * Checks all warehouseLocations and falls back to warehouse.location JSON.
 */
export function calculateWarehouseMinDistance(warehouse, userLat, userLng) {
  if (!warehouse || userLat == null || userLng == null || isNaN(userLat) || isNaN(userLng)) {
    return null
  }

  let minDistance = Infinity
  let closestLocation = null

  // 1. Check all warehouseLocations
  if (Array.isArray(warehouse.warehouseLocations) && warehouse.warehouseLocations.length > 0) {
    for (const loc of warehouse.warehouseLocations) {
      const lat = toNumberOrNull(loc.latitude)
      const lng = toNumberOrNull(loc.longitude)
      if (lat !== null && lng !== null && lat !== 0 && lng !== 0) {
        const d = haversineDistanceKm(userLat, userLng, lat, lng)
        if (d < minDistance) {
          minDistance = d
          closestLocation = loc
        }
      }
    }
  }

  // 2. Fallback to location JSON if no valid location found in warehouseLocations
  if (minDistance === Infinity && warehouse.location) {
    const coords = extractLatLngFromLocation(warehouse.location)
    if (coords && !isNaN(coords.lat) && !isNaN(coords.lng) && coords.lat !== 0 && coords.lng !== 0) {
      const d = haversineDistanceKm(userLat, userLng, coords.lat, coords.lng)
      if (d < minDistance) {
        minDistance = d
      }
    }
  }

  if (minDistance === Infinity) {
    return null
  }

  return {
    distance: minDistance,
    closestLocation
  }
}

/**
 * Find nearest warehouse from a list based on coordinates
 */
export function findNearestWarehouse(warehouses, userLat, userLng) {
  let nearest = null
  let minDistance = Infinity

  for (const warehouse of warehouses) {
    const distInfo = calculateWarehouseMinDistance(warehouse, userLat, userLng)
    if (distInfo && distInfo.distance < minDistance) {
      minDistance = distInfo.distance
      nearest = { warehouse, distance: distInfo.distance, closestLocation: distInfo.closestLocation }
    }
  }

  return nearest
}

/**
 * Sort warehouses by distance from nearest to farthest
 */
export function sortWarehousesByDistance(warehouses, userLat, userLng) {
  if (!Array.isArray(warehouses)) return []

  const hasCoords = userLat != null && userLng != null && !isNaN(userLat) && !isNaN(userLng)

  if (!hasCoords) {
    return warehouses.map(w => ({
      warehouse: w,
      distance: null,
      closestLocation: Array.isArray(w.warehouseLocations) && w.warehouseLocations[0] ? w.warehouseLocations[0] : null
    }))
  }

  const list = warehouses.map(w => {
    const distInfo = calculateWarehouseMinDistance(w, userLat, userLng)
    return {
      warehouse: w,
      distance: distInfo ? distInfo.distance : null,
      closestLocation: distInfo ? distInfo.closestLocation : (Array.isArray(w.warehouseLocations) && w.warehouseLocations[0] ? w.warehouseLocations[0] : null)
    }
  })

  return list.sort((a, b) => {
    if (a.distance == null && b.distance == null) return 0
    if (a.distance == null) return 1
    if (b.distance == null) return -1
    return a.distance - b.distance
  })
}
