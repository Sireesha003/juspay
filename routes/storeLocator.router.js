import express from 'express'
import {
  getNearestStore,
  getNearbyStores,
  searchStores,
  getStoreDetails
} from '../controllers/storeLocatorController.js'

const router = express.Router()

/**
 * @route   GET /api/v1/store-locator/nearest
 * @route   POST /api/v1/store-locator/nearest
 * @desc    Get nearest store and exact distance from coordinates
 * @access  Public
 */
router.get('/nearest', getNearestStore)
router.post('/nearest', getNearestStore)

/**
 * @route   GET /api/v1/store-locator/search
 * @desc    Search stores by query (name, code, address, city, pincode) + optional GPS distance
 * @access  Public
 */
router.get('/search', searchStores)

/**
 * @route   GET /api/v1/store-locator/nearby
 * @desc    Find nearby stores sorted by distance
 * @access  Public
 */
router.get('/nearby', getNearbyStores)

/**
 * @route   GET /api/v1/store-locator
 * @desc    List or search stores
 * @access  Public
 */
router.get('/', searchStores)

/**
 * @route   GET /api/v1/store-locator/:id
 * @desc    Get store details by ID
 * @access  Public
 */
router.get('/:id', getStoreDetails)

export default router
