/**
 * Production Orders Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Uses OrderCreator for direct DB order creation in production.
 * Creates contacts and orders when the customer confirms a purchase.
 */

import type { OrdersAdapter } from '../../engine/types'
import { OrderCreator, type ContactData } from '../../somnio/order-creator'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('production-orders-adapter')

export class ProductionOrdersAdapter implements OrdersAdapter {
  private orderCreator: OrderCreator
  private workspaceId: string

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
    this.orderCreator = new OrderCreator(workspaceId)
  }

  /**
   * Create a contact and order using OrderCreator.
   * Converts captured data to ContactData format and delegates to OrderCreator.
   */
  async createOrder(
    data: {
      datosCapturados: Record<string, string>
      packSeleccionado: unknown
      workspaceId: string
      sessionId: string
      valorOverride?: number
    },
    _mode?: 'dry-run' | 'live'
  ): Promise<{
    success: boolean
    orderId?: string
    contactId?: string
    toolCalls?: unknown[]
    tokensUsed?: unknown[]
    error?: { message: string }
  }> {
    const pack = data.packSeleccionado as '1x' | '2x' | '3x' | null
    const isTimerOrder = data.valorOverride !== undefined

    if (!pack && !isTimerOrder) {
      logger.warn({ sessionId: data.sessionId }, 'Cannot create order - no pack selected')
      return {
        success: false,
        error: { message: 'No pack selected' },
      }
    }

    if (!this.hasRequiredContactData(data.datosCapturados)) {
      logger.warn({ sessionId: data.sessionId }, 'Cannot create order - missing required contact data')
      return {
        success: false,
        error: { message: 'Missing required contact data' },
      }
    }

    try {
      // Convert Record<string, string> to ContactData
      const contactData: ContactData = {
        nombre: data.datosCapturados.nombre,
        apellido: data.datosCapturados.apellido,
        telefono: data.datosCapturados.telefono,
        direccion: data.datosCapturados.direccion,
        ciudad: data.datosCapturados.ciudad,
        departamento: data.datosCapturados.departamento,
        barrio: data.datosCapturados.barrio,
        correo: data.datosCapturados.correo,
        indicaciones_extra: data.datosCapturados.indicaciones_extra,
      }

      // Timer orders: default to '1x' if no pack, override price to 0
      const effectivePack = pack || '1x'
      const priceOverride = isTimerOrder ? data.valorOverride : undefined

      const result = await this.orderCreator.createContactAndOrder(
        contactData,
        effectivePack,
        data.sessionId,
        priceOverride
      )

      if (result.success) {
        logger.info(
          {
            orderId: result.orderId,
            contactId: result.contactId,
            isNewContact: result.isNewContact,
          },
          'Order created successfully via ProductionOrdersAdapter'
        )

        // Auto-tag order with "WPP" (created via WhatsApp agent)
        if (result.orderId) {
          await this.tagOrderAsWPP(result.orderId)
        }
      }

      return {
        success: result.success,
        orderId: result.orderId,
        contactId: result.contactId,
        error: result.error ? { message: result.error.message } : undefined,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, sessionId: data.sessionId }, 'Order creation failed')
      return {
        success: false,
        error: { message: errorMessage },
      }
    }
  }

  /**
   * Auto-tag an order with "WPP" to indicate it was created via WhatsApp.
   * Finds or creates the tag, then links it to the order. Non-blocking on failure.
   */
  private async tagOrderAsWPP(orderId: string): Promise<void> {
    try {
      const supabase = createAdminClient()

      // Find tag "WPP" for scope "orders" in this workspace
      const { data: tag } = await supabase
        .from('tags')
        .select('id')
        .eq('workspace_id', this.workspaceId)
        .eq('name', 'WPP')
        .eq('scope', 'orders')
        .single()

      if (!tag) {
        logger.warn({ orderId }, 'Tag "WPP" not found — skipping auto-tag')
        return
      }

      const { error } = await supabase
        .from('order_tags')
        .insert({ order_id: orderId, tag_id: tag.id })

      if (error && error.code !== '23505') {
        logger.warn({ error, orderId }, 'Failed to auto-tag order with WPP')
      }
    } catch (error) {
      logger.warn({ error, orderId }, 'Error auto-tagging order with WPP')
    }
  }

  /**
   * Check if captured data has required fields for order creation.
   */
  private hasRequiredContactData(data: Record<string, string>): boolean {
    const required = ['nombre', 'telefono', 'direccion', 'ciudad', 'departamento']
    return required.every((field) => {
      const value = data[field]
      return value && value.trim().length > 0 && value !== 'N/A'
    })
  }
}
