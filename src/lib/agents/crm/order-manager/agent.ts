/**
 * Order Manager CRM Agent
 * Phase 15.6: Sandbox Evolution
 *
 * Creates orders with contacts. Has 3 operating modes:
 * - full: All 8 customer fields + pack selection
 * - no_promo: All 8 fields, default 1x pack (skip promo selection)
 * - draft: Only nombre + telefono (creates draft order)
 */

import { BaseCrmAgent } from '../base-crm-agent'
import type { CrmCommand, CrmAgentResult, CrmCommandType, CrmExecutionMode } from '../types'
import type { ToolExecution } from '@/lib/sandbox/types'
import { mockCreateContact, mockCreateOrder, mockAssignTag } from './tools'

const REQUIRED_FIELDS_FULL = ['nombre', 'telefono', 'ciudad', 'departamento', 'direccion', 'barrio', 'quien_recibe', 'documento']
const REQUIRED_FIELDS_NO_PROMO = ['nombre', 'telefono', 'ciudad', 'departamento', 'direccion', 'barrio', 'quien_recibe', 'documento']
const REQUIRED_FIELDS_DRAFT = ['nombre', 'telefono']

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

    // Live mode: execute real tools (to be wired in Plan 05)
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

  private async executeLive(
    command: CrmCommand,
    orderMode: string,
    payload: Record<string, unknown>
  ): Promise<CrmAgentResult> {
    // Live mode: Real tool execution via Action DSL
    // This will be wired in Plan 05 (CRM Sandbox Integration)
    // For now, return same as dry-run with a note
    const dryRunResult = await this.executeDryRun(command, orderMode, payload)
    return {
      ...dryRunResult,
      mode: 'live',
      data: {
        ...dryRunResult.data,
        _note: 'Live mode execution will be wired in Plan 05',
      },
    }
  }
}
