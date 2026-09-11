import { prisma } from '../config/prismaClient.js'
import { errorResponse } from '../utils/responseHelper.js'
import { asyncHandler } from '../middlewares/errorMiddleware.js'
import logger from '../utils/logger.js'

/**
 * Generate HTML invoice for a completed order
 * GET /api/v1/orders/:id/invoice
 */
export const getOrderInvoice = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const orderId = req.params.id

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        address: true,
        consumer: {
          select: { name: true, phone: true }
        }
      }
    })

    if (!order) {
      return errorResponse(res, 404, 'Order not found')
    }

    if (order.consumerId !== userId) {
      return errorResponse(res, 403, 'Access denied to this order')
    }

    // Build the dynamic premium HTML invoice
    const invoiceHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Invoice #${order.orderNumber}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 40px; }
          .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .15); font-size: 16px; line-height: 24px; }
          .invoice-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #047857; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #047857; }
          .meta-info { text-align: right; }
          .invoice-details { display: flex; justify-content: space-between; margin-top: 30px; margin-bottom: 30px; }
          .details-col { width: 48%; }
          .details-col h3 { border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #f3f4f6; color: #374151; font-weight: bold; text-align: left; padding: 10px; border: 1px solid #e5e7eb; }
          td { padding: 10px; border: 1px solid #e5e7eb; }
          .text-right { text-align: right; }
          .totals-table { width: 40%; margin-left: auto; margin-top: 20px; }
          .totals-table td { border: none; padding: 5px 10px; }
          .grand-total { font-weight: bold; font-size: 18px; color: #047857; border-top: 2px solid #047857 !important; }
          .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #9ca3af; }
          @media print {
            body { padding: 0; }
            .invoice-box { border: none; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="invoice-header">
            <div class="logo">VillagKart</div>
            <div class="meta-info">
              <strong>Invoice #:</strong> ${order.orderNumber}<br>
              <strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}<br>
              <strong>Status:</strong> ${order.status}
            </div>
          </div>

          <div class="invoice-details">
            <div class="details-col">
              <h3>Billed To:</h3>
              <strong>${order.consumer?.name || 'Customer'}</strong><br>
              Phone: ${order.consumer?.phone || 'N/A'}<br>
              Address: ${order.address ? `${order.address.line1}, ${order.address.line2 || ''}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}` : 'N/A'}
            </div>
            <div class="details-col" style="text-align: right;">
              <h3>Seller:</h3>
              <strong>Villagekart Pvt Ltd</strong><br>
              GSTIN: 37AAAAA1111A1Z1<br>
              Support: support@villagekart.com
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price (₹)</th>
                <th class="text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${item.productName}</td>
                  <td class="text-right">${item.quantity} ${item.unit}</td>
                  <td class="text-right">${Number(item.unitPrice).toFixed(2)}</td>
                  <td class="text-right">${Number(item.totalPrice).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <table class="totals-table">
            <tr>
              <td>Subtotal:</td>
              <td class="text-right">₹${Number(order.taxableAmount || (Number(order.totalAmount) - Number(order.taxAmount))).toFixed(2)}</td>
            </tr>
            <tr>
              <td>CGST:</td>
              <td class="text-right">₹${Number(order.cgst || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td>SGST:</td>
              <td class="text-right">₹${Number(order.sgst || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td>IGST:</td>
              <td class="text-right">₹${Number(order.igst || 0).toFixed(2)}</td>
            </tr>
            ${order.discount > 0 ? `
              <tr>
                <td>Discount:</td>
                <td class="text-right" style="color: #b91c1c;">-₹${Number(order.discount).toFixed(2)}</td>
              </tr>
            ` : ''}
            <tr class="grand-total">
              <td>Grand Total:</td>
              <td class="text-right">₹${Number(order.totalAmount).toFixed(2)}</td>
            </tr>
          </table>

          <div class="footer">
            Thank you for shopping with VillageKart!<br>
            This is a computer-generated invoice and does not require a signature.
          </div>
        </div>
      </body>
      </html>
    `

    res.setHeader('Content-Type', 'text/html')
    return res.send(invoiceHtml)
  } catch (error) {
    logger.error('Error generating invoice', { orderId, error: error.message })
    return errorResponse(res, 500, 'Failed to generate invoice')
  }
})
