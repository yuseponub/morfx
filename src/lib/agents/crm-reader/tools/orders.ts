/**
 * CRM Reader — Order Tools
 * Phase 44 Plan 04.
 *
 * BLOCKER 1 invariant: domain-layer imports ONLY.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  listOrders,
  getOrderById,
  type OrderListItem,
  type OrderDetail,
} from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import type { ReaderContext, ToolLookupResult, ToolListResult } from '../types'

const logger = createModuleLogger('crm-reader.orders')

export function makeOrderReadTools(ctx: ReaderContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    ordersList: tool({
      description:
        'Lista pedidos del workspace. Filtros opcionales: pipelineId, stageId, contactId. ' +
        'Excluye archivados por defecto. Paginacion via limit/offset.',
      inputSchema: z.object({
        pipelineId: z.string().uuid().optional(),
        stageId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async (input): Promise<ToolListResult<OrderListItem>> => {
        const result = await listOrders(domainCtx, input)
        if (!result.success) {
          logger.error(
            { error: result.error, workspaceId: ctx.workspaceId },
            'ordersList domain error',
          )
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        const items = result.data ?? []
        return { status: 'ok', count: items.length, items }
      },
    }),

    ordersGet: tool({
      description:
        'Obtiene un pedido por ID con sus items (order_products). ' +
        'Retorna {status:"not_found_in_workspace"} si no existe o esta archivado.',
      inputSchema: z.object({ orderId: z.string().uuid() }),
      execute: async ({ orderId }): Promise<ToolLookupResult<OrderDetail>> => {
        const result = await getOrderById(domainCtx, { orderId })
        if (!result.success) {
          logger.error(
            { error: result.error, workspaceId: ctx.workspaceId, orderId },
            'ordersGet domain error',
          )
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        if (!result.data) return { status: 'not_found_in_workspace' }
        return { status: 'found', data: result.data }
      },
    }),
  }
}
