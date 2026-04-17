/**
 * Phase 28: Robot Creador de Guias PDF — ExcelJS Spreadsheet Generator
 *
 * Generates an .xlsx file with order data formatted for Envia carrier
 * bulk upload. Columns match the Envia portal import format:
 *   Valor, Nombre, Telefono, Direccion, Municipio, Departamento
 *
 * Extension (crm-verificar-combinacion-productos):
 *   Adds an informational column "COMBINACION" at the END (preserves
 *   portal-import prefix; portal ignores trailing column). Rows of orders
 *   that are NOT pure Elixir (e.g. contain Ashwagandha or Magnesio Forte)
 *   get a soft-yellow row fill so the agent can spot them and decide
 *   manually whether to process/split them.
 *
 * Returns a Buffer for serverless compatibility (no filesystem).
 */

import ExcelJS from 'exceljs'
import type { EnviaOrderData } from './types'

/** Soft yellow ARGB (8-digit, alpha+RGB — see RESEARCH Pitfall 3). */
const MIXED_ROW_FILL_ARGB = 'FFFFF59D'

/** Header light gray fill (existente antes de este plan). */
const HEADER_FILL_ARGB = 'FFE0E0E0'

/**
 * Generate an Envia-format Excel spreadsheet from order data.
 *
 * @param orders - Order data already converted to Envia format (via normalizedToEnvia)
 *                 Opcionalmente enriquecido con isMixed + combinacion por el orchestrator.
 * @returns Excel .xlsx file as a Buffer ready for Supabase Storage upload
 */
export async function generateEnviaExcel(
  orders: EnviaOrderData[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Envios Envia')

  // Define columns matching Envia portal import format.
  // NOTA: COMBINACION se agrega AL FINAL para preservar el prefijo portal-import
  // (el portal Envia ignora columnas extra al final). Ver RESEARCH Open Q #3.
  sheet.columns = [
    { header: 'Valor', key: 'valor', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Telefono', key: 'telefono', width: 15 },
    { header: 'Direccion', key: 'direccion', width: 40 },
    { header: 'Municipio', key: 'municipio', width: 20 },
    { header: 'Departamento', key: 'departamento', width: 18 },
    { header: 'COMBINACION', key: 'combinacion', width: 32 },
  ]

  // Style header row: bold font, light gray background.
  // IMPORTANTE (RESEARCH Pitfall 6): MANTENER el per-cell fill en el header.
  // NO cambiar a row-level `sheet.getRow(1).fill` porque el per-cell fill
  // ya existente ganaria contra el row-level y quedaria inconsistente.
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL_ARGB },
    }
  })

  // Add data rows.
  // Para cada orden, agrega la fila con la celda COMBINACION llena (si isMixed)
  // o vacia (si safe). Aplica row-level fill amarillo SOLO cuando isMixed es true.
  // El row-level fill propaga a las 7 celdas incluyendo COMBINACION (las celdas
  // nuevas no tienen per-cell fill, asi que el row-level gana — Pitfall 6).
  orders.forEach((order, idx) => {
    const rowIdx = idx + 2 // header es row 1
    const row = sheet.addRow({
      valor: order.valor,
      nombre: order.nombre,
      telefono: order.telefono,
      direccion: order.direccion,
      municipio: order.municipio,
      departamento: order.departamento,
      combinacion: order.isMixed ? (order.combinacion ?? '') : '',
    })

    if (order.isMixed) {
      // Row-level fill: propaga a las 7 celdas (ninguna tiene per-cell fill).
      // ARGB 8-digit (Pitfall 3). FFFFF59D = amarillo soft opaco.
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: MIXED_ROW_FILL_ARGB },
      }
    }

    // Sanity-check: variable rowIdx disponible para debug si algun dia se
    // necesita per-cell override. Hoy no se usa pero se mantiene la lectura
    // coherente del loop.
    void rowIdx
  })

  // Write to buffer (serverless-compatible, no filesystem)
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
