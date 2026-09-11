import { prisma } from '../config/prismaClient.js'
import logger from '../utils/logger.js'

/**
 * Releases reservations for a given order (either COMPLETED or CANCELLED).
 * @param {Object} param0
 * @param {string} param0.orderId
 * @param {'COMPLETED'|'CANCELLED'} param0.status
 */
export async function releaseReservation({ orderId, status }) {
  try {
    await prisma.$transaction(async (t) => {
      const reservations = await t.inventoryReservation.findMany({
        where: { orderId, status: 'PENDING' }
      });

      if (reservations.length === 0) {
        logger.info(`[ReservationService] No pending reservations found for order: ${orderId}`);
        return;
      }

      for (const res of reservations) {
        // 1. Atomic state claim to eliminate concurrent execution race conditions
        const claimResult = await t.inventoryReservation.updateMany({
          where: { id: res.id, status: 'PENDING' },
          data: { status }
        });

        if (claimResult.count === 0) {
          logger.warn(`[ReservationService] Reservation ${res.id} is not PENDING. Skipping release.`);
          continue;
        }

        const unified = await t.unifiedInventory.findFirst({
          where: {
            productId: res.productId,
            productVariantId: res.productVariantId || null,
            locationId: res.locationId
          }
        });

        if (!unified) continue;

        if (status === 'COMPLETED') {
          // Guarded DB decrement
          const invUpdate = await t.unifiedInventory.updateMany({
            where: {
              id: unified.id,
              reserved: { gte: res.quantity },
              onHand: { gte: res.quantity }
            },
            data: {
              onHand: { decrement: res.quantity },
              reserved: { decrement: res.quantity }
            }
          });

          if (invUpdate.count === 0) {
            logger.error(`[ReservationService] Underflow error consuming reservation ${res.id}`);
            continue;
          }

          // Log movement & ledger for fulfillment
          const movement = await t.inventoryMovement.create({
            data: {
              type: 'OUTWARD',
              productId: res.productId,
              productVariantId: res.productVariantId,
              fromLocationId: res.locationId,
              quantity: res.quantity,
              referenceType: 'ORDER_FULFILLMENT',
              referenceId: orderId
            }
          });

          await t.stockLedger.create({
            data: {
              productId: res.productId,
              productVariantId: res.productVariantId,
              locationId: res.locationId,
              beforeQuantity: unified.onHand,
              afterQuantity: unified.onHand - res.quantity,
              changeQuantity: -res.quantity,
              movementId: movement.id,
              referenceType: 'ORDER_FULFILLMENT',
              referenceId: orderId
            }
          });
        } else if (status === 'CANCELLED') {
          // Guarded DB update
          const invUpdate = await t.unifiedInventory.updateMany({
            where: {
              id: unified.id,
              reserved: { gte: res.quantity }
            },
            data: {
              reserved: { decrement: res.quantity },
              available: { increment: res.quantity }
            }
          });

          if (invUpdate.count === 0) {
            logger.error(`[ReservationService] Underflow error cancelling reservation ${res.id}`);
            continue;
          }

          // Log movement & ledger for cancellation
          const movement = await t.inventoryMovement.create({
            data: {
              type: 'INWARD',
              productId: res.productId,
              productVariantId: res.productVariantId,
              toLocationId: res.locationId,
              quantity: res.quantity,
              referenceType: 'ORDER_CANCELLATION',
              referenceId: orderId
            }
          });

          await t.stockLedger.create({
            data: {
              productId: res.productId,
              productVariantId: res.productVariantId,
              locationId: res.locationId,
              beforeQuantity: unified.onHand,
              afterQuantity: unified.onHand,
              changeQuantity: res.quantity,
              movementId: movement.id,
              referenceType: 'ORDER_CANCELLATION',
              referenceId: orderId
            }
          });
        }
      }

      logger.info(`[ReservationService] Released reservations for order: ${orderId} as ${status}`);
    }, { timeout: 15000 });
  } catch (error) {
    logger.error(`[ReservationService] Error releasing reservations for order: ${orderId}`, {
      status,
      error: error.message
    });
  }
}

/**
 * Handles physical stock disposition transitions and logs stockLedger entries.
 */
export async function executePhysicalInventoryDisposition({
  prisma,
  productId,
  productVariantId = null,
  locationId,
  quantity = 1,
  disposition = 'SELLABLE',
  referenceId,
  dispositionKey = null,
  sequence = null
}) {
  return await prisma.$transaction(async (tx) => {
    // 0. Granular & Sequence-Aware Idempotency Check
    const refType = disposition === 'SELLABLE' ? 'RETURN_RESTOCK' : disposition === 'REPAIR' ? 'REPAIR_TRANSFER' : 'SCRAP_WRITE_OFF';
    const refKey = dispositionKey || (sequence ? `${referenceId}:${refType}:${sequence}` : referenceId);
    const existingLedger = await tx.stockLedger.findFirst({
      where: {
        referenceId: refKey,
        referenceType: refType
      }
    });

    if (existingLedger) {
      logger.info(`[ReservationService] Duplicate inventory disposition replay ignored`, { refKey, disposition });
      return { ok: true, replay: true, disposition, quantity };
    }

    const unified = await tx.unifiedInventory.findFirst({
      where: {
        productId,
        productVariantId: productVariantId || null,
        locationId
      }
    });

    if (!unified) {
      logger.warn(`[ReservationService] UnifiedInventory record missing for ${productId}`, { locationId });
      return { ok: false, error: 'UnifiedInventory record missing' };
    }

    if (disposition === 'SELLABLE') {
      // 1. Restock available quantity
      await tx.unifiedInventory.update({
        where: { id: unified.id },
        data: {
          available: { increment: quantity },
          onHand: { increment: quantity }
        }
      });

      // 2. Log Movement & StockLedger
      const movement = await tx.inventoryMovement.create({
        data: {
          type: 'INWARD',
          productId,
          productVariantId,
          toLocationId: locationId,
          quantity,
          referenceType: 'RETURN_RESTOCK',
          referenceId
        }
      });

      await tx.stockLedger.create({
        data: {
          productId,
          productVariantId,
          locationId,
          beforeQuantity: unified.available,
          afterQuantity: unified.available + quantity,
          changeQuantity: quantity,
          movementId: movement.id,
          referenceType: 'RETURN_RESTOCK',
          referenceId
        }
      });

      return { ok: true, disposition: 'SELLABLE', restocked: quantity };
    }

    if (disposition === 'REPAIR') {
      const movement = await tx.inventoryMovement.create({
        data: {
          type: 'TRANSFER',
          productId,
          productVariantId,
          fromLocationId: locationId,
          quantity,
          referenceType: 'REPAIR_TRANSFER',
          referenceId
        }
      });

      await tx.stockLedger.create({
        data: {
          productId,
          productVariantId,
          locationId,
          beforeQuantity: unified.onHand,
          afterQuantity: unified.onHand,
          changeQuantity: 0,
          movementId: movement.id,
          referenceType: 'REPAIR_TRANSFER',
          referenceId
        }
      });

      return { ok: true, disposition: 'REPAIR', transferred: quantity };
    }

    if (disposition === 'SCRAP') {
      await tx.unifiedInventory.update({
        where: { id: unified.id },
        data: {
          onHand: { decrement: quantity }
        }
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          type: 'SCRAP',
          productId,
          productVariantId,
          fromLocationId: locationId,
          quantity,
          referenceType: 'SCRAP_WRITE_OFF',
          referenceId
        }
      });

      await tx.stockLedger.create({
        data: {
          productId,
          productVariantId,
          locationId,
          beforeQuantity: unified.onHand,
          afterQuantity: unified.onHand - quantity,
          changeQuantity: -quantity,
          movementId: movement.id,
          referenceType: 'SCRAP_WRITE_OFF',
          referenceId
        }
      });

      return { ok: true, disposition: 'SCRAP', writtenOff: quantity };
    }

    return { ok: false, error: `Unknown disposition: ${disposition}` };
  });
}

