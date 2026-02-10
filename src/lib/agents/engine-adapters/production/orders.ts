/**
 * Production Orders Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Uses OrderCreator for direct DB order creation in production.
 * Creates contacts and orders when the customer confirms a purchase.
 */

import type { OrdersAdapter } from '../../engine/types'
import { OrderCreator, type ContactData } from '../../somnio/order-creator'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('production-orders-adapter')

export class ProductionOrdersAdapter implements OrdersAdapter {
  private orderCreator: OrderCreator

  constructor(workspaceId: string) {
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
    const pack = data.packSeleccionado as '1x' | '2x' | '3x'

    if (!pack) {
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

      const result = await this.orderCreator.createContactAndOrder(
        contactData,
        pack,
        data.sessionId
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
