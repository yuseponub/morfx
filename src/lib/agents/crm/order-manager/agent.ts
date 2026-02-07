/**
 * Order Manager CRM Agent
 * Phase 15.6: Sandbox Evolution
 *
 * Creates orders with contacts. Has 3 operating modes:
 * - full: All 8 customer fields + pack selection
 * - no_promo: All 8 fields, default 1x pack (skip promo selection)
 * - draft: Only nombre + telefono (creates draft order)
 *
 * Dry-run: Uses mock data generators.
 * Live: Uses real Action DSL tools via executeToolFromAgent with test- prefix.
 */

import { BaseCrmAgent } from '../base-crm-agent'
import { executeToolFromAgent } from '@/lib/tools/executor'
import type { CrmCommand, CrmAgentResult, CrmCommandType, CrmExecutionMode } from '../types'
import type { ToolExecution } from '@/lib/sandbox/types'
import { mockCreateContact, mockCreateOrder, mockAssignTag } from './tools'

const REQUIRED_FIELDS_FULL = ['nombre', 'telefono', 'ciudad', 'departamento', 'direccion', 'barrio', 'quien_recibe', 'documento']
const REQUIRED_FIELDS_NO_PROMO = ['nombre', 'telefono', 'ciudad', 'departamento', 'direccion', 'barrio', 'quien_recibe', 'documento']
const REQUIRED_FIELDS_DRAFT = ['nombre', 'telefono']

/** Pack prices in COP */
const PACK_PRICES: Record<string, number> = {
  '1x': 77900,
  '2x': 109900,
  '3x': 139900,
}

export class OrderManagerAgent extends BaseCrmAgent {
  id = 'order-manager'
  name = 'Order Manager'
  description = 'Crea contactos y ordenes. Soporta 3 modos: completo, sin promo, borrador.'
  supportedCommands: CrmCommandType[] = ['create_order']

  async execute(command: CrmCommand, mode: CrmExecutionMode): Promise<CrmAgentResult> {
    if (command.type !== 'create_order') {
      return this.buildError({
        commandType: command.type,
        mode,
        code: 'UNSUPPORTED_COMMAND',
        message: `Order Manager does not handle command: ${command.type}`,
      })
    }

    const orderMode = command.orderMode ?? 'full'
    const payload = command.payload

    // Validate required fields based on mode
    const requiredFields =
      orderMode === 'full' ? REQUIRED_FIELDS_FULL
      : orderMode === 'no_promo' ? REQUIRED_FIELDS_NO_PROMO
      : REQUIRED_FIELDS_DRAFT

    const missingFields = requiredFields.filter(f => !payload[f])
    if (missingFields.length > 0) {
      return this.buildError({
        commandType: command.type,
        mode,
        code: 'MISSING_FIELDS',
        message: `Missing required fields for mode '${orderMode}': ${missingFields.join(', ')}`,
      })
    }

    if (mode === 'dry-run') {
      return this.executeDryRun(command, orderMode, payload)
    }

    // Live mode: execute real tools via Action DSL
    return this.executeLive(command, orderMode, payload)
  }

  private async executeDryRun(
    command: CrmCommand,
    orderMode: string,
    payload: Record<string, unknown>
  ): Promise<CrmAgentResult> {
    const toolCalls: ToolExecution[] = []

    // Step 1: Create contact
    const contactTool = mockCreateContact({
      nombre: payload.nombre,
      telefono: payload.telefono,
      ciudad: payload.ciudad,
      departamento: payload.departamento,
      direccion: payload.direccion,
    })
    toolCalls.push(contactTool)

    const contactId = (contactTool.result?.data as Record<string, unknown>)?.id as string

    // Step 2: Assign tag
    const tagTool = mockAssignTag({
      contactId,
      tag: 'somnio-lead',
    })
    toolCalls.push(tagTool)

    // Step 3: Create order
    const pack = orderMode === 'no_promo' ? '1x' : (payload.pack as string ?? '1x')
    const orderTool = mockCreateOrder({
      contactId,
      pack,
      nombre: payload.nombre,
      telefono: payload.telefono,
      direccion: payload.direccion,
      ciudad: payload.ciudad,
    })
    toolCalls.push(orderTool)

    return this.buildResult({
      commandType: command.type,
      data: {
        contactId,
        orderId: (orderTool.result?.data as Record<string, unknown>)?.id,
        mode: orderMode,
        pack,
      },
      toolCalls,
      tokensUsed: [], // No Claude calls in dry-run
      mode: 'dry-run',
    })
  }

  /**
   * Live mode: Execute real Action DSL tools via executeToolFromAgent.
   * Contact names are prefixed with "test-" per CONTEXT.md sandbox rules.
   */
  private async executeLive(
    command: CrmCommand,
    orderMode: string,
    payload: Record<string, unknown>
  ): Promise<CrmAgentResult> {
    const toolCalls: ToolExecution[] = []
    const workspaceId = (payload._workspaceId as string) ?? 'sandbox'
    const sessionId = 'sandbox-session'

    try {
      // Prefix test data: adds "test-" to nombre
      const testPayload = this.prefixTestData(payload)

      // Step 1: Create contact via Action DSL
      const contactStartTime = performance.now()
      const contactResult = await executeToolFromAgent(
        'crm.contact.create',
        {
          name: testPayload.nombre as string,
          phone: testPayload.telefono as string,
          address: this.buildAddress(testPayload),
          city: testPayload.ciudad as string,
        },
        workspaceId,
        sessionId,
        sessionId
      )
      const contactDuration = Math.round(performance.now() - contactStartTime)

      const contactToolExec: ToolExecution = {
        name: 'crm.contact.create',
        input: {
          name: testPayload.nombre,
          phone: testPayload.telefono,
          city: testPayload.ciudad,
        },
        result: contactResult.status === 'success'
          ? { success: true, data: contactResult.outputs }
          : { success: false, error: { code: contactResult.error?.code ?? 'UNKNOWN', message: contactResult.error?.message ?? 'Contact creation failed' } },
        durationMs: contactDuration,
        timestamp: new Date().toISOString(),
        mode: 'live',
      }
      toolCalls.push(contactToolExec)

      if (contactResult.status !== 'success') {
        return this.buildResult({
          commandType: command.type,
          data: { error: 'Contact creation failed', details: contactResult.error },
          toolCalls,
          tokensUsed: [],
          mode: 'live',
        })
      }

      const contactId = (contactResult.outputs as Record<string, unknown>)?.id as string

      // Step 2: Assign somnio-lead tag
      const tagStartTime = performance.now()
      const tagResult = await executeToolFromAgent(
        'crm.contact.tag',
        {
          contactId,
          tag: 'somnio-lead',
        },
        workspaceId,
        sessionId,
        sessionId
      )
      const tagDuration = Math.round(performance.now() - tagStartTime)

      const tagToolExec: ToolExecution = {
        name: 'crm.contact.tag',
        input: { contactId, tag: 'somnio-lead' },
        result: tagResult.status === 'success'
          ? { success: true, data: tagResult.outputs }
          : { success: false, error: { code: tagResult.error?.code ?? 'UNKNOWN', message: tagResult.error?.message ?? 'Tag assignment failed' } },
        durationMs: tagDuration,
        timestamp: new Date().toISOString(),
        mode: 'live',
      }
      toolCalls.push(tagToolExec)

      // Step 3: Create order
      const pack = orderMode === 'no_promo' ? '1x' : (payload.pack as string ?? '1x')
      const price = PACK_PRICES[pack] ?? PACK_PRICES['1x']

      const orderStartTime = performance.now()
      const orderResult = await executeToolFromAgent(
        'crm.order.create',
        {
          contactId,
          products: [
            {
              name: `Somnio 90 Caps${pack !== '1x' ? ` x${pack.replace('x', '')}` : ''}`,
              quantity: parseInt(pack.replace('x', '')) || 1,
              price,
            },
          ],
          shippingAddress: this.buildShippingAddress(testPayload),
        },
        workspaceId,
        sessionId,
        sessionId
      )
      const orderDuration = Math.round(performance.now() - orderStartTime)

      const orderToolExec: ToolExecution = {
        name: 'crm.order.create',
        input: { contactId, pack, price },
        result: orderResult.status === 'success'
          ? { success: true, data: orderResult.outputs }
          : { success: false, error: { code: orderResult.error?.code ?? 'UNKNOWN', message: orderResult.error?.message ?? 'Order creation failed' } },
        durationMs: orderDuration,
        timestamp: new Date().toISOString(),
        mode: 'live',
      }
      toolCalls.push(orderToolExec)

      const orderId = orderResult.status === 'success'
        ? (orderResult.outputs as Record<string, unknown>)?.orderId as string
        : null

      return this.buildResult({
        commandType: command.type,
        data: {
          contactId,
          orderId,
          mode: orderMode,
          pack,
          liveExecution: true,
        },
        toolCalls,
        tokensUsed: [], // No Claude calls in live mode
        mode: 'live',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return this.buildError({
        commandType: command.type,
        mode: 'live',
        code: 'LIVE_EXECUTION_ERROR',
        message: `Live execution failed: ${errorMessage}`,
      })
    }
  }

  /** Build address from captured data */
  private buildAddress(data: Record<string, unknown>): string {
    const parts: string[] = []
    if (data.direccion) parts.push(data.direccion as string)
    if (data.barrio) parts.push(`Barrio ${data.barrio}`)
    return parts.join(', ')
  }

  /** Build full shipping address with city/department */
  private buildShippingAddress(data: Record<string, unknown>): string {
    const parts: string[] = []
    if (data.direccion) parts.push(data.direccion as string)
    if (data.barrio) parts.push(`Barrio ${data.barrio}`)
    if (data.ciudad) parts.push(data.ciudad as string)
    if (data.departamento && data.departamento !== data.ciudad) {
      parts.push(data.departamento as string)
    }
    return parts.join(', ')
  }
}
