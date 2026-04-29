/**
 * CRM Query Tools — Order Tools (4 tools).
 *
 * Standalone crm-query-tools Wave 3 (Plan 04).
 *
 * BLOCKER invariant: this file imports ONLY from @/lib/domain/* + helpers.
 * Verified via grep:
 *   grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/
 * Expected: zero matches in code (only doc-comment mentions allowed).
 *
 * Tools:
 *   - getLastOrderByPhone(phone)         → most recent order with full detail (D-10).
 *   - getOrdersByPhone(phone, limit, offset) → paginated history list (D-10 list).
 *   - getActiveOrderByPhone(phone, pipelineId?) → active order with config-driven filter (D-15, D-16, D-17, D-27).
 *   - getOrderById(orderId)              → single order by ID (mirror crm-reader.ordersGet).
 *
 * D-23 observability: every tool emits crm_query_invoked + completed/failed events.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  listOrders,
  getOrderById,
  type OrderDetail,
  type OrderListItem,
} from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import { getCollector } from '@/lib/observability'
import {
  resolveContactByPhone,
  findActiveOrderForContact,
} from './helpers'
import type {
  CrmQueryToolsContext,
  CrmQueryLookupResult,
  CrmQueryListResult,
} from './types'

const logger = createModuleLogger('crm-query-tools.orders')

function phoneSuffix(raw: string): string {
  return raw.replace(/\D/g, '').slice(-4)
}

export function makeOrderQueryTools(ctx: CrmQueryToolsContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }
  const collector = () => getCollector()
  const baseEvt = (toolName: string) => ({
    tool: toolName,
    workspaceId: ctx.workspaceId,
    invoker: ctx.invoker,
  })

  // ───────────────────────────────────────────────────────────
  // Tool 1: getLastOrderByPhone
  // ───────────────────────────────────────────────────────────
  const getLastOrderByPhoneTool = tool({
    description:
      'Obtiene el ultimo pedido de un contacto identificado por telefono. ' +
      'Retorna el pedido completo (items + direccion) ordenado por created_at DESC. ' +
      'Si el contacto no tiene pedidos, retorna status no_orders + el contacto.',
    inputSchema: z.object({
      phone: z.string().min(7).describe('Telefono del contacto.'),
    }),
    execute: async ({ phone }): Promise<CrmQueryLookupResult<OrderDetail>> => {
      const startedAt = Date.now()
      collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
        ...baseEvt('getLastOrderByPhone'),
        phoneSuffix: phoneSuffix(phone),
      })

      const resolved = await resolveContactByPhone(domainCtx, phone)
      if (resolved.kind === 'invalid_phone') {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getLastOrderByPhone'),
          errorCode: 'invalid_phone',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'invalid_phone' } }
      }
      if (resolved.kind === 'not_found') {
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getLastOrderByPhone'),
          status: 'not_found',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'not_found' }
      }
      if (resolved.kind === 'error') {
        logger.error(
          { error: resolved.message, workspaceId: ctx.workspaceId },
          'getLastOrderByPhone resolve failed',
        )
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getLastOrderByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'db_error', message: resolved.message } }
      }

      const list = await listOrders(domainCtx, { contactId: resolved.contact.id, limit: 1 })
      if (!list.success) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getLastOrderByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'db_error', message: list.error } }
      }
      if ((list.data ?? []).length === 0) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getLastOrderByPhone'),
          status: 'no_orders',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'no_orders', contact: resolved.contact }
      }

      const detail = await getOrderById(domainCtx, { orderId: list.data![0].id })
      if (!detail.success || !detail.data) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getLastOrderByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return {
          status: 'error',
          error: {
            code: 'db_error',
            message: detail.success ? 'order disappeared' : detail.error,
          },
        }
      }

      collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
        ...baseEvt('getLastOrderByPhone'),
        status: 'found',
        latencyMs: Date.now() - startedAt,
      })
      return { status: 'found', data: detail.data }
    },
  })

  // ───────────────────────────────────────────────────────────
  // Tool 2: getOrdersByPhone (list / paginated)
  // ───────────────────────────────────────────────────────────
  const getOrdersByPhoneTool = tool({
    description:
      'Lista los pedidos de un contacto identificado por telefono, mas reciente primero. ' +
      'Acepta limit (default 20, max 50) y offset para paginacion. ' +
      'Si el contacto no tiene pedidos, retorna no_orders + el contacto.',
    inputSchema: z.object({
      phone: z.string().min(7),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }),
    execute: async ({ phone, limit, offset }): Promise<CrmQueryListResult<OrderListItem>> => {
      const startedAt = Date.now()
      collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
        ...baseEvt('getOrdersByPhone'),
        phoneSuffix: phoneSuffix(phone),
        limit,
        offset,
      })

      const resolved = await resolveContactByPhone(domainCtx, phone)
      if (resolved.kind === 'invalid_phone') {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getOrdersByPhone'),
          errorCode: 'invalid_phone',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'invalid_phone' } }
      }
      if (resolved.kind === 'not_found') {
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getOrdersByPhone'),
          status: 'not_found',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'not_found' }
      }
      if (resolved.kind === 'error') {
        logger.error(
          { error: resolved.message, workspaceId: ctx.workspaceId },
          'getOrdersByPhone resolve failed',
        )
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getOrdersByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'db_error', message: resolved.message } }
      }

      const list = await listOrders(domainCtx, { contactId: resolved.contact.id, limit, offset })
      if (!list.success) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getOrdersByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'db_error', message: list.error } }
      }
      const items = list.data ?? []
      if (items.length === 0) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getOrdersByPhone'),
          status: 'no_orders',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'no_orders', contact: resolved.contact }
      }
      collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
        ...baseEvt('getOrdersByPhone'),
        status: 'ok',
        count: items.length,
        latencyMs: Date.now() - startedAt,
      })
      return { status: 'ok', count: items.length, items }
    },
  })

  // ───────────────────────────────────────────────────────────
  // Tool 3: getActiveOrderByPhone
  // ───────────────────────────────────────────────────────────
  const getActiveOrderByPhoneTool = tool({
    description:
      'Obtiene el pedido activo del contacto. "Activo" se define en /agentes/crm-tools por workspace ' +
      '(stages activos + pipeline scope). ' +
      'Retorna found + other_active_orders_count si el contacto tiene mas de uno activo (mas reciente primero). ' +
      'Retorna no_active_order + last_terminal_order si todos sus pedidos estan en stages terminales. ' +
      'Retorna config_not_set si el operador no ha configurado stages activos en este workspace. ' +
      'Acepta pipelineId opcional que sobrescribe el config para esta llamada.',
    inputSchema: z.object({
      phone: z.string().min(7),
      pipelineId: z.string().uuid().optional(),
    }),
    execute: async ({ phone, pipelineId }): Promise<
      CrmQueryLookupResult<OrderDetail & { other_active_orders_count: number }>
    > => {
      const startedAt = Date.now()
      collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
        ...baseEvt('getActiveOrderByPhone'),
        phoneSuffix: phoneSuffix(phone),
        pipelineIdOverride: pipelineId ?? null,
      })

      const resolved = await resolveContactByPhone(domainCtx, phone)
      if (resolved.kind === 'invalid_phone') {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getActiveOrderByPhone'),
          errorCode: 'invalid_phone',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'invalid_phone' } }
      }
      if (resolved.kind === 'not_found') {
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getActiveOrderByPhone'),
          status: 'not_found',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'not_found' }
      }
      if (resolved.kind === 'error') {
        logger.error(
          { error: resolved.message, workspaceId: ctx.workspaceId },
          'getActiveOrderByPhone resolve failed',
        )
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getActiveOrderByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'db_error', message: resolved.message } }
      }

      let resolution
      try {
        resolution = await findActiveOrderForContact(domainCtx, resolved.contact.id, pipelineId)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(
          { error: message, workspaceId: ctx.workspaceId, contactId: resolved.contact.id },
          'findActiveOrderForContact failed',
        )
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getActiveOrderByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'db_error', message } }
      }

      // D-27 first
      if (resolution.configWasEmpty) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getActiveOrderByPhone'),
          status: 'config_not_set',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'config_not_set', contact: resolved.contact }
      }

      // D-17: no active
      if (!resolution.active) {
        let lastTerminalDetail: OrderDetail | undefined
        if (resolution.lastTerminal) {
          const lt = await getOrderById(domainCtx, { orderId: resolution.lastTerminal.id })
          lastTerminalDetail = lt.success && lt.data ? lt.data : undefined
        }
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getActiveOrderByPhone'),
          status: 'no_active_order',
          hasTerminal: !!lastTerminalDetail,
          latencyMs: Date.now() - startedAt,
        })
        return {
          status: 'no_active_order',
          contact: resolved.contact,
          last_terminal_order: lastTerminalDetail,
        }
      }

      // D-15: active found, fetch full detail + other_active_orders_count
      const detail = await getOrderById(domainCtx, { orderId: resolution.active.id })
      if (!detail.success || !detail.data) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getActiveOrderByPhone'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return {
          status: 'error',
          error: {
            code: 'db_error',
            message: detail.success ? 'active order disappeared' : detail.error,
          },
        }
      }
      collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
        ...baseEvt('getActiveOrderByPhone'),
        status: 'found',
        otherActiveCount: resolution.otherActiveCount,
        latencyMs: Date.now() - startedAt,
      })
      return {
        status: 'found',
        data: { ...detail.data, other_active_orders_count: resolution.otherActiveCount },
      }
    },
  })

  // ───────────────────────────────────────────────────────────
  // Tool 4: getOrderById
  // ───────────────────────────────────────────────────────────
  const getOrderByIdTool = tool({
    description:
      'Obtiene un pedido por ID con sus items (order_products) y direccion de envio. ' +
      'Filtra por workspace_id automaticamente. Retorna not_found si el pedido no existe en este workspace.',
    inputSchema: z.object({
      orderId: z.string().uuid(),
    }),
    execute: async ({ orderId }): Promise<CrmQueryLookupResult<OrderDetail>> => {
      const startedAt = Date.now()
      collector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
        ...baseEvt('getOrderById'),
        orderIdSuffix: orderId.slice(-8),
      })

      const result = await getOrderById(domainCtx, { orderId })
      if (!result.success) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_failed', {
          ...baseEvt('getOrderById'),
          errorCode: 'db_error',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'error', error: { code: 'db_error', message: result.error } }
      }
      if (!result.data) {
        collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt('getOrderById'),
          status: 'not_found',
          latencyMs: Date.now() - startedAt,
        })
        return { status: 'not_found' }
      }
      collector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
        ...baseEvt('getOrderById'),
        status: 'found',
        latencyMs: Date.now() - startedAt,
      })
      return { status: 'found', data: result.data }
    },
  })

  return {
    getLastOrderByPhone: getLastOrderByPhoneTool,
    getOrdersByPhone: getOrdersByPhoneTool,
    getActiveOrderByPhone: getActiveOrderByPhoneTool,
    getOrderById: getOrderByIdTool,
  }
}
