// controllers/deliveryController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'
import { calculateDeliveryCharge } from '../utils/orderUtils.js'
import { findNearestWarehouse } from '../utils/warehouseUtils.js'
import { getPickupStores } from '../utils/deliveryTypeUtils.js'
import { enrichBundleWithExpiry } from './bundleController.js'
import logger from '../utils/logger.js'

const SERVICE_RADIUS_KM = 12

/**
 * Calculate delivery charge preview
 * POST /api/v1/delivery/calculate-charge
 */
export const calculateDeliveryChargePreview = asyncHandler(async (req, res) => {
  const { pincode, subtotal, warehouseId, latitude, longitude } = req.body

  if (!pincode) {
    return errorResponse(res, 400, 'Pincode is required')
  }

  if (subtotal === undefined || subtotal === null) {
    return errorResponse(res, 400, 'Subtotal is required')
  }

  const orderValue = parseFloat(subtotal)
  if (isNaN(orderValue) || orderValue < 0) {
    return errorResponse(res, 400, 'Subtotal must be a valid positive number')
  }

  logger.info('[Delivery] Calculating delivery charge preview', {
    pincode,
    subtotal: orderValue,
    warehouseId
  })

  let targetWarehouseId = warehouseId

  // If warehouseId not provided, find warehouse by pincode
  if (!targetWarehouseId) {
    let warehouse = null

    // Try to find warehouse by pincode
    const warehousesByPincode = await prisma.warehouse.findMany({
      where: {
        servicePincodes: {
          has: pincode
        },
        isActive: true
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true
      }
    })

    if (warehousesByPincode.length > 0) {
      if (warehousesByPincode.length > 1 && latitude && longitude) {
        const nearest = findNearestWarehouse(
          warehousesByPincode,
          parseFloat(latitude),
          parseFloat(longitude)
        )
        if (nearest && nearest.distance <= SERVICE_RADIUS_KM) {
          warehouse = nearest.warehouse
        } else {
          warehouse = warehousesByPincode[0]
        }
      } else {
        warehouse = warehousesByPincode[0]
      }
    } else if (latitude && longitude) {
      const allActiveWarehouses = await prisma.warehouse.findMany({
        where: {
          isActive: true,
          location: {
            not: null
          }
        },
        select: {
          id: true,
          name: true,
          code: true,
          location: true
        }
      })

      const nearest = findNearestWarehouse(
        allActiveWarehouses,
        parseFloat(latitude),
        parseFloat(longitude)
      )

      if (nearest && nearest.distance <= SERVICE_RADIUS_KM) {
        warehouse = nearest.warehouse
      }
    }

    if (!warehouse) {
      return errorResponse(res, 404, 'No serviceable warehouse found for this pincode')
    }

    targetWarehouseId = warehouse.id
  }

  // Calculate delivery charge using existing utility
  const deliveryCharge = await calculateDeliveryCharge(
    orderValue,
    targetWarehouseId,
    pincode
  )

  // Get warehouse info for response
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: targetWarehouseId },
    select: {
      id: true,
      name: true,
      code: true
    }
  })

  const response = {
    pincode,
    subtotal: orderValue,
    deliveryCharge,
    total: orderValue + deliveryCharge,
    warehouse: warehouse ? {
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code
    } : null,
    freeDeliveryThreshold: 500, // Can be made configurable
    isFreeDelivery: deliveryCharge === 0
  }

  logger.info('[Delivery] Delivery charge calculated', {
    pincode,
    subtotal: orderValue,
    deliveryCharge,
    total: response.total
  })

  return successResponse(res, 200, response, 'Delivery charge calculated successfully')
})

/**
 * GET /api/v1/delivery/types
 * Get available delivery types with pricing and details.
 * When addressId or pincode is provided, also returns routeMapIds and blackoutDates for checkout (resolve route, filter slots, hide blackout dates).
 */
export const getDeliveryTypes = asyncHandler(async (req, res) => {
  const { warehouseId, addressId, pincode, cartValue } = req.query
  const userId = req.user?.id

  logger.info('[Delivery] Getting delivery types', { userId, warehouseId, addressId: addressId || undefined })

  if (!warehouseId || warehouseId.trim() === '') {
    return errorResponse(res, 400, 'warehouseId is required')
  }

  let resolvedAddressId = addressId?.trim() || null
  if (resolvedAddressId) {
    const addr = await prisma.address.findUnique({
      where: { id: resolvedAddressId },
      select: { id: true, userId: true },
    })
    if (!addr) {
      return errorResponse(res, 404, 'Address not found')
    }
    if (userId && addr.userId !== userId) {
      return errorResponse(res, 404, 'Address not found or access denied')
    }
  } else if (userId) {
    const defaultAddr = await prisma.address.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    })
    if (defaultAddr) resolvedAddressId = defaultAddr.id
  }

  const orderValue = cartValue != null ? Number(cartValue) : 0
  const { getAvailableDeliveryOptions } = await import('../services/deliveryConfigurationService.js')
  const result = await getAvailableDeliveryOptions(warehouseId, {
    addressId: resolvedAddressId || undefined,
    pincode: pincode != null ? String(pincode).trim() : undefined,
    cartValue: orderValue,
  })

  if (!result.warehouse) {
    return errorResponse(res, 404, 'Warehouse not found')
  }

  return successResponse(res, 200, {
    deliveryTypes: result.options,
    warehouse: {
      id: result.warehouse.id,
      name: result.warehouse.name,
    },
    routeMapIds: result.routeMapIds,
    blackoutDates: result.blackoutDates,
  }, 'Delivery types fetched successfully')
})

/**
 * GET /api/v1/stores/pickup
 * Get available pickup stores
 */
export const getPickupStoresList = asyncHandler(async (req, res) => {
  const { warehouseId, pincode } = req.query

  logger.info('[Delivery] Getting pickup stores', { warehouseId, pincode })

  const stores = await getPickupStores(warehouseId || null, pincode || null)

  return successResponse(res, 200, { stores }, 'Pickup stores fetched successfully')
})

/**
 * GET /api/v1/stores/:storeId/pickup-slots
 * Get pickup time slots for a store. Uses PickupSlot table (capacity) when rows exist; else legacy warehouse.pickupTimeSlots.
 * Applies blackout: returns empty slots when date is a blackout date.
 */
export const getPickupStoreSlots = asyncHandler(async (req, res) => {
  const { storeId } = req.params
  const { date } = req.query

  logger.info('[Delivery] Getting pickup slots', { storeId, date })

  const store = await prisma.warehouse.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      location: true,
      opensAt: true,
      closesAt: true,
      isPickupStore: true,
      pickupTimeSlots: true,
    },
  })

  if (!store) {
    return errorResponse(res, 404, 'Store not found')
  }

  if (!store.isPickupStore) {
    return errorResponse(res, 400, 'This warehouse is not a pickup store')
  }

  let availableSlots = []
  if (date) {
    const { getAvailablePickupSlots } = await import('../services/pickupSlotService.js')
    const { getBlackoutDatesForWarehouse } = await import('../services/deliveryConfigurationService.js')
    const targetDate = new Date(date)
    const dateOnly = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()))
    const blackoutSet = await getBlackoutDatesForWarehouse(storeId, dateOnly, dateOnly)
    const dateStr = dateOnly.toISOString().slice(0, 10)
    if (!blackoutSet.has(dateStr)) {
      const raw = await getAvailablePickupSlots(storeId, dateOnly)
      availableSlots = raw.map((s) => ({
        ...s,
        available: s.isAvailable ?? (s.capacity != null ? (s.booked ?? 0) < s.capacity : true),
      }))
    }
  } else {
    const jsonSlots = store.pickupTimeSlots
    const slots = Array.isArray(jsonSlots) && jsonSlots.length > 0
      ? jsonSlots
      : [
          { time: '6:00 AM to 8:00 AM', startTime: '06:00', endTime: '08:00' },
          { time: '8:00 AM to 10:00 AM', startTime: '08:00', endTime: '10:00' },
          { time: '10:00 AM to 12:00 PM', startTime: '10:00', endTime: '12:00' },
          { time: '12:00 PM to 2:00 PM', startTime: '12:00', endTime: '14:00' },
          { time: '2:00 PM to 4:00 PM', startTime: '14:00', endTime: '16:00' },
          { time: '4:00 PM to 6:00 PM', startTime: '16:00', endTime: '18:00' },
        ]
    availableSlots = slots.map((s) => ({
      ...s,
      available: true,
      booked: 0,
      capacity: 10,
      source: 'legacy_json',
    }))
  }

  return successResponse(res, 200, {
    store: {
      id: store.id,
      warehouseId: store.id,
      name: store.name,
      address: store.address,
      location: store.location,
      opensAt: store.opensAt,
      closesAt: store.closesAt,
      phone: store.phone,
    },
    date: date || null,
    slots: availableSlots,
  }, 'Pickup slots fetched successfully')
})

/**
 * GET /api/v1/delivery/schedule
 * Fetch the upcoming village delivery schedule based on pincode.
 */
export const getVillageSchedule = asyncHandler(async (req, res) => {
  const { pincode } = req.query
  const userId = req.user?.id

  let targetPincode = pincode

  if (!targetPincode && userId) {
    const defaultAddr = await prisma.address.findFirst({
      where: { userId, isDefault: true },
      select: { pincode: true }
    })
    if (defaultAddr) {
      targetPincode = defaultAddr.pincode
    }
  }

  if (!targetPincode) {
    return errorResponse(res, 400, 'Pincode is required')
  }

  // Find warehouse matching pincode or fallback to active warehouse
  let warehouse = await prisma.warehouse.findFirst({
    where: {
      servicePincodes: { has: targetPincode },
      isActive: true
    }
  });

  if (!warehouse) {
    warehouse = await prisma.warehouse.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }
    });
  }

  if (!warehouse) {
    return successResponse(res, 200, {
      villageName: null,
      frequency: null,
      nextDeliveryDate: null,
      timeWindow: null,
      isServiceable: false,
      nextDeliveryVisit: null,
      timingsAndSessions: null,
      deliveryAgent: null,
      weeklySchedule: null,
      todayRouteStops: []
    }, 'No serviceable warehouse found for this pincode');
  }

  // Find active route & route assignment for this warehouse
  const route = await prisma.route.findFirst({
    where: { storeId: warehouse.id, status: true },
    include: {
      stops: {
        orderBy: { stopOrder: 'asc' },
        include: { village: { select: { name: true } } }
      }
    }
  });

  const assignment = await prisma.routeAssignment.findFirst({
    where: {
      ...(route ? { routeId: route.id } : {}),
      status: true
    },
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, createdAt: true } },
      shiftConfig: true,
      route: true
    }
  });

  // Resolve Village Name from real Route or Warehouse location
  let villageName = route?.routeName || warehouse.name;
  if (route?.stops?.length > 0 && route.stops[0].village?.name) {
    villageName = route.stops[0].village.name;
  } else if (route?.villages?.length > 0) {
    villageName = route.villages[0];
  }

  // Format Next Delivery Visit Date from RouteSchedule or current date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextSchedule = await prisma.routeSchedule.findFirst({
    where: {
      ...(route ? { routeId: route.id } : {}),
      scheduledDate: { gte: today }
    },
    orderBy: { scheduledDate: 'asc' }
  });

  const targetDate = nextSchedule?.scheduledDate ? new Date(nextSchedule.scheduledDate) : new Date(today.getTime() + 86400000);
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const daysLeftMsg = diffDays === 0 ? 'Today' : diffDays === 1 ? '1 Day Left' : `${diffDays} Days Left`;

  const dateOptions = { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' };
  const formattedNextDate = targetDate.toLocaleDateString('en-US', dateOptions);

  // Dynamic Sessions & Shift Timings from DB ShiftConfig
  const shift = assignment?.shiftConfig;
  const morningStart = shift?.startTime || (shift?.sessions?.[0]?.startTime) || '09:00';
  const morningEnd = shift?.endTime || (shift?.sessions?.[0]?.endTime) || '13:00';
  const eveningStart = shift?.sessions?.[1]?.startTime || '15:00';
  const eveningEnd = shift?.sessions?.[1]?.endTime || '19:00';

  const morningSession = `${morningStart} - ${morningEnd}`;
  const eveningSession = `${eveningStart} - ${eveningEnd}`;

  // Dynamic Delivery Agent Details from DB User
  const agentUser = assignment?.user;
  const deliveryAgent = agentUser ? {
    name: agentUser.name || 'Delivery Agent',
    phone: agentUser.phone || '',
    role: agentUser.role || 'DELIVERY_AGENT',
    experience: agentUser.createdAt
      ? `Serving since ${new Date(agentUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
      : 'Active Agent'
  } : null;

  // Dynamic Weekly Schedule & Active Days from DB RouteAssignment.schedule
  const schedObj = assignment?.schedule || {};
  const dayKeys = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const activeDaysMap = [];
  const allDaysAbbr = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  dayKeys.forEach((dk, idx) => {
    if (schedObj[dk] && (schedObj[dk].morning || schedObj[dk].evening)) {
      activeDaysMap.push(allDaysAbbr[idx]);
    }
  });

  const activeDays = activeDaysMap.length > 0 ? activeDaysMap : ['Mo', 'We', 'Fr'];

  // Build Real Today Route Stops List from DB RouteStops / Route.villages
  let rawStopsList = [];
  if (route?.stops?.length > 0) {
    rawStopsList = route.stops.map(s => s.village?.name || `Stop ${s.stopOrder}`);
  } else if (route?.villages?.length > 0) {
    rawStopsList = route.villages;
  }

  const todayRouteStops = rawStopsList.map((villageStopName, idx) => {
    let status = 'Next';
    if (idx === 0) status = 'Done';
    else if (idx === 1) status = 'Live';

    const arrHour = 9 + (idx * 2);
    const arrTime = `${arrHour > 12 ? arrHour - 12 : arrHour}:00 ${arrHour >= 12 ? 'PM' : 'AM'}`;

    return {
      stopOrder: idx + 1,
      villageName: villageStopName,
      arrivalTime: arrTime,
      status
    };
  });

  return successResponse(res, 200, {
    villageName,
    frequency: activeDays.length > 0 ? `${activeDays.length} Days a week` : 'Scheduled',
    nextDeliveryDate: formattedNextDate,
    timeWindow: `Morning session: ${morningSession}`,
    daysLeft: daysLeftMsg,
    isServiceable: true,
    nextDeliveryVisit: {
      date: formattedNextDate,
      timeSlot: `Morning session: ${morningSession}`,
      daysLeftMessage: daysLeftMsg
    },
    timingsAndSessions: {
      morningSession,
      eveningSession
    },
    deliveryAgent,
    weeklySchedule: {
      deliveryDays: allDaysAbbr,
      activeDays,
      slotsPerWeek: `${activeDays.length} Days a week`,
      deliveriesThisMonth: `${activeDays.length * 4} Deliveries / Month`
    },
    todayRouteStops
  }, 'Village schedule overview fetched successfully');
});

/**
 * GET /api/v1/delivery/schedule/villages
 * Fetch all serviceable routes for a pincode that serve the customer's mandal.
 * Returns routes filtered to those passing through the customer's location.
 */
export const getServiceableVillages = asyncHandler(async (req, res) => {
  const { pincode } = req.query
  const userId = req.user?.id

  let targetPincode = pincode
  let customerMandal = null

  // Resolve pincode AND mandal from the user's default address
  if (userId) {
    const defaultAddr = await prisma.address.findFirst({
      where: { userId, isDefault: true },
      select: { pincode: true, mandal: true }
    })
    if (defaultAddr) {
      if (!targetPincode) targetPincode = defaultAddr.pincode
      customerMandal = defaultAddr.mandal?.trim() || null
    }
  }

  if (!targetPincode) {
    return errorResponse(res, 400, 'Pincode is required')
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: {
      servicePincodes: { has: targetPincode },
      isActive: true
    }
  })

  if (!warehouse) {
    return successResponse(res, 200, [], 'No serviceable warehouse found')
  }

  // Fetch all active routes for this warehouse with their stops and villages array
  const routes = await prisma.route.findMany({
    where: { storeId: warehouse.id, status: true },
    select: {
      id: true,
      routeName: true,
      villages: true,          // String[] — names of stops
      stops: {
        select: {
          stopOrder: true,
          village: {
            select: {
              name: true
            }
          }
        },
        orderBy: { stopOrder: 'asc' }
      }
    }
  })

  const normalise = (s) => (s || '').toLowerCase().trim()
  const mandalNorm = normalise(customerMandal)

  const routeList = routes
    .map(route => {
      // Build a flat list of stop names for this route
      const stopNames = [
        ...(route.villages || []),
        ...(route.stops || []).map(s => s.village?.name).filter(Boolean)
      ]

      // Find if any stop name matches the customer's mandal
      const matchedStop = mandalNorm
        ? stopNames.find(n => normalise(n) === mandalNorm || normalise(n).includes(mandalNorm) || mandalNorm.includes(normalise(n)))
        : null

      return {
        id: route.routeName,
        name: route.routeName,
        customerStop: matchedStop || null,
        servesCustomer: !!matchedStop
      }
    })
    // If we know the customer's mandal, only show routes that serve them
    // Otherwise return all routes (fallback for users without a saved address mandal)
    .filter(r => !mandalNorm || r.servesCustomer)

  return successResponse(res, 200, routeList, 'Serviceable routes retrieved successfully')
})

/**
 * Helper: convert "HH:MM" 24h to minutes-since-midnight
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

/**
 * Helper: format minutes-since-midnight to "H:MM AM/PM"
 */
function minutesToDisplay(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

/**
 * GET /api/v1/delivery/schedule/detail
 * Fetch detailed schedule configuration by routeName.
 * Personalises the response to the customer's mandal stop (arrival time, delivery days).
 */
export const getVillageScheduleDetail = asyncHandler(async (req, res) => {
  const { villageName } = req.query
  const userId = req.user?.id

  if (!villageName) {
    return errorResponse(res, 400, 'routeName parameter is required')
  }

  // Resolve customer's mandal from their default address
  let customerMandal = null
  if (userId) {
    const defaultAddr = await prisma.address.findFirst({
      where: { userId, isDefault: true },
      select: { mandal: true }
    })
    customerMandal = defaultAddr?.mandal?.trim() || null
  }
  const normalise = (s) => (s || '').toLowerCase().trim()
  const mandalNorm = normalise(customerMandal)

  // Look up route by name
  const route = await prisma.route.findFirst({
    where: { routeName: villageName, status: true }
  })

  const today = new Date()
  today.setHours(0,0,0,0)

  let nextVisitDate = 'Unavailable'
  let nextVisitTime = 'N/A'
  let daysLeft = 0
  let routeStopsList = []
  let driverUser = null
  let activeSessions = ['Morning', 'Evening']
  let customerStopInfo = null
  
  // Resolve schedule days and sessions from RouteAssignment
  let deliveryDays = ['Mo', 'We', 'Fr'] // Default fallback
  let assignment = null

  if (route) {
    assignment = await prisma.routeAssignment.findFirst({
      where: { routeId: route.id, status: true },
      include: { user: true, shiftConfig: true }
    })

    if (assignment) {
      driverUser = assignment.user

      // Resolve sessions from ShiftConfig if linked, otherwise fall back to legacy fields
      const shiftCfg = assignment.shiftConfig
      if (shiftCfg) {
        if (shiftCfg.shiftType === 'MULTI_SESSION' && shiftCfg.sessions) {
          const sessionsArr = typeof shiftCfg.sessions === 'string' 
            ? JSON.parse(shiftCfg.sessions) 
            : shiftCfg.sessions
          activeSessions = sessionsArr.map((s, idx) => {
            const [h, m] = (s.startTime || '09:00').split(':')
            const hh = parseInt(h)
            const ampm = hh >= 12 ? 'PM' : 'AM'
            const h12 = hh % 12 || 12
            const [eh, em] = (s.endTime || '18:00').split(':')
            const ehh = parseInt(eh)
            const eampm = ehh >= 12 ? 'PM' : 'AM'
            const eh12 = ehh % 12 || 12
            return `Session ${idx + 1}: ${h12}:${m} ${ampm} – ${eh12}:${em} ${eampm}`
          })
        } else {
          const [sh, sm] = (shiftCfg.startTime || '09:00').split(':')
          const shh = parseInt(sh)
          const sampm = shh >= 12 ? 'PM' : 'AM'
          const sh12 = shh % 12 || 12
          const [eh, em] = (shiftCfg.endTime || '18:00').split(':')
          const ehh = parseInt(eh)
          const eampm = ehh >= 12 ? 'PM' : 'AM'
          const eh12 = ehh % 12 || 12
          activeSessions = [`${sh12}:${sm} ${sampm} – ${eh12}:${em} ${eampm}`]
        }
      } else {
        const sessions = []
        if (assignment.morningSession) sessions.push('Morning')
        if (assignment.afternoonSession) sessions.push('Afternoon')
        if (assignment.eveningSession) sessions.push('Evening')
        if (sessions.length > 0) activeSessions = sessions
      }

      // Resolve delivery days from assignment schedule JSON
      // If we know the customer's mandal, only mark days where that mandal is scheduled
      if (assignment.schedule) {
        try {
          const parsed = typeof assignment.schedule === 'string' 
            ? JSON.parse(assignment.schedule) 
            : assignment.schedule
          
          const dayAbbr = { Monday: 'Mo', Tuesday: 'Tu', Wednesday: 'We', Thursday: 'Th', Friday: 'Fr', Saturday: 'Sa', Sunday: 'Su' }

          if (Array.isArray(parsed)) {
            deliveryDays = parsed
          } else if (typeof parsed === 'object') {
            deliveryDays = Object.keys(parsed).filter(k => {
              const dayData = parsed[k]
              if (dayData === true) return true
              if (typeof dayData !== 'object') return false
              if (!mandalNorm) {
                // No customer location known — show any day with any stop
                return dayData.morning || dayData.evening
              }
              // Customer location known — only mark days where their mandal is scheduled
              const morningMatch = normalise(dayData.morning).includes(mandalNorm) || mandalNorm.includes(normalise(dayData.morning))
              const eveningMatch = normalise(dayData.evening).includes(mandalNorm) || mandalNorm.includes(normalise(dayData.evening))
              return morningMatch || eveningMatch
            }).map(k => dayAbbr[k] || k)
          }
        } catch (e) {
          logger.error('Error parsing route assignment schedule JSON:', e)
        }
      }
    }

    // Resolve next visit from RouteSchedule
    const schedule = await prisma.routeSchedule.findFirst({
      where: {
        routeId: route.id,
        scheduledDate: { gte: today }
      },
      orderBy: { scheduledDate: 'asc' },
      include: { assignedUser: true }
    })

    if (schedule) {
      if (schedule.assignedUser) driverUser = schedule.assignedUser
      const sDate = new Date(schedule.scheduledDate)
      const diffTime = sDate.getTime() - today.getTime()
      daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))

      const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
      nextVisitDate = sDate.toLocaleDateString('en-US', options)

      const shiftCfg = assignment?.shiftConfig
      if (shiftCfg && shiftCfg.startTime) {
        const [sh, sm] = shiftCfg.startTime.split(':')
        const shh = parseInt(sh)
        const sampm = shh >= 12 ? 'PM' : 'AM'
        const sh12 = shh % 12 || 12
        const [eh, em] = (shiftCfg.endTime || '18:00').split(':')
        const ehh = parseInt(eh)
        const eampm = ehh >= 12 ? 'PM' : 'AM'
        const eh12 = ehh % 12 || 12
        const sessionLabel = shiftCfg.shiftType === 'MULTI_SESSION' ? 'Multi-Session' : 'Shift'
        nextVisitTime = `${sessionLabel} · ${sh12}:${sm} ${sampm} – ${eh12}:${em} ${eampm}`
      } else {
        const start = schedule.startTime || '9:00 AM'
        const end = schedule.endTime || '12:00 PM'
        nextVisitTime = `Morning slot · ${start} – ${end}`
      }
    } else if (deliveryDays.length > 0) {
      // Dynamic fallback calculation using deliveryDays ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
      const dayMap = { 'Su': 0, 'Mo': 1, 'Tu': 2, 'We': 3, 'Th': 4, 'Fr': 5, 'Sa': 6 }
      const currentDayIndex = today.getDay() // 0-6

      let minDiff = 8
      let nextDayIndex = -1

      for (const d of deliveryDays) {
        const targetIdx = dayMap[d]
        if (targetIdx !== undefined) {
          let diff = targetIdx - currentDayIndex
          if (diff <= 0) diff += 7 // next week
          if (diff < minDiff) {
            minDiff = diff
            nextDayIndex = targetIdx
          }
        }
      }

      if (nextDayIndex !== -1) {
        const fallbackDate = new Date(today)
        fallbackDate.setDate(today.getDate() + minDiff)
        daysLeft = minDiff

        const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
        nextVisitDate = fallbackDate.toLocaleDateString('en-US', options)

        const shiftCfg = assignment?.shiftConfig
        if (shiftCfg && shiftCfg.startTime) {
          const [sh, sm] = shiftCfg.startTime.split(':')
          const shh = parseInt(sh)
          const sampm = shh >= 12 ? 'PM' : 'AM'
          const sh12 = shh % 12 || 12
          const [eh, em] = (shiftCfg.endTime || '18:00').split(':')
          const ehh = parseInt(eh)
          const eampm = ehh >= 12 ? 'PM' : 'AM'
          const eh12 = ehh % 12 || 12
          const sessionLabel = shiftCfg.shiftType === 'MULTI_SESSION' ? 'Multi-Session' : 'Shift'
          nextVisitTime = `${sessionLabel} · ${sh12}:${sm} ${sampm} – ${eh12}:${em} ${eampm}`
        } else {
          nextVisitTime = 'Standard Shift · 9:00 AM – 6:00 PM'
        }
      }
    }

    // Resolve route stops list
    const stops = await prisma.routeStop.findMany({
      where: { routeId: route.id },
      orderBy: { stopOrder: 'asc' },
      include: { village: true }
    })

    // Build stops with time interpolation based on shift timing
    const shiftCfg = assignment?.shiftConfig
    const shiftStartMins = shiftCfg?.startTime ? timeToMinutes(shiftCfg.startTime) : 9 * 60  // default 9 AM
    const shiftEndMins   = shiftCfg?.endTime   ? timeToMinutes(shiftCfg.endTime)   : 18 * 60 // default 6 PM
    const shiftDurationMins = Math.max(shiftEndMins - shiftStartMins, 60)

    // Use DB stops if available, else fall back to route.villages[]
    const stopSource = stops.length > 0
      ? stops.map((s, i) => ({ order: s.stopOrder || i + 1, name: s.village?.name || 'Stop', dbTime: s.estimatedTime }))
      : (route.villages || []).map((v, i) => ({ order: i + 1, name: v, dbTime: null }))

    const totalStops = stopSource.length

    routeStopsList = stopSource.map((stop, idx) => {
      // Distribute stops evenly across the shift window
      const fraction = totalStops <= 1 ? 0 : idx / (totalStops - 1)
      const estimatedMins = shiftStartMins + Math.round(fraction * shiftDurationMins)
      const timeDisplay = stop.dbTime || minutesToDisplay(estimatedMins)

      // Determine if this is the customer's stop
      const isCustomerStop = mandalNorm &&
        (normalise(stop.name) === mandalNorm ||
         normalise(stop.name).includes(mandalNorm) ||
         mandalNorm.includes(normalise(stop.name)))

      return {
        number: stop.order,
        name: stop.name,
        time: timeDisplay,
        estimatedMinutes: estimatedMins,
        isCustomerStop: isCustomerStop || false,
        status: idx === 0 ? 'Done' : (idx === 1 ? 'Live' : 'Next')
      }
    })

    // Build customerStopInfo
    if (mandalNorm) {
      const custStop = routeStopsList.find(s => s.isCustomerStop)
      if (custStop) {
        customerStopInfo = {
          stopName: custStop.name,
          stopOrder: custStop.number,
          estimatedArrival: custStop.time,
          sessionLabel: activeSessions.length > 0 ? activeSessions[0] : 'Delivery'
        }
        // Override the top-level nextVisitTime with the customer's specific stop arrival
        if (nextVisitDate !== 'Unavailable') {
          nextVisitTime = `Arrives at your location · ${custStop.time}`
        }
      }
    }
  }

  // Fallback default stops if none mapped
  if (routeStopsList.length === 0) {
    routeStopsList = [
      { number: 1, name: 'Bus Stand', time: '7:00 AM', isCustomerStop: false, status: 'Done' },
      { number: 2, name: 'Market Area', time: '9:00 AM', isCustomerStop: false, status: 'Live' }
    ]
  }

  // Map weekly schedule days
  const daysOfWeek = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  const todayDayOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date().getDay()]

  const weeklySchedule = daysOfWeek.map(day => {
    let status = 'off'
    if (deliveryDays.includes(day)) {
      status = (day === todayDayOfWeek) ? 'today' : 'delivery'
    }
    return { day, status }
  })

  const result = {
    villageName: route ? route.routeName : villageName,
    nextVisitDate,
    nextVisitTime,
    daysLeft,
    customerMandal: customerMandal || null,
    customerStopInfo,
    deliveryAgent: {
      name: driverUser?.name || 'Delivery Agent',
      role: driverUser?.role === 'DRIVER' ? 'Senior driver agent' : 'Senior delivery agent',
      servingSince: 'Jan 2023',
      rating: 4.9
    },
    routes: activeSessions,
    weeklySchedule,
    routeStops: routeStopsList,
    shiftConfig: assignment?.shiftConfig ? {
      id: assignment.shiftConfig.id,
      shiftName: assignment.shiftConfig.shiftName,
      shiftType: assignment.shiftConfig.shiftType,
      startTime: assignment.shiftConfig.startTime,
      endTime: assignment.shiftConfig.endTime,
      sessions: assignment.shiftConfig.sessions,
      isActive: assignment.shiftConfig.isActive
    } : null
  }

  return successResponse(res, 200, result, 'Village schedule detail retrieved successfully')
})

/**
 * GET /api/v1/delivery/bundles
 * Fetch active bundle deals.
 */
export const getActiveBundles = asyncHandler(async (req, res) => {
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

  return successResponse(res, 200, enrichedBundles, 'Active bundle deals retrieved successfully');
});

