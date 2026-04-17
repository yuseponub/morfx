/**
 * Phase 28: Robot Creador de Guias PDF — PDFKit Label Generator
 *
 * Generates a multi-page 4x6 inch PDF with SOMNIO-branded shipping labels
 * for Interrapidisimo and Bogota carriers.
 *
 * Layout per page (matches SOMNIO reference format):
 *   - SOMNIO logo (centered)
 *   - Horizontal separator
 *   - "ENVIO PRIORIDAD {N} –" header
 *   - Horizontal separator
 *   - "ENVIAR A:" + recipient name
 *   - Address, neighborhood, city, phone
 *   - Horizontal separator
 *   - "VALOR A COBRAR:" label
 *   - Large centered price
 *   - Horizontal separator
 *   - Code 128 barcode with number
 *
 * Returns a Buffer for serverless compatibility (no filesystem).
 */

import PDFDocument from 'pdfkit'
import bwipjs from 'bwip-js/node'
import type { NormalizedOrder } from './types'

/** Page dimensions: 4x6 inches = 288x432 points (72 pts/inch) */
const WIDTH = 288
const HEIGHT = 432
const MARGIN = 14
const CONTENT_W = WIDTH - MARGIN * 2
const LINE_WIDTH = 1.5

/** Draw a horizontal separator line across the content area */
function drawSeparator(doc: PDFKit.PDFDocument, y: number): void {
  doc
    .save()
    .moveTo(MARGIN, y)
    .lineTo(WIDTH - MARGIN, y)
    .lineWidth(LINE_WIDTH)
    .strokeColor('#000000')
    .stroke()
    .restore()
}

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

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i]
    const pageNum = i + 1

    // CRITICAL: pass size to each addPage to avoid default Letter size
    doc.addPage({ size: [WIDTH, HEIGHT], margin: MARGIN })

    let y = MARGIN

    // --- Logo (centered) ---
    if (logoBuffer) {
      try {
        const logoW = 160
        const logoX = (WIDTH - logoW) / 2
        doc.image(logoBuffer, logoX, y, { width: logoW })
        y += 52
      } catch (logoErr) {
        console.warn('[pdf/generate] Failed to render logo, skipping:', logoErr)
        y += 10
      }
    }

    // --- Combinacion de productos (condicional) ---
    // Se renderiza SOLO si la orden es mixed (contiene productos distintos a Elixir puro).
    // Safe orders (Elixir puro) saltan este bloque y el layout queda identico al actual.
    //
    // Colores:
    //   - Borde: #ff751f (mismo naranja de PRODUCT_TYPE_COLORS.ash.dotColor — consistencia con dots Kanban)
    //   - Fill: #FFF4E5 (naranja claro para contraste suave)
    //   - Texto: #B45309 (naranja oscuro legible sobre fill claro)
    //
    // PITFALL 2 (RESEARCH): fillAndStroke deja el fillColor interno en el color del box;
    // hay que llamar fillColor() ANTES del text() y resetear a '#000000' DESPUES para no
    // contaminar el render posterior (ENVIAR A:, direccion, etc.).
    if (order.isMixed && order.productLabels) {
      const boxH = 28
      const boxY = y
      doc
        .save()
        .rect(MARGIN, boxY, CONTENT_W, boxH)
        .fillAndStroke('#FFF4E5', '#ff751f')
        .restore()

      doc
        .fillColor('#B45309')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`COMBINACIÓN: ${order.productLabels}`, MARGIN, boxY + 9, {
          align: 'center',
          width: CONTENT_W,
        })

      // Reset state (Pitfall 2 — evita que el fillColor naranja contamine el resto del render)
      doc.fillColor('#000000')

      y += boxH + 6
    }

    // --- Separator 1 ---
    drawSeparator(doc, y)
    y += 8

    // --- "ENVIO PRIORIDAD N –" ---
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(`ENVIO PRIORIDAD ${pageNum} –`, MARGIN, y, {
        align: 'center',
        width: CONTENT_W,
      })
    y += 20

    // --- Separator 2 ---
    drawSeparator(doc, y)
    y += 10

    // --- "ENVIAR A:" + Name ---
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('ENVIAR A:   ', MARGIN, y, { continued: true })
      .font('Helvetica-Bold')
      .text(`${order.nombre} ${order.apellido}`)
    y += 18

    // --- Address ---
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(order.direccion, MARGIN, y, { width: CONTENT_W })
    // Measure how many lines the address took
    const addrHeight = doc.heightOfString(order.direccion, { width: CONTENT_W })
    y += Math.max(addrHeight, 14) + 2

    // --- Neighborhood ---
    if (order.barrio) {
      doc
        .fontSize(9)
        .font('Helvetica')
        .text(`Barrio ${order.barrio}`, MARGIN, y)
      y += 14
    }

    // --- City ---
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`${order.ciudad} -`, MARGIN, y)
    y += 14

    // --- Phone ---
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(order.telefono, MARGIN, y)
    y += 16

    // --- Units indicator (if more than 1) ---
    if (order.unidades > 1) {
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`UNIDADES: ${order.unidades}`, MARGIN, y)
      y += 14
    }

    // --- Separator 3 ---
    drawSeparator(doc, y)
    y += 8

    // --- "VALOR A COBRAR:" ---
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('VALOR A COBRAR:', MARGIN, y, {
        align: 'center',
        width: CONTENT_W,
      })
    y += 18

    // --- Price (large, centered) ---
    if (order.pagoAnticipado) {
      const uLabel = order.unidades === 1 ? 'unidad' : 'unidades'
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`$0 - Pago Anticipado ${order.unidades} ${uLabel}`, MARGIN, y, {
          align: 'center',
          width: CONTENT_W,
        })
      y += 28
    } else {
      doc
        .fontSize(26)
        .font('Helvetica-Bold')
        .text(order.valorCobrar, MARGIN, y, {
          align: 'center',
          width: CONTENT_W,
        })
      y += 34
    }

    // --- Separator 4 ---
    drawSeparator(doc, y)
    y += 12

    // --- Barcode (Code 128, centered) ---
    try {
      const barcodeText = order.numero || 'N/A'
      const barcodePng = await bwipjs.toBuffer({
        bcid: 'code128',
        text: barcodeText,
        scale: 2,
        height: 14,
        includetext: true,
        textxalign: 'center',
        textsize: 10,
      })

      const barcodeW = CONTENT_W - 20
      const barcodeX = (WIDTH - barcodeW) / 2
      doc.image(barcodePng, barcodeX, y, { width: barcodeW })
    } catch (barcodeErr) {
      console.warn(
        `[pdf/generate] Barcode failed for order ${order.orderId}, skipping:`,
        barcodeErr
      )
      // Fallback: print shipping number as text
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(order.numero || 'N/A', MARGIN, y, {
          align: 'center',
          width: CONTENT_W,
        })
    }
  }

  doc.end()

  // Resolve on 'end' event (not 'finish') — PDFKit specific
  return new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
