/**
 * Phase 28: Robot Creador de Guias PDF — ExcelJS Spreadsheet Generator
 *
 * Generates an .xlsx file with order data formatted for Envia carrier
 * bulk upload. Columns match the Envia portal import format:
 *   Valor, Nombre, Telefono, Direccion, Municipio, Departamento
 *
 * Returns a Buffer for serverless compatibility (no filesystem).
 */

import ExcelJS from 'exceljs'
import type { EnviaOrderData } from './types'

/**
 * Generate an Envia-format Excel spreadsheet from order data.
 *
 * @param orders - Order data already converted to Envia format (via normalizedToEnvia)
 * @returns Excel .xlsx file as a Buffer ready for Supabase Storage upload
 */
export async function generateEnviaExcel(
  orders: EnviaOrderData[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Envios Envia')

  // Define columns matching Envia portal import format
  sheet.columns = [
    { header: 'Valor', key: 'valor', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Telefono', key: 'telefono', width: 15 },
    { header: 'Direccion', key: 'direccion', width: 40 },
    { header: 'Municipio', key: 'municipio', width: 20 },
    { header: 'Departamento', key: 'departamento', width: 18 },
  ]

  // Style header row: bold font, light gray background
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    }
  })

  // Add data rows
  for (const order of orders) {
    sheet.addRow(order)
  }

  // Write to buffer (serverless-compatible, no filesystem)
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
