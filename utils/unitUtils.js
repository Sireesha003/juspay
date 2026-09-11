// utils/unitUtils.js
/**
 * Utility functions for handling product units and StandardUnits enum conversion
 */

/**
 * Maps Product.unit (String) to StandardUnits enum value
 * Product.unit is a free-form string, OrderItem.unit is a StandardUnits enum
 * 
 * @param {string} productUnit - The unit string from Product model (e.g., "kg", "liter", "piece")
 * @returns {string} StandardUnits enum value (e.g., "KILOGRAM", "LITER", "PIECE")
 */
export function mapProductUnitToStandardUnits(productUnit) {
  if (!productUnit || typeof productUnit !== 'string') {
    return 'PIECE' // Default fallback
  }

  // Normalize the input: lowercase and trim
  const normalized = productUnit.toLowerCase().trim()

  // Mapping from common product unit strings to StandardUnits enum values
  const unitMapping = {
    // Pieces/Count units
    'piece': 'PIECE',
    'pieces': 'PIECE',
    'pc': 'PIECE',
    'pcs': 'PIECE',
    'pack': 'PACK',
    'packs': 'PACK',
    'box': 'BOX',
    'boxes': 'BOX',
    'set': 'SET',
    'sets': 'SET',
    'pair': 'PAIR',
    'pairs': 'PAIR',
    'dozen': 'DOZEN',
    'dozens': 'DOZEN',

    // Weight units
    'gram': 'GRAM',
    'grams': 'GRAM',
    'g': 'GRAM',
    'kg': 'KILOGRAM',
    'kilogram': 'KILOGRAM',
    'kilograms': 'KILOGRAM',
    'kilo': 'KILOGRAM',
    'ton': 'TON',
    'tons': 'TON',
    'tonne': 'TON',
    'tonnes': 'TON',
    'ounce': 'OUNCE',
    'ounces': 'OUNCE',
    'oz': 'OUNCE',
    'pound': 'POUND',
    'pounds': 'POUND',
    'lb': 'POUND',
    'lbs': 'POUND',

    // Length units
    'millimeter': 'MILLIMETER',
    'millimeters': 'MILLIMETER',
    'mm': 'MILLIMETER',
    'centimeter': 'CENTIMETER',
    'centimeters': 'CENTIMETER',
    'cm': 'CENTIMETER',
    'meter': 'METER',
    'meters': 'METER',
    'm': 'METER',
    'kilometer': 'KILOMETER',
    'kilometers': 'KILOMETER',
    'km': 'KILOMETER',
    'inch': 'INCH',
    'inches': 'INCH',
    'in': 'INCH',
    'feet': 'FEET',
    'foot': 'FEET',
    'ft': 'FEET',

    // Area units
    'square meter': 'SQUARE_METER',
    'square meters': 'SQUARE_METER',
    'sqm': 'SQUARE_METER',
    'm²': 'SQUARE_METER',
    'square feet': 'SQUARE_FEET',
    'square foot': 'SQUARE_FEET',
    'sqft': 'SQUARE_FEET',
    'ft²': 'SQUARE_FEET',

    // Volume units
    'milliliter': 'MILLILITER',
    'milliliters': 'MILLILITER',
    'ml': 'MILLILITER',
    'liter': 'LITER',
    'liters': 'LITER',
    'l': 'LITER',
    'litre': 'LITER',
    'litres': 'LITER',
    'pint': 'PINT',
    'pints': 'PINT',
    'pt': 'PINT',
    'quart': 'QUART',
    'quarts': 'QUART',
    'qt': 'QUART',
    'gallon': 'GALLON',
    'gallons': 'GALLON',
    'gal': 'GALLON',
    'cubic meter': 'CUBIC_METER',
    'cubic meters': 'CUBIC_METER',
    'm³': 'CUBIC_METER',
  }

  // Direct match
  if (unitMapping[normalized]) {
    return unitMapping[normalized]
  }

  // Try to match with common variations (e.g., "1kg" -> "kg")
  const withoutNumbers = normalized.replace(/^\d+\s*/, '').trim()
  if (unitMapping[withoutNumbers]) {
    return unitMapping[withoutNumbers]
  }

  // Default fallback
  return 'PIECE'
}

/**
 * Validates if a value is a valid StandardUnits enum value
 * 
 * @param {string} value - The value to validate
 * @returns {boolean} True if valid StandardUnits enum value
 */
export function isValidStandardUnit(value) {
  const validUnits = [
    'PIECE', 'PACK', 'BOX', 'SET', 'PAIR', 'DOZEN',
    'GRAM', 'KILOGRAM', 'TON', 'OUNCE', 'POUND',
    'MILLIMETER', 'CENTIMETER', 'METER', 'KILOMETER', 'INCH', 'FEET',
    'SQUARE_METER', 'SQUARE_FEET',
    'MILLILITER', 'LITER', 'PINT', 'QUART', 'GALLON', 'CUBIC_METER'
  ]
  return validUnits.includes(value)
}

/**
 * Gets the unit value from OrderItem, with fallback to Product.unit
 * This ensures backward compatibility while transitioning to OrderItem.unit
 * 
 * @param {Object} orderItem - The OrderItem object
 * @param {Object} product - The Product object (optional)
 * @returns {string} The unit value
 */
export function getOrderItemUnit(orderItem, product = null) {
  // Priority 1: Use OrderItem.unit if it exists and is valid
  if (orderItem?.unit && isValidStandardUnit(orderItem.unit)) {
    return orderItem.unit
  }

  // Priority 2: Fallback to Product.unit and map it
  if (product?.unit) {
    return mapProductUnitToStandardUnits(product.unit)
  }

  // Priority 3: Default fallback
  return 'PIECE'
}
