/**
 * Production Orders Adapter
 * Phase 16.1: Engine Unification - Plan 03
 * Phase 18: Refactored to use domain/orders instead of OrderCreator for order creation.
 *
 * Creates contacts and orders when the customer confirms a purchase.
 * Contact creation still uses tool handlers (contacts domain not yet migrated).
 * Order creation delegates to domain/orders for DB logic + trigger emission.
 */

import type { OrdersAdapter } from '../../engine/types'
import { OrderCreator, type ContactData } from '../../somnio/order-creator'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { initializeTools } from '@/lib/tools/init'
import { createOrder as domainCreateOrder, addOrderTag as domainAddOrderTag } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

const logger = createModuleLogger('production-orders-adapter')

export class ProductionOrdersAdapter implements OrdersAdapter {
  private orderCreator: OrderCreator
  private workspaceId: string

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId
    this.orderCreator = new OrderCreator(workspaceId)
  }

  /**
   * Create a contact and order.
   * Contact: uses OrderCreator's findOrCreateContact (tool handlers).
   * Order: uses domain/orders.createOrder (with trigger emission).
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

    // Ensure tool registry is initialized (findOrCreateContact uses executeToolFromAgent)
    // Required for Inngest/serverless contexts where instrumentation.ts may not run.
    // Known issue from Phase 16.1 LEARNINGS — idempotent, safe to call multiple times.
    initializeTools()

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
      // Step 1: Find or create contact via OrderCreator (tool handlers)
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

      const { contactId, isNew } = await this.orderCreator.findOrCreateContact(contactData, data.sessionId)

      if (!contactId) {
        logger.error(
          { sessionId: data.sessionId, telefono: contactData.telefono },
          'findOrCreateContact returned null contactId'
        )
        return {
          success: false,
          error: { message: 'No se pudo crear el contacto' },
        }
      }

      // Step 2: Create order via domain layer
      const effectivePack = pack || '1x'
      const product = this.orderCreator.mapPackToProduct(effectivePack)
      const effectivePrice = isTimerOrder ? (data.valorOverride ?? 0) : product.price

      // Build shipping address
      const shippingAddress = this.buildShippingAddress(contactData)

      // Get default pipeline for workspace
      const supabase = createAdminClient()
      const { data: pipelineData } = await supabase
        .from('pipelines')
        .select('id')
        .eq('workspace_id', this.workspaceId)
        .eq('is_default', true)
        .single()

      // Fall back to any pipeline
      const pipelineId = pipelineData?.id ?? (
        await supabase
          .from('pipelines')
          .select('id')
          .eq('workspace_id', this.workspaceId)
          .limit(1)
          .single()
      ).data?.id

      if (!pipelineId) {
        return {
          success: false,
          error: { message: 'No pipeline configured' },
        }
      }

      // Resolve "NUEVO PEDIDO" stage by name
      let stageId: string | undefined
      const { data: namedStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .ilike('name', 'NUEVO PEDIDO')
        .single()

      if (namedStage) {
        stageId = namedStage.id
      }

      // Build order name from contact name
      const orderName = contactData.apellido
        ? `${contactData.nombre} ${contactData.apellido}`
        : contactData.nombre

      // Create order via domain
      const ctx: DomainContext = { workspaceId: this.workspaceId, source: 'adapter' }
      const orderResult = await domainCreateOrder(ctx, {
        pipelineId,
        stageId,
        contactId,
        name: orderName,
        shippingAddress,
        shippingCity: contactData.ciudad || null,
        shippingDepartment: contactData.departamento || null,
        description: contactData.indicaciones_extra,
        products: [
          {
            sku: product.productName.substring(0, 50).toUpperCase().replace(/\s+/g, '-'),
            title: product.productName,
            unitPrice: effectivePrice,
            quantity: product.quantity,
          },
        ],
      })

      if (!orderResult.success) {
        return {
          success: false,
          contactId,
          error: { message: orderResult.error || 'No se pudo crear el pedido' },
        }
      }

      const orderId = orderResult.data!.orderId

      logger.info(
        {
          orderId,
          contactId,
          isNewContact: isNew,
          pack: effectivePack,
        },
        'Order created successfully via ProductionOrdersAdapter (domain layer)'
      )

      // Auto-tag order with "WPP" (created via WhatsApp agent)
      await this.tagOrderAsWPP(orderId)

      return {
        success: true,
        orderId,
        contactId,
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
   * Uses domain addOrderTag. Non-blocking on failure.
   */
  private async tagOrderAsWPP(orderId: string): Promise<void> {
    try {
      const ctx: DomainContext = { workspaceId: this.workspaceId, source: 'adapter' }
      const result = await domainAddOrderTag(ctx, { orderId, tagName: 'WPP' })

      if (!result.success) {
        // Tag might not exist — this is OK, non-critical
        logger.warn({ orderId, error: result.error }, 'Failed to auto-tag order with WPP via domain')
      }
    } catch (error) {
      logger.warn({ error, orderId }, 'Error auto-tagging order with WPP')
    }
  }

  /**
   * Build shipping address with city and department.
   */
  private buildShippingAddress(data: ContactData): string {
    const parts: string[] = []

    if (data.direccion) {
      parts.push(data.direccion)
    }

    if (data.barrio) {
      parts.push(`Barrio ${data.barrio}`)
    }

    if (data.ciudad) {
      parts.push(data.ciudad)
    }

    if (data.departamento && data.departamento !== data.ciudad) {
      parts.push(data.departamento)
    }

    return parts.join(', ')
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
