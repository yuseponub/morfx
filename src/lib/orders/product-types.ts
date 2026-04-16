/**
 * Clasificacion visual de tipos de producto para cards de CRM.
 *
 * Deteccion derivada en render (sin cambios de schema de DB).
 * Workspace objetivo: Somnio. Tipos: melatonina, ash, magnesio_forte.
 *
 * Prioridad de deteccion:
 *   1. SKU exacto (normalizado: trim + lowercase) contra SKU_TO_PRODUCT_TYPE
 *   2. Fallback por substring en titulo (case-insensitive), orden:
 *      magnesio forte -> wagand/waghan -> elixir/melatonina
 *   3. null (sin match)
 */

// Tailwind static classes used by PRODUCT_TYPE_COLORS (do NOT remove):
// bg-green-500 bg-orange-500 bg-purple-500
// bg-green-500/10 bg-orange-500/10 bg-purple-500/10
// text-green-600 text-orange-600 text-purple-600

export type ProductType = 'melatonina' | 'ash' | 'magnesio_forte'

/** Orden estable para renderizado de multiples dots en una card. */
const PRODUCT_TYPE_ORDER: readonly ProductType[] = [
  'melatonina',
  'ash',
  'magnesio_forte',
] as const

/**
 * Clases Tailwind COMPLETAS (literales) por tipo.
 * IMPORTANTE (Tailwind v4 JIT): No construir dinamicamente — el scanner no las detectaria.
 */
export const PRODUCT_TYPE_COLORS: Record<
  ProductType,
  { label: string; dotClass: string; bgClass: string; textClass: string }
> = {
  melatonina: {
    label: 'Melatonina',
    dotClass: 'bg-green-500',
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-600',
  },
  ash: {
    label: 'Ash',
    dotClass: 'bg-orange-500',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-600',
  },
  magnesio_forte: {
    label: 'Magnesio Forte',
    dotClass: 'bg-purple-500',
    bgClass: 'bg-purple-500/10',
    textClass: 'text-purple-600',
  },
}

/**
 * Mapeo explicito SKU -> tipo (10 entradas confirmadas por el usuario).
 * Las keys se normalizan automaticamente (trim + lowercase) al hacer match.
 * Fuente: decision del usuario — capturada en CONTEXT de planning.
 */
export const SKU_TO_PRODUCT_TYPE: Record<string, ProductType> = {
  // Melatonina (Somnio)
  '001': 'melatonina',
  '002': 'melatonina',
  '003': 'melatonina',
  '010': 'melatonina',
  '011': 'melatonina',
  'SOMNIO-90-CAPS': 'melatonina',
  'SOMNIO-90-CAPS-X2': 'melatonina',
  'SOMNIO-90-CAPS-X3': 'melatonina',
  // Ash
  '007': 'ash',
  // Magnesio Forte
  '008': 'magnesio_forte',
}

/** Pre-computado modulo-nivel: SKUs normalizados para lookup O(1). */
const NORMALIZED_SKU_MAP: Record<string, ProductType> = Object.fromEntries(
  Object.entries(SKU_TO_PRODUCT_TYPE).map(([k, v]) => [
    k.trim().toLowerCase(),
    v,
  ])
)

/**
 * Normaliza un SKU para lookup (trim + lowercase).
 * Tolera null/undefined -> retorna string vacio.
 */
function normalizeSku(sku: string | null | undefined): string {
  return (sku ?? '').trim().toLowerCase()
}

/**
 * Fallback por titulo: reglas del usuario (CONTEXT).
 * ORDEN IMPORTA — primer match gana.
 *
 * Reglas:
 *   1. 'magnesio forte' -> magnesio_forte
 *   2. 'wagand' OR 'waghan' -> ash (captura Ashwagandha y typo ASWAGHANDA)
 *   3. 'elixir' OR 'melatonina' -> melatonina
 *
 * Nota importante: esta regla se desvia deliberadamente del RESEARCH.md
 * (que proponia /\bash\b/i). El usuario eligio capturar 'wagand'/'waghan'
 * porque Somnio vende Ashwagandha y lo clasifica como tipo 'ash'.
 */
function detectByTitle(title: string): ProductType | null {
  const lower = title.toLowerCase()
  if (lower.includes('magnesio forte')) return 'magnesio_forte'
  if (lower.includes('wagand') || lower.includes('waghan')) return 'ash'
  if (lower.includes('elixir') || lower.includes('melatonina')) return 'melatonina'
  return null
}

/**
 * Clasifica UN producto por SKU exacto primero, titulo como fallback.
 * Retorna null si no hay match (el producto no tendra dot).
 */
export function detectProductType(product: {
  sku?: string | null
  title?: string | null
}): ProductType | null {
  const sku = normalizeSku(product.sku)
  if (sku && NORMALIZED_SKU_MAP[sku]) {
    return NORMALIZED_SKU_MAP[sku]
  }

  const title = product.title ?? ''
  if (title) {
    const byTitle = detectByTitle(title)
    if (byTitle) return byTitle
  }

  return null
}

/**
 * Dada una orden, retorna los tipos unicos presentes en orden estable.
 * Dedupea multiples productos del mismo tipo.
 *
 * @example
 *   detectOrderProductTypes([{ sku: '007' }, { sku: '001' }])
 *   // => ['melatonina', 'ash']  (orden estable definido en PRODUCT_TYPE_ORDER)
 */
export function detectOrderProductTypes(
  products: Array<{ sku?: string | null; title?: string | null }>
): ProductType[] {
  const found = new Set<ProductType>()
  for (const p of products) {
    const t = detectProductType(p)
    if (t) found.add(t)
  }
  return PRODUCT_TYPE_ORDER.filter((t) => found.has(t))
}
