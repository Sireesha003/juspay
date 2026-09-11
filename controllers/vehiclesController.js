// controllers/vehiclesController.js
import { prisma } from '../config/prismaClient.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import { successResponse, errorResponse } from '../utils/responseHelper.js'

/**
 * Dynamic Stop ETA Calculation Helper:
 * Calculates arrival and departure times for each village stop based on
 * shift start time, dwell time per stop, and transit duration.
 * Statuses: 'Done' (previous stops), 'Now' (current active stop), 'Next' (upcoming stops).
 */
function buildVisitedLocationsWithTimings(stopsInput, isLive = false, shiftStartTimeStr = '10:00 AM') {
  let baseMinutes = 10 * 60; // 600 mins = 10:00 AM
  if (shiftStartTimeStr) {
    const match = String(shiftStartTimeStr).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3]?.toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      baseMinutes = h * 60 + m;
    }
  }

  const formatMinsTo12h = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = Math.floor(mins % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  let currentMinutes = baseMinutes;

  return stopsInput.map((stop, index) => {
    let status = 'Next';
    if (isLive) {
      if (index === 0) status = 'Done';
      else if (index === 1) status = 'Now';
      else status = 'Next';
    } else {
      status = 'Next';
    }

    const dwellMinutes = stop.dwellMinutes || (index % 2 === 0 ? 25 : 30);
    const startMins = currentMinutes;
    const endMins = currentMinutes + dwellMinutes;
    currentMinutes = endMins + 10; // 10 min transit buffer between villages

    const arrTime = formatMinsTo12h(startMins);
    const depTime = formatMinsTo12h(endMins);
    const estimatedTime = `${arrTime} - ${depTime}`;

    let timeWindow = `Estimated ${estimatedTime}`;
    if (status === 'Done') {
      timeWindow = `Completed at ${depTime}`;
    } else if (status === 'Now') {
      timeWindow = `Currently visiting (${arrTime} - ${depTime})`;
    } else {
      timeWindow = `Expected arrival at ${arrTime}`;
    }

    const name = stop.villageName || stop.village?.name || stop.name || (typeof stop === 'string' ? stop : `Village Hub ${index + 1}`);

    return {
      stopOrder: index + 1,
      villageName: name,
      status,
      arrivalTime: arrTime,
      departureTime: depTime,
      estimatedTime,
      timeWindow
    };
  });
}

/**
 * Helper to map DB entities to the frontend expected VehicleModel JSON structure.
 */
async function mapVehicleToModel(vehicle, activeExecution = null) {
  // Extract driver, helper, assistant from assigned users
  const driver = vehicle.assignedUsers?.find(u => u.role === 'DRIVER') || vehicle.assignedUsers?.[0];
  const helper = vehicle.assignedUsers?.find(u => u.role === 'DELIVERY_AGENT' || u.role === 'HELPER');
  const assistant = vehicle.assignedUsers?.find(u => u.role === 'ASSISTANT');

  const isLive = activeExecution ? activeExecution.status === 'IN_PROGRESS' : false;

  // Look up vehicle's route assignment and shift configuration from DB
  const assignment = await prisma.routeAssignment.findFirst({
    where: { vehicleId: vehicle.id, status: true },
    include: {
      shiftConfig: true,
      route: {
        include: {
          stops: {
            orderBy: { stopOrder: 'asc' },
            include: { village: { select: { name: true } } }
          }
        }
      }
    }
  });

  let routeName = activeExecution?.route?.routeName || assignment?.route?.routeName || 'Standard Route';
  let rawStops = [];

  if (activeExecution?.route) {
    const stops = await prisma.routeStop.findMany({
      where: { routeId: activeExecution.route.id },
      orderBy: { stopOrder: 'asc' },
      include: { village: true }
    });
    rawStops = stops;
  } else if (assignment?.route?.stops?.length > 0) {
    rawStops = assignment.route.stops;
  } else if (assignment?.route?.villages?.length > 0) {
    rawStops = assignment.route.villages;
  } else {
    rawStops = [];
  }

  // Resolve dynamic shift timing & status message from DB
  let etaMessage = 'Offline';
  let shiftTimingInfo = assignment?.shiftConfig ? `${assignment.shiftConfig.shiftName || 'Shift'} (${assignment.shiftConfig.startTime || '09:00'} - ${assignment.shiftConfig.endTime || '19:00'})` : null;
  let vehicleStatusText = isLive ? 'Active - On Route' : 'Inactive';
  let startTimeStr = assignment?.shiftConfig?.startTime || '09:00';

  if (isLive) {
    etaMessage = activeExecution?.estimatedTimeArrival || 'On Route';
    vehicleStatusText = 'Active - Live On Route';
  } else if (assignment?.shiftConfig?.startTime) {
    etaMessage = `Starts at ${assignment.shiftConfig.startTime}`;
    vehicleStatusText = `Inactive - Scheduled to start at ${assignment.shiftConfig.startTime}`;
  } else {
    etaMessage = 'Offline';
    vehicleStatusText = 'Inactive';
  }

  // Generate dynamic visitedLocations from real DB stops
  const visitedLocations = buildVisitedLocationsWithTimings(rawStops, isLive, startTimeStr);

  // Fallback to warehouse location if active coordinates are not set
  const lat = vehicle.store?.location && typeof vehicle.store.location === 'object' && vehicle.store.location.lat 
    ? parseFloat(vehicle.store.location.lat) 
    : 17.723126;
  const lng = vehicle.store?.location && typeof vehicle.store.location === 'object' && vehicle.store.location.lng 
    ? parseFloat(vehicle.store.location.lng) 
    : 83.301284;

  return {
    id: vehicle.id,
    warehouseId: vehicle.storeId || '',
    name: vehicle.vehicleName || 'Delivery Van',
    vehicleNumber: vehicle.vehicleNumber,
    drivername: driver?.name || null,
    driverContact: driver?.phone || null,
    helperName: helper?.name || null,
    helperContact: helper?.phone || null,
    helperRoute: routeName,
    assistantName: assistant?.name || null,
    assistantContact: assistant?.phone || null,
    assistantRoute: routeName,
    routeName: routeName,
    isLive: isLive,
    vehicleStatusText: vehicleStatusText,
    eta: etaMessage,
    shiftTiming: shiftTimingInfo,
    fulladdress: vehicle.store?.name || 'Warehouse Location',
    latitude: lat,
    longitude: lng,
    visitedLocations
  };
}

/**
 * GET /api/v1/vehicles
 * Fetch active vehicles assigned to a warehouse, optionally filtered to those
 * that serve the customer's mandal (passed via query param or resolved from auth user's default address).
 */
export const getVehiclesByWarehouse = asyncHandler(async (req, res) => {
  const { warehouseId, pincode, customerVillage } = req.query;
  const userId = req.user?.id;

  let targetWarehouseId = null;

  // 1. Resolve explicit warehouseId by UUID id or text Code (e.g. WH-1784612251275)
  if (warehouseId) {
    const targetWh = await prisma.warehouse.findFirst({
      where: {
        OR: [
          { id: warehouseId },
          { code: warehouseId }
        ]
      },
      select: { id: true }
    });
    if (targetWh) {
      targetWarehouseId = targetWh.id;
    }
  }

  // 2. Auto-resolve warehouse from pincode query param or user's default saved address if warehouseId was omitted
  if (!targetWarehouseId) {
    let targetPincode = pincode?.trim() || null;

    if (!targetPincode && userId) {
      const defaultAddr = await prisma.address.findFirst({
        where: { userId, isDefault: true },
        select: { pincode: true }
      });
      if (defaultAddr?.pincode) {
        targetPincode = defaultAddr.pincode;
      }
    }

    if (targetPincode) {
      const wh = await prisma.warehouse.findFirst({
        where: { servicePincodes: { has: targetPincode }, isActive: true },
        select: { id: true }
      });
      if (wh) {
        targetWarehouseId = wh.id;
      }
    }
  }

  if (!targetWarehouseId) {
    return errorResponse(res, 400, 'Warehouse ID or valid customer pincode/location is required');
  }

  // Resolve customer's mandal — prefer explicit param, fall back to user's default address
  let customerMandal = customerVillage?.trim() || null;
  if (!customerMandal && userId) {
    const defaultAddr = await prisma.address.findFirst({
      where: { userId, isDefault: true },
      select: { mandal: true }
    });
    customerMandal = defaultAddr?.mandal?.trim() || null;
  }

  const normalise = (s) => (s || '').toLowerCase().trim();
  const mandalNorm = normalise(customerMandal);

  // Find all active vehicles for the warehouse
  const vehicles = await prisma.vehicle.findMany({
    where: { storeId: targetWarehouseId, status: true },
    include: {
      assignedUsers: {
        select: { id: true, name: true, role: true, phone: true }
      },
      store: {
        select: { id: true, name: true, location: true }
      }
    }
  });

  // Map to frontend structures, checking if each vehicle's route serves the customer's mandal
  const mappedVehicles = await Promise.all(
    vehicles.map(async (vehicle) => {
      // Find if there is an active execution
      const activeExecution = await prisma.routeExecution.findFirst({
        where: { vehicleId: vehicle.id, status: 'IN_PROGRESS' },
        include: { route: true }
      });

      // Find the vehicle's route assignment (even if not currently executing)
      let servesCustomerLocation = false;
      if (mandalNorm) {
        const assignment = await prisma.routeAssignment.findFirst({
          where: { vehicleId: vehicle.id, status: true },
          include: {
            route: {
              select: {
                villages: true,
                stops: {
                  select: { village: { select: { name: true } } }
                }
              }
            }
          }
        });

        if (assignment?.route) {
          const stopNames = [
            ...(assignment.route.villages || []),
            ...(assignment.route.stops || []).map(s => s.village?.name).filter(Boolean)
          ];
          servesCustomerLocation = stopNames.some(n =>
            normalise(n) === mandalNorm ||
            normalise(n).includes(mandalNorm) ||
            mandalNorm.includes(normalise(n))
          );
        }
      }

      const model = await mapVehicleToModel(vehicle, activeExecution);
      return { ...model, servesCustomerLocation };
    })
  );

  // If customer's mandal filter is provided, prefer matching vehicles, but fall back to all warehouse vehicles if no route matches
  const matchingVehicles = mandalNorm
    ? mappedVehicles.filter(v => v.servesCustomerLocation)
    : mappedVehicles;

  const finalVehicles = (mandalNorm && matchingVehicles.length > 0)
    ? matchingVehicles
    : mappedVehicles;

  return successResponse(res, 200, finalVehicles, 'Vehicles retrieved successfully');
});

/**
 * GET /api/v1/vehicles/:id/track
 * Fetch real-time tracking details for a specific vehicle.
 */
export const getVehicleTrackingData = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      assignedUsers: {
        select: {
          id: true,
          name: true,
          role: true,
          phone: true
        }
      },
      store: {
        select: {
          id: true,
          name: true,
          location: true
        }
      }
    }
  });

  if (!vehicle) {
    return errorResponse(res, 404, 'Vehicle not found');
  }

  // Find active execution
  const activeExecution = await prisma.routeExecution.findFirst({
    where: {
      vehicleId: vehicle.id,
      status: 'IN_PROGRESS'
    },
    include: {
      route: true
    }
  });

  const trackingModel = await mapVehicleToModel(vehicle, activeExecution);
  return successResponse(res, 200, trackingModel, 'Vehicle tracking details retrieved successfully');
});
