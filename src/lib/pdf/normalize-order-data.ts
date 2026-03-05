/**
 * Phase 28: Robot Creador de Guias PDF — Claude AI Data Normalization
 *
 * Normalizes messy CRM order data into a clean, structured format for
 * PDF label and Excel spreadsheet generation.
 *
 * Uses Claude AI to handle edge cases in phone formatting, city/department
 * abbreviations, name splitting, and unit calculation from price.
 *
 * Processes orders in batches of 20 to stay within token limits.
 * Returns sensible defaults if a batch fails (never throws).
 */

import Anthropic from '@anthropic-ai/sdk'
import type { GuideGenOrder, NormalizedOrder, EnviaOrderData } from './types'

/** Maximum orders per Claude API call */
const BATCH_SIZE = 20

/**
 * Build the normalization prompt for a batch of orders.
 * Claude receives the raw order data and returns normalized JSON.
 */
function buildNormalizationPrompt(orders: GuideGenOrder[]): string {
  const orderData = orders.map((o) => ({
    id: o.id,
    nombre_pedido: o.name,
    contacto: o.contactName,
    telefono: o.contactPhone,
    direccion: o.shippingAddress,
    ciudad: o.shippingCity,
    departamento: o.shippingDepartment,
    total: o.totalValue,
    productos: o.products,
    tags: o.tags,
    custom_fields: o.customFields,
  }))

  return `Normaliza estos datos de pedidos para generar guias de envio colombianas.

Reglas:
1. Telefono: quitar prefijo 57, +57, 057 al inicio. Dejar solo 10 digitos. Si no hay telefono valido, dejar "0000000000".
2. Ciudad: formatear como "CIUDAD (DEPTO_ABREV)". Ejemplo: "bucaramanga, santander" -> "BUCARAMANGA (STDER)". Todo en MAYUSCULAS.
   Abreviaturas comunes: STDER=Santander, ANT=Antioquia, VLL=Valle, CUN=Cundinamarca, BOL=Bolivar, ATL=Atlantico, BOY=Boyaca, CAL=Caldas, CES=Cesar, COR=Cordoba, HUI=Huila, MAG=Magdalena, NAR=Narino, NDS=Norte de Santander, QUI=Quindio, RIS=Risaralda, SUC=Sucre, TOL=Tolima, MET=Meta, CAQ=Caqueta, CAS=Casanare, PUT=Putumayo, ARA=Arauca, GUA=Guaviare, GUJ=Guajira, AMA=Amazonas, VCH=Vaupes, VID=Vichada, CHO=Choco, SPE=San Andres, BOG=Bogota.
3. Unidades: calcular por precio total: $77,900=1, $109,900=2, $139,900=3. Si no coincide exactamente, redondear al mas cercano (divide total entre 77900 y redondea arriba, minimo 1).
4. Nombres: todo en MAYUSCULAS. Separar en nombre (primer token) y apellido (resto).
5. pagoAnticipado: true si los tags incluyen "P/A". De lo contrario false.
6. valorCobrar: formato colombiano con punto como separador de miles. Ejemplo: 77900 -> "$77.900". Si pagoAnticipado es true, valorCobrar debe ser "$0".
7. barrio: extraer del campo direccion si es posible (a veces aparece despues de un guion o coma). Si no es identificable, dejar vacio "".
8. direccion: la direccion completa SIN el barrio (si lo extrajiste).
9. numero: usar el nombre_pedido del pedido como numero de envio.

Datos de los pedidos (JSON):
${JSON.stringify(orderData, null, 2)}

Responde UNICAMENTE con un JSON array valido (sin texto adicional, sin markdown). Cada elemento debe tener esta estructura exacta:
[
  {
    "id": "id_original_del_pedido",
    "numero": "string",
    "nombre": "string",
    "apellido": "string",
    "direccion": "string",
    "barrio": "string",
    "ciudad": "string",
    "telefono": "string",
    "valorCobrar": "string",
    "valorNumerico": number,
    "pagoAnticipado": boolean,
    "unidades": number
  }
]

IMPORTANTE: Responde SOLO con el JSON array. Sin explicaciones, sin markdown.`
}

/**
 * Build a fallback NormalizedOrder from raw order data when Claude fails.
 * Uses sensible defaults so the document can still be generated.
 */
function buildFallbackOrder(order: GuideGenOrder): NormalizedOrder {
  const contactParts = (order.contactName || 'SIN NOMBRE').toUpperCase().split(' ')
  const nombre = contactParts[0] || 'SIN'
  const apellido = contactParts.slice(1).join(' ') || 'NOMBRE'

  // Basic phone cleanup
  let telefono = (order.contactPhone || '0000000000').replace(/[\s\-\+]/g, '')
  if (telefono.startsWith('57') && telefono.length > 10) {
    telefono = telefono.slice(telefono.length - 10)
  }
  if (telefono.length !== 10) telefono = '0000000000'

  // Basic city formatting
  const ciudad = [order.shippingCity, order.shippingDepartment]
    .filter(Boolean)
    .join(' ')
    .toUpperCase() || 'SIN CIUDAD'

  // Unit calculation
  const unidades = Math.max(1, Math.ceil(order.totalValue / 77900))

  // Check pago anticipado (tag "P/A")
  const pagoAnticipado = order.tags.some((t) => t.toUpperCase() === 'P/A')

  const valorNumerico = pagoAnticipado ? 0 : order.totalValue
  const valorCobrar = pagoAnticipado
    ? '$0'
    : `$${valorNumerico.toLocaleString('es-CO')}`

  return {
    orderId: order.id,
    numero: order.name || order.id.slice(0, 8),
    nombre,
    apellido,
    direccion: order.shippingAddress || 'SIN DIRECCION',
    barrio: '',
    ciudad,
    telefono,
    valorCobrar,
    valorNumerico,
    pagoAnticipado,
    unidades,
  }
}

/**
 * Validate a parsed Claude response object has all required fields.
 * Returns true if the object can be safely mapped to NormalizedOrder.
 */
function isValidNormalizedResponse(obj: Record<string, unknown>): boolean {
  const requiredStrings = ['id', 'numero', 'nombre', 'apellido', 'direccion', 'ciudad', 'telefono', 'valorCobrar']
  const requiredNumbers = ['valorNumerico', 'unidades']

  for (const key of requiredStrings) {
    if (typeof obj[key] !== 'string') return false
  }
  for (const key of requiredNumbers) {
    if (typeof obj[key] !== 'number') return false
  }
  if (typeof obj.pagoAnticipado !== 'boolean') return false

  return true
}

/**
 * Normalize a batch of orders using Claude AI.
 * Returns normalized orders or fallbacks for each order.
 */
async function normalizeBatch(
  client: Anthropic,
  batch: GuideGenOrder[]
): Promise<NormalizedOrder[]> {
  try {
    const prompt = buildNormalizationPrompt(batch)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    // Extract text from response
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Parse JSON array from response (handle potential markdown fences)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.warn('[pdf/normalize] Claude response was not valid JSON array:', text.slice(0, 300))
      return batch.map(buildFallbackOrder)
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>

    if (!Array.isArray(parsed)) {
      console.warn('[pdf/normalize] Claude response was not an array')
      return batch.map(buildFallbackOrder)
    }

    // Create a lookup map by order ID for quick matching
    const orderMap = new Map(batch.map((o) => [o.id, o]))
    const resultMap = new Map<string, NormalizedOrder>()

    for (const item of parsed) {
      const orderId = item.id as string
      if (!orderId || !orderMap.has(orderId)) continue

      if (isValidNormalizedResponse(item)) {
        resultMap.set(orderId, {
          orderId,
          numero: item.numero as string,
          nombre: item.nombre as string,
          apellido: item.apellido as string,
          direccion: item.direccion as string,
          barrio: (item.barrio as string) || '',
          ciudad: item.ciudad as string,
          telefono: item.telefono as string,
          valorCobrar: item.valorCobrar as string,
          valorNumerico: item.valorNumerico as number,
          pagoAnticipado: item.pagoAnticipado as boolean,
          unidades: item.unidades as number,
        })
      }
    }

    // Return results in original order, using fallbacks for any missing items
    return batch.map((order) => resultMap.get(order.id) || buildFallbackOrder(order))
  } catch (error) {
    console.error('[pdf/normalize] Claude API error for batch:', error)
    return batch.map(buildFallbackOrder)
  }
}

/**
 * Normalize order data for guide generation using Claude AI.
 *
 * Processes orders in batches of 20 to stay within token limits.
 * Handles Claude errors gracefully: if a batch fails, returns orders
 * with sensible defaults rather than throwing.
 *
 * @param orders - Raw order data from domain layer
 * @returns Normalized orders ready for PDF/Excel generation
 */
export async function normalizeOrdersForGuide(
  orders: GuideGenOrder[]
): Promise<NormalizedOrder[]> {
  if (orders.length === 0) return []

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const results: NormalizedOrder[] = []

  // Process in batches
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE)
    const normalized = await normalizeBatch(client, batch)
    results.push(...normalized)
  }

  return results
}

/**
 * Convert a NormalizedOrder into the Envia Excel format.
 *
 * Splits the city field "BUCARAMANGA (STDER)" into:
 *   - municipio: "BUCARAMANGA"
 *   - departamento: "STDER"
 */
export function normalizedToEnvia(n: NormalizedOrder): EnviaOrderData {
  // Parse city: "BUCARAMANGA (STDER)" -> municipio="BUCARAMANGA", departamento="STDER"
  const cityMatch = n.ciudad.match(/^(.+?)\s*\((.+?)\)\s*$/)
  const municipio = cityMatch ? cityMatch[1].trim() : n.ciudad
  const departamento = cityMatch ? cityMatch[2].trim() : ''

  return {
    valor: n.valorNumerico,
    nombre: `${n.nombre} ${n.apellido}`.trim(),
    telefono: n.telefono,
    direccion: n.direccion,
    municipio,
    departamento,
  }
}
