/**
 * Order Creator Component
 * Phase 14: Agente Ventas Somnio - Plan 06
 *
 * Handles contact and order creation when customer confirms purchase.
 * Uses Action DSL tools with agent session tracing.
 *
 * Responsibilities:
 * - Find existing contact by phone or create new one
 * - Update contact with captured data
 * - Create order with pack and correct price
 * - Map pack selection to product details
 */

import { executeToolFromAgent } from '@/lib/tools/executor'
import type { PackSelection } from '../types'
import { createModuleLogger } from '@/lib/audit/logger'
import { SOMNIO_PRICES } from './variable-substitutor'

const logger = createModuleLogger('order-creator')

// ============================================================================
// Types
// ============================================================================

/**
 * Result from order creation process.
 */
export interface OrderCreationResult {
  success: boolean
  contactId?: string
  orderId?: string
  isNewContact?: boolean
  error?: {
    code: string
    message: string
  }
}

/**
 * Contact data captured from customer conversation.
 */
export interface ContactData {
  nombre: string
  apellido?: string
  telefono: string
  direccion: string
  ciudad: string
  departamento: string
  barrio?: string
  correo?: string
  indicaciones_extra?: string
}

/**
 * Order data for creation.
 */
export interface OrderData {
  contactId: string
  pack: PackSelection
  price: number
  notes?: string
  shippingAddress?: string
}

/**
 * Product mapping result.
 */
interface ProductMapping {
  productName: string
  quantity: number
  price: number
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Numeric prices for Somnio products (pesos colombianos).
 * Matches SOMNIO_PRICES but as numbers for order creation.
 */
const SOMNIO_PRICES_NUMERIC: Record<PackSelection, number> = {
  '1x': 77900,
  '2x': 109900,
  '3x': 139900,
}

// ============================================================================
// Order Creator Class
// ============================================================================

/**
 * Creates contacts and orders in MorfX when customer confirms purchase.
 *
 * Flow:
 * 1. Find existing contact by phone number
 * 2. If exists, update with new captured data
 * 3. If not, create new contact
 * 4. Create order with pack details
 * 5. Return result with IDs
 */
export class OrderCreator {
  constructor(private workspaceId: string) {}

  /**
   * Main entry point: create contact and order for confirmed purchase.
   *
   * @param data - Captured contact data
   * @param pack - Selected pack (1x, 2x, 3x)
   * @param sessionId - Agent session ID for tracing
   * @returns OrderCreationResult with IDs or error
   */
  async createContactAndOrder(
    data: ContactData,
    pack: PackSelection,
    sessionId: string
  ): Promise<OrderCreationResult> {
    logger.info(
      {
        pack,
        nombre: data.nombre,
        ciudad: data.ciudad,
        sessionId,
      },
      'Starting contact and order creation'
    )

    try {
      // Step 1: Find or create contact
      const { contactId, isNew } = await this.findOrCreateContact(data, sessionId)

      if (!contactId) {
        return {
          success: false,
          error: {
            code: 'CONTACT_CREATION_FAILED',
            message: 'No se pudo crear el contacto',
          },
        }
      }

      // Step 2: Create order
      const { orderId } = await this.createOrder(
        {
          contactId,
          pack,
          price: SOMNIO_PRICES_NUMERIC[pack],
          shippingAddress: this.buildShippingAddress(data),
          notes: data.indicaciones_extra,
        },
        sessionId
      )

      if (!orderId) {
        return {
          success: false,
          contactId,
          isNewContact: isNew,
          error: {
            code: 'ORDER_CREATION_FAILED',
            message: 'No se pudo crear el pedido',
          },
        }
      }

      logger.info(
        {
          contactId,
          orderId,
          isNewContact: isNew,
          pack,
        },
        'Contact and order created successfully'
      )

      return {
        success: true,
        contactId,
        orderId,
        isNewContact: isNew,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, sessionId }, 'Order creation failed')

      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: errorMessage,
        },
      }
    }
  }

  /**
   * Find existing contact by phone or create new one.
   *
   * @param data - Contact data
   * @param sessionId - Session ID for tracing
   * @returns Contact ID and whether it's new
   */
  async findOrCreateContact(
    data: ContactData,
    sessionId: string
  ): Promise<{ contactId: string | null; isNew: boolean }> {
    // Try to find existing contact by phone
    const listResult = await executeToolFromAgent(
      'crm.contact.list',
      {
        search: data.telefono,
        pageSize: 1,
      },
      this.workspaceId,
      sessionId,
      sessionId
    )

    if (listResult.status === 'success' && listResult.outputs) {
      // ToolExecutionResult.outputs wraps a ToolResult: { success, data: { contacts, total } }
      const toolResult = listResult.outputs as { success?: boolean; data?: { contacts: Array<{ id: string; phone: string }>; total: number } }
      const contacts = toolResult.data?.contacts ?? (toolResult as unknown as { contacts: Array<{ id: string; phone: string }> }).contacts

      // Check if we found a contact with matching phone
      if (contacts && contacts.length > 0) {
        const existingContact = contacts.find((c) => {
          // Normalize both phones for comparison
          const normalizedExisting = c.phone?.replace(/\D/g, '') ?? ''
          const normalizedSearch = data.telefono.replace(/\D/g, '')
          return normalizedExisting.endsWith(normalizedSearch) ||
                 normalizedSearch.endsWith(normalizedExisting)
        })

        if (existingContact) {
          logger.debug({ contactId: existingContact.id }, 'Found existing contact by phone')

          // Update existing contact with new data
          await this.updateContact(existingContact.id, data, sessionId)

          return { contactId: existingContact.id, isNew: false }
        }
      }
    }

    // No existing contact - create new one
    const fullName = data.apellido
      ? `${data.nombre} ${data.apellido}`
      : data.nombre

    const createResult = await executeToolFromAgent(
      'crm.contact.create',
      {
        name: fullName,
        phone: data.telefono,
        email: data.correo === 'N/A' ? undefined : data.correo,
        address: this.buildFullAddress(data),
        city: data.ciudad,
      },
      this.workspaceId,
      sessionId,
      sessionId
    )

    if (createResult.status === 'success' && createResult.outputs) {
      // ToolExecutionResult.outputs wraps a ToolResult: { success, data: { id, ... } }
      const toolResult = createResult.outputs as { success?: boolean; data?: { id: string }; error?: { code: string } }

      if (toolResult.success && toolResult.data?.id) {
        logger.debug({ contactId: toolResult.data.id }, 'Created new contact')
        return { contactId: toolResult.data.id, isNew: true }
      }

      // Handler returned a business error (e.g., PHONE_DUPLICATE) inside outputs
      if (!toolResult.success && toolResult.error?.code === 'PHONE_DUPLICATE') {
        logger.debug('Phone duplicate detected from handler outputs, retrying search')
        return this.findExistingContactByPhone(data, sessionId)
      }
    }

    // Handle duplicate phone error from execution-level error
    if (createResult.error?.code === 'PHONE_DUPLICATE') {
      logger.debug('Phone duplicate from execution error, retrying search')
      return this.findExistingContactByPhone(data, sessionId)
    }

    logger.error({ error: createResult.error }, 'Failed to create contact')
    return { contactId: null, isNew: false }
  }

  /**
   * Find existing contact by phone (broader search after duplicate detected).
   */
  private async findExistingContactByPhone(
    data: ContactData,
    sessionId: string
  ): Promise<{ contactId: string | null; isNew: boolean }> {
    const retryResult = await executeToolFromAgent(
      'crm.contact.list',
      {
        search: data.telefono.slice(-10), // Last 10 digits
        pageSize: 10,
      },
      this.workspaceId,
      sessionId,
      sessionId
    )

    if (retryResult.status === 'success' && retryResult.outputs) {
      const toolResult = retryResult.outputs as { success?: boolean; data?: { contacts: Array<{ id: string; phone: string }> } }
      const contacts = toolResult.data?.contacts ?? (toolResult as unknown as { contacts: Array<{ id: string; phone: string }> }).contacts
      if (contacts && contacts.length > 0) {
        const contact = contacts[0]
        await this.updateContact(contact.id, data, sessionId)
        return { contactId: contact.id, isNew: false }
      }
    }

    return { contactId: null, isNew: false }
  }

  /**
   * Update existing contact with captured data.
   */
  private async updateContact(
    contactId: string,
    data: ContactData,
    sessionId: string
  ): Promise<void> {
    const fullName = data.apellido
      ? `${data.nombre} ${data.apellido}`
      : data.nombre

    await executeToolFromAgent(
      'crm.contact.update',
      {
        contactId,
        name: fullName,
        address: this.buildFullAddress(data),
        city: data.ciudad,
        email: data.correo === 'N/A' ? undefined : data.correo,
      },
      this.workspaceId,
      sessionId,
      sessionId
    )

    logger.debug({ contactId }, 'Updated existing contact')
  }

  /**
   * Create order with pack details.
   *
   * @param orderData - Order data
   * @param sessionId - Session ID for tracing
   * @returns Order ID
   */
  async createOrder(
    orderData: OrderData,
    sessionId: string
  ): Promise<{ orderId: string | null }> {
    const product = this.mapPackToProduct(orderData.pack)

    const result = await executeToolFromAgent(
      'crm.order.create',
      {
        contactId: orderData.contactId,
        products: [
          {
            name: product.productName,
            quantity: product.quantity,
            price: product.price,
          },
        ],
        shippingAddress: orderData.shippingAddress,
        notes: orderData.notes,
        stageName: 'NUEVO PEDIDO',
      },
      this.workspaceId,
      sessionId,
      sessionId
    )

    if (result.status === 'success' && result.outputs) {
      // ToolExecutionResult.outputs wraps a ToolResult: { success, data: { orderId, ... } }
      const toolResult = result.outputs as { success?: boolean; data?: { orderId: string }; orderId?: string }
      const orderId = toolResult.data?.orderId ?? toolResult.orderId
      if (orderId) {
        return { orderId }
      }
    }

    logger.error({ error: result.error }, 'Failed to create order')
    return { orderId: null }
  }

  /**
   * Map pack selection to product details.
   *
   * @param pack - Pack selection (1x, 2x, 3x)
   * @returns Product mapping with name, quantity, and price
   */
  mapPackToProduct(pack: PackSelection): ProductMapping {
    switch (pack) {
      case '1x':
        return {
          productName: 'Somnio 90 Caps',
          quantity: 1,
          price: 77900,
        }
      case '2x':
        return {
          productName: 'Somnio 90 Caps x2',
          quantity: 2,
          price: 109900,
        }
      case '3x':
        return {
          productName: 'Somnio 90 Caps x3',
          quantity: 3,
          price: 139900,
        }
      default:
        // Default to 1x if unknown pack
        logger.warn({ pack }, 'Unknown pack, defaulting to 1x')
        return {
          productName: 'Somnio 90 Caps',
          quantity: 1,
          price: 77900,
        }
    }
  }

  /**
   * Build full address from captured data fields.
   */
  private buildFullAddress(data: ContactData): string {
    const parts: string[] = []

    if (data.direccion) {
      parts.push(data.direccion)
    }

    if (data.barrio) {
      parts.push(`Barrio ${data.barrio}`)
    }

    return parts.join(', ')
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
}
