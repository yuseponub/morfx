/**
 * Phase 28: Robot Creador de Guias PDF — PDFKit Label Generator
 *
 * Generates a multi-page 4x6 inch PDF with shipping labels for
 * Interrapidisimo and Bogota carriers.
 *
 * Each page contains:
 * - Company logo (optional)
 * - Shipping number
 * - Recipient data (name, address, neighborhood, city, phone)
 * - Amount to collect (valor a cobrar)
 * - Units indicator (if > 1)
 * - Code 128 barcode
 * - "PAGO ANTICIPADO" indicator (if prepaid)
 *
 * Returns a Buffer for serverless compatibility (no filesystem).
 */

import PDFDocument from 'pdfkit'
import bwipjs from 'bwip-js/node'
import type { NormalizedOrder } from './types'

/** Page dimensions: 4x6 inches = 288x432 points (72 pts/inch) */
const WIDTH = 288
const HEIGHT = 432
const MARGIN = 12

/**
 * Generate a multi-page PDF of shipping labels from normalized order data.
 *
 * @param orders - Normalized order data (output of Claude AI normalization)
 * @param logoBuffer - Optional PNG/JPEG logo image buffer. Skipped if undefined.
 * @returns PDF as a Buffer ready for Supabase Storage upload
 */
export async function generateGuidesPdf(
  orders: NormalizedOrder[],
  logoBuffer?: Buffer
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [WIDTH, HEIGHT],
    margin: MARGIN,
    autoFirstPage: false,
  })

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  for (const order of orders) {
    // CRITICAL: pass size to each addPage to avoid default Letter size
    doc.addPage({ size: [WIDTH, HEIGHT], margin: MARGIN })

    // --- Logo (optional) ---
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, MARGIN, { width: 80 })
      } catch (logoErr) {
        console.warn('[pdf/generate] Failed to render logo, skipping:', logoErr)
      }
    }

    // --- Shipping number (right-aligned at top) ---
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(order.numero, 100, 20, {
        align: 'right',
        width: WIDTH - 112,
      })

    // --- Recipient data block ---
    const startY = 60

    // Name (bold)
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`${order.nombre} ${order.apellido}`, MARGIN, startY)

    // Address
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(order.direccion, MARGIN, startY + 16)

    // Neighborhood - City
    const cityLine = order.barrio
      ? `${order.barrio} - ${order.ciudad}`
      : order.ciudad
    doc.text(cityLine, MARGIN, startY + 30)

    // Phone
    doc.text(`Tel: ${order.telefono}`, MARGIN, startY + 44)

    // --- Amount (centered, large) ---
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(order.valorCobrar, MARGIN, startY + 70, {
        align: 'center',
        width: WIDTH - MARGIN * 2,
      })

    // --- Units indicator (if more than 1) ---
    if (order.unidades > 1) {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`UNIDADES: ${order.unidades}`, MARGIN, startY + 90, {
          align: 'center',
          width: WIDTH - MARGIN * 2,
        })
    }

    // --- Barcode (Code 128) ---
    try {
      const barcodePng = await bwipjs.toBuffer({
        bcid: 'code128',
        text: order.numero || 'N/A',
        scale: 2,
        height: 12,
        includetext: true,
        textxalign: 'center',
      })
      doc.image(barcodePng, 40, startY + 110, { width: WIDTH - 80 })
    } catch (barcodeErr) {
      // If barcode generation fails, still produce the label without it
      console.warn(
        `[pdf/generate] Barcode failed for order ${order.orderId}, skipping:`,
        barcodeErr
      )
    }

    // --- Pago anticipado indicator ---
    if (order.pagoAnticipado) {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('PAGO ANTICIPADO', MARGIN, HEIGHT - 40, {
          align: 'center',
          width: WIDTH - MARGIN * 2,
        })
    }
  }

  doc.end()

  // Resolve on 'end' event (not 'finish') — PDFKit specific
  return new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
