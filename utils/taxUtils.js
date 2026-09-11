// utils/taxUtils.js
import logger from './logger.js'

/**
 * Default GST rates (can be configured per product/category)
 */
export const DEFAULT_GST_RATE = 0 // 18% GST
const GST_EXEMPT_RATE = 0
const GST_5_RATE = 5
const GST_12_RATE = 12
const GST_18_RATE = 18
const GST_28_RATE = 28

/**
 * Calculate GST for a given amount
 * 
 * @param {number} amount - Taxable amount (subtotal - discount)
 * @param {string} fromState - State code of warehouse/seller
 * @param {string} toState - State code of delivery address
 * @param {number} gstRate - GST rate percentage (default: 18)
 * @returns {Object} Tax breakdown
 */
export function calculateGST(amount, fromState = null, toState = null, gstRate = DEFAULT_GST_RATE) {
  if (!amount || amount <= 0) {
    return {
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
      taxableAmount: 0
    }
  }

  // Round taxable amount to 2 decimal places
  const taxableAmount = Math.round(amount * 100) / 100

  // Determine if intra-state or inter-state
  const isIntraState = fromState && toState && fromState === toState

  /*
  if (gstRate === 0) {
    // Tax exempt
    totalTax = 0
  } else if (isIntraState) {
    // Intra-state: CGST + SGST (each half of GST rate)
    const taxRate = gstRate / 2
    cgst = Math.round((taxableAmount * taxRate) / 100 * 100) / 100
    sgst = Math.round((taxableAmount * taxRate) / 100 * 100) / 100
    totalTax = Math.round((cgst + sgst) * 100) / 100
  } else {
    // Inter-state: IGST (full GST rate)
    igst = Math.round((taxableAmount * gstRate) / 100 * 100) / 100
    totalTax = igst
  }
  */
  let cgst = 0
  let sgst = 0
  let igst = 0
  let totalTax = 0

  logger.info('[TaxUtils] GST calculated', {
    taxableAmount,
    gstRate,
    isIntraState,
    fromState,
    toState,
    cgst,
    sgst,
    igst,
    totalTax
  })

  return {
    cgst,
    sgst,
    igst,
    totalTax,
    taxableAmount
  }
}

/**
 * Calculate tax for cart items
 * 
 * @param {Array} cartItems - Array of cart items with product details
 * @param {string} deliveryState - State code of delivery address
 * @param {string} warehouseState - State code of warehouse
 * @returns {Object} Tax breakdown for entire cart
 */
export function calculateCartTax(cartItems, deliveryState = null, warehouseState = null) {
  let totalTaxableAmount = 0
  let totalCGST = 0
  let totalSGST = 0
  let totalIGST = 0
  let totalTax = 0

  for (const item of cartItems) {
    if (!item.product || !item.product.isActive) continue

    const availableQuantity = Math.min(item.quantity, item.product.stock || 0)
    if (availableQuantity === 0) continue

    // Get product tax rate (use schema default 18% if null/undefined, 0 is valid for tax-exempt)
    const productTaxRate = item.product.taxRate ?? DEFAULT_GST_RATE
    const itemSubtotal = item.product.price * availableQuantity

    // Calculate tax for this item
    const itemTax = calculateGST(
      itemSubtotal,
      warehouseState,
      deliveryState,
      productTaxRate
    )

    totalTaxableAmount += itemTax.taxableAmount
    totalCGST += itemTax.cgst
    totalSGST += itemTax.sgst
    totalIGST += itemTax.igst
    totalTax += itemTax.totalTax
  }

  // Round all values
  totalTaxableAmount = Math.round(totalTaxableAmount * 100) / 100
  totalCGST = Math.round(totalCGST * 100) / 100
  totalSGST = Math.round(totalSGST * 100) / 100
  totalIGST = Math.round(totalIGST * 100) / 100
  totalTax = Math.round(totalTax * 100) / 100

  return {
    taxableAmount: totalTaxableAmount,
    cgst: totalCGST,
    sgst: totalSGST,
    igst: totalIGST,
    totalTax
  }
}

/**
 * Calculate tax after applying discount
 * 
 * @param {number} subtotal - Cart subtotal
 * @param {number} discount - Discount amount
 * @param {string} deliveryState - State code of delivery address
 * @param {string} warehouseState - State code of warehouse
 * @param {number} gstRate - GST rate (default: 18)
 * @returns {Object} Tax breakdown
 */
export function calculateTaxAfterDiscount(
  subtotal,
  discount = 0,
  deliveryState = null,
  warehouseState = null,
  gstRate = DEFAULT_GST_RATE
) {
  const taxableAmount = Math.max(0, subtotal - discount)
  return calculateGST(taxableAmount, warehouseState, deliveryState, gstRate)
}

/**
 * Get state code from address
 * 
 * @param {Object} address - Address object
 * @returns {string|null} State code
 */
export function getStateCode(address) {
  if (!address || !address.state) return null
  
  // Map common state names to codes (can be expanded)
  const stateCodeMap = {
    'maharashtra': 'MH',
    'gujarat': 'GJ',
    'karnataka': 'KA',
    'tamil nadu': 'TN',
    'delhi': 'DL',
    'west bengal': 'WB',
    'rajasthan': 'RJ',
    'uttar pradesh': 'UP',
    'punjab': 'PB',
    'haryana': 'HR',
    'kerala': 'KL',
    'andhra pradesh': 'AP',
    'telangana': 'TS',
    'bihar': 'BR',
    'odisha': 'OD',
    'madhya pradesh': 'MP',
    'assam': 'AS',
    'jharkhand': 'JH',
    'chhattisgarh': 'CG',
    'himachal pradesh': 'HP',
    'uttarakhand': 'UK',
    'goa': 'GA',
    'manipur': 'MN',
    'meghalaya': 'ML',
    'mizoram': 'MZ',
    'nagaland': 'NG',
    'sikkim': 'SK',
    'tripura': 'TR',
    'arunachal pradesh': 'AR'
  }

  const stateName = address.state.toLowerCase().trim()
  return stateCodeMap[stateName] || address.state.toUpperCase().substring(0, 2)
}

