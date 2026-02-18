import Fuse from 'fuse.js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ShopifyOrderWebhook, ShopifyLineItem, ShopifyConfig } from './types'
import type { OrderFormData, OrderProductFormData } from '@/lib/orders/types'

/**
 * Catalog product from database.
 * Maps to products table: id, sku, title, price, is_active.
 */
interface CatalogProduct {
  id: string
  sku: string
  title: string
  price: number
  is_active: boolean
}

/**
 * Result of mapping a Shopify order to MorfX format.
 */
export interface MappedOrder {
  order: OrderFormData
  products: OrderProductFormData[]
  shopifyOrderId: number
  shopifyOrderName: string  // "#1001"
  unmatchedProducts: ShopifyLineItem[]  // Products that couldn't be matched
}

/**
 * Maps a Shopify order to MorfX order format.
 * Handles product matching based on configured strategy.
 *
 * @param shopifyOrder - Incoming Shopify order
 * @param config - Shopify integration config
 * @param workspaceId - Target workspace
 * @param contactId - Matched or created contact ID
 * @returns Mapped order data ready for insertion
 */
export async function mapShopifyOrder(
  shopifyOrder: ShopifyOrderWebhook,
  config: ShopifyConfig,
  workspaceId: string,
  contactId: string | null
): Promise<MappedOrder> {
  const supabase = createAdminClient()

  // Get workspace products for matching
  // Query selects exactly the fields needed: id, sku, title, price, is_active
  const { data: catalogProducts } = await supabase
    .from('products')
    .select('id, sku, title, price, is_active')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)

  // Match products based on configured strategy
  const { matched, unmatched } = await matchProducts(
    shopifyOrder.line_items,
    (catalogProducts || []) as CatalogProduct[],
    config.product_matching
  )

  // Build order data
  const order: OrderFormData = {
    contact_id: contactId,
    pipeline_id: config.default_pipeline_id,
    stage_id: config.default_stage_id,
    name: buildOrderName(shopifyOrder),
    description: buildOrderDescription(shopifyOrder),
    shipping_address: buildShippingAddress(shopifyOrder),
    shipping_city: shopifyOrder.shipping_address?.city || null,
    shipping_department: shopifyOrder.shipping_address?.province || null,
    // Note: total_value is computed from products by trigger
  }

  return {
    order,
    products: matched,
    shopifyOrderId: shopifyOrder.id,
    shopifyOrderName: shopifyOrder.name,
    unmatchedProducts: unmatched,
  }
}

/**
 * Matches Shopify line items to MorfX products.
 *
 * @param lineItems - Shopify order line items
 * @param catalogProducts - Workspace products with fields: id, sku, title, price, is_active
 * @param matchStrategy - How to match: 'sku' (exact), 'name' (fuzzy), 'value' (price)
 */
export async function matchProducts(
  lineItems: ShopifyLineItem[],
  catalogProducts: CatalogProduct[],
  matchStrategy: 'sku' | 'name' | 'value'
): Promise<{
  matched: OrderProductFormData[]
  unmatched: ShopifyLineItem[]
}> {
  const matched: OrderProductFormData[] = []
  const unmatched: ShopifyLineItem[] = []

  for (const item of lineItems) {
    const catalogProduct = findMatchingProduct(item, catalogProducts, matchStrategy)

    if (catalogProduct) {
      // Matched - use catalog product ID with Shopify pricing snapshot
      matched.push({
        product_id: catalogProduct.id,
        sku: catalogProduct.sku,
        title: catalogProduct.title,
        unit_price: parseFloat(item.price),  // Use Shopify price as snapshot
        quantity: item.quantity,
      })
    } else {
      // Not matched - create product entry without catalog link
      matched.push({
        product_id: null,  // No catalog link
        sku: item.sku || `SHOPIFY-${item.id}`,
        title: item.title || item.name,
        unit_price: parseFloat(item.price),
        quantity: item.quantity,
      })
      unmatched.push(item)
    }
  }

  return { matched, unmatched }
}

/**
 * Finds matching catalog product based on configured strategy.
 */
function findMatchingProduct(
  lineItem: ShopifyLineItem,
  catalogProducts: CatalogProduct[],
  strategy: 'sku' | 'name' | 'value'
): CatalogProduct | null {
  switch (strategy) {
    case 'sku':
      // Exact SKU match
      if (!lineItem.sku) return null
      return catalogProducts.find(p => p.sku.toLowerCase() === lineItem.sku.toLowerCase()) || null

    case 'name':
      // Fuzzy name match
      if (!lineItem.title && !lineItem.name) return null
      const searchName = lineItem.title || lineItem.name
      const fuse = new Fuse(catalogProducts, {
        keys: ['title'],
        threshold: 0.3,  // Fairly strict
        includeScore: true,
      })
      const results = fuse.search(searchName)
      // Only accept if score is good enough (<0.3)
      return results.length > 0 && (results[0].score || 1) < 0.3
        ? results[0].item
        : null

    case 'value':
      // Price match (exact value)
      const itemPrice = parseFloat(lineItem.price)
      return catalogProducts.find(p => Math.abs(p.price - itemPrice) < 0.01) || null

    default:
      return null
  }
}

/**
 * Builds order name from Shopify product titles.
 * Uses first product title, adds "+N" if there are more products.
 */
function buildOrderName(order: ShopifyOrderWebhook): string {
  const items = order.line_items || []
  if (items.length === 0) return order.name // fallback to "#1001"

  const firstName = items[0].title || items[0].name || 'Producto'
  if (items.length === 1) return firstName
  return `${firstName} +${items.length - 1} más`
}

/**
 * Builds order description from Shopify data.
 * Includes Shopify reference number, note, and payment status.
 */
function buildOrderDescription(order: ShopifyOrderWebhook): string {
  const parts: string[] = [`Ref. Shopify ${order.name}`]

  if (order.note) {
    parts.push(`Nota: ${order.note}`)
  }

  if (order.financial_status) {
    parts.push(`Estado pago: ${order.financial_status}`)
  }

  return parts.join(' | ')
}

/**
 * Builds shipping address string from Shopify address.
 */
function buildShippingAddress(order: ShopifyOrderWebhook): string | null {
  const addr = order.shipping_address
  if (!addr) return null

  const parts = [
    addr.address1,
    addr.address2,
    addr.city,
    addr.province,
  ].filter(Boolean)

  return parts.join(', ') || null
}
