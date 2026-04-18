/**
 * CRM Writer — Order Tools
 * Phase 44 Plan 05. Task 2.
 *
 * Four tools: createOrder, updateOrder, moveOrderToStage, archiveOrder.
 * All existence prechecks via domain getByIds (Blocker 1). Never imports
 * createAdminClient. Never calls domain write funcs directly.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { proposeAction } from '../two-step'
import type { WriterContext, WriterPreview, ResourceNotFoundError } from '../types'
import type { DomainContext } from '@/lib/domain/types'
import { getPipelineById, getStageById } from '@/lib/domain/pipelines'
import { getContactById } from '@/lib/domain/contacts'
import { getOrderById } from '@/lib/domain/orders'

const productSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  sku: z.string().min(1),
  title: z.string().min(1),
  unitPrice: z.number(),
  quantity: z.number().int().positive(),
})

export function makeOrderWriteTools(ctx: WriterContext) {
  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'tool-handler' }

  return {
    createOrder: tool({
      description:
        'PROPONE crear un pedido en un pipeline/stage existente. NO ejecuta sin confirm. ' +
        'Writer NO crea pipelines ni stages — si no existen, retorna resource_not_found.',
      inputSchema: z.object({
        pipelineId: z.string().uuid(),
        stageId: z.string().uuid().nullable().optional(),
        contactId: z.string().uuid().nullable().optional(),
        name: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        closingDate: z.string().nullable().optional(),
        shippingAddress: z.string().nullable().optional(),
        shippingCity: z.string().nullable().optional(),
        shippingDepartment: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        products: z.array(productSchema).optional(),
      }),
      execute: async (input) => {
        // 1) Pipeline existence precheck (Blocker 1).
        const p = await getPipelineById(domainCtx, { pipelineId: input.pipelineId })
        if (!p.success) {
          return { status: 'error' as const, message: p.error ?? 'pipeline lookup failed' }
        }
        if (!p.data) {
          const err: ResourceNotFoundError = {
            status: 'resource_not_found',
            resource_type: 'pipeline',
            resource_id: input.pipelineId,
            suggested_action: 'create manually in UI',
          }
          return err
        }

        // 2) Stage existence precheck (if provided).
        if (input.stageId) {
          const s = await getStageById(domainCtx, { stageId: input.stageId })
          if (!s.success) {
            return { status: 'error' as const, message: s.error ?? 'stage lookup failed' }
          }
          if (!s.data) {
            const err: ResourceNotFoundError = {
              status: 'resource_not_found',
              resource_type: 'stage',
              resource_id: input.stageId,
              suggested_action: 'create manually in UI',
            }
            return err
          }
        }

        // 3) Contact existence precheck (if provided).
        if (input.contactId) {
          const c = await getContactById(domainCtx, { contactId: input.contactId })
          if (!c.success) {
            return { status: 'error' as const, message: c.error ?? 'contact lookup failed' }
          }
          if (!c.data) {
            const err: ResourceNotFoundError = {
              status: 'resource_not_found',
              resource_type: 'contact',
              resource_id: input.contactId,
              suggested_action: 'propose create via crm-writer',
            }
            return err
          }
        }

        const preview: WriterPreview = { action: 'create', entity: 'order', after: input }
        return proposeAction(ctx, { tool: 'createOrder', input, preview })
      },
    }),

    updateOrder: tool({
      description:
        'PROPONE actualizar un pedido existente. NO ejecuta sin confirm. ' +
        'Si el pedido no existe, retorna resource_not_found.',
      inputSchema: z.object({
        orderId: z.string().uuid(),
        contactId: z.string().uuid().nullable().optional(),
        name: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        closingDate: z.string().nullable().optional(),
        carrier: z.string().nullable().optional(),
        trackingNumber: z.string().nullable().optional(),
        shippingAddress: z.string().nullable().optional(),
        shippingCity: z.string().nullable().optional(),
        shippingDepartment: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        products: z.array(productSchema).optional(),
      }),
      execute: async (input) => {
        const r = await getOrderById(domainCtx, { orderId: input.orderId })
        if (!r.success) {
          return { status: 'error' as const, message: r.error ?? 'order lookup failed' }
        }
        if (!r.data) {
          const err: ResourceNotFoundError = {
            status: 'resource_not_found',
            resource_type: 'order',
            resource_id: input.orderId,
            suggested_action: 'propose create via crm-writer',
          }
          return err
        }

        // Contact existence precheck (if provided).
        if (input.contactId) {
          const c = await getContactById(domainCtx, { contactId: input.contactId })
          if (!c.success) {
            return { status: 'error' as const, message: c.error ?? 'contact lookup failed' }
          }
          if (!c.data) {
            const err: ResourceNotFoundError = {
              status: 'resource_not_found',
              resource_type: 'contact',
              resource_id: input.contactId,
              suggested_action: 'propose create via crm-writer',
            }
            return err
          }
        }

        const before = {
          id: r.data.id,
          contactId: r.data.contactId,
          pipelineId: r.data.pipelineId,
          stageId: r.data.stageId,
          description: r.data.description,
          totalValue: r.data.totalValue,
        }
        const preview: WriterPreview = {
          action: 'update',
          entity: 'order',
          before,
          after: { ...before, ...input },
        }
        return proposeAction(ctx, { tool: 'updateOrder', input, preview })
      },
    }),

    moveOrderToStage: tool({
      description:
        'PROPONE mover un pedido a otra etapa existente. NO ejecuta sin confirm. ' +
        'Si el pedido o el stage destino no existen, retorna resource_not_found.',
      inputSchema: z.object({
        orderId: z.string().uuid(),
        newStageId: z.string().uuid(),
      }),
      execute: async (input) => {
        const r = await getOrderById(domainCtx, { orderId: input.orderId })
        if (!r.success) {
          return { status: 'error' as const, message: r.error ?? 'order lookup failed' }
        }
        if (!r.data) {
          const err: ResourceNotFoundError = {
            status: 'resource_not_found',
            resource_type: 'order',
            resource_id: input.orderId,
            suggested_action: 'propose create via crm-writer',
          }
          return err
        }

        const s = await getStageById(domainCtx, { stageId: input.newStageId })
        if (!s.success) {
          return { status: 'error' as const, message: s.error ?? 'stage lookup failed' }
        }
        if (!s.data) {
          const err: ResourceNotFoundError = {
            status: 'resource_not_found',
            resource_type: 'stage',
            resource_id: input.newStageId,
            suggested_action: 'create manually in UI',
          }
          return err
        }

        const before = { id: r.data.id, stageId: r.data.stageId }
        const preview: WriterPreview = {
          action: 'move',
          entity: 'order',
          before,
          after: { ...before, stageId: input.newStageId },
        }
        return proposeAction(ctx, { tool: 'moveOrderToStage', input, preview })
      },
    }),

    archiveOrder: tool({
      description:
        'PROPONE archivar (soft-delete) un pedido. NO ejecuta sin confirm. ' +
        'Si el pedido no existe, retorna resource_not_found.',
      inputSchema: z.object({ orderId: z.string().uuid() }),
      execute: async (input) => {
        const r = await getOrderById(domainCtx, { orderId: input.orderId })
        if (!r.success) {
          return { status: 'error' as const, message: r.error ?? 'order lookup failed' }
        }
        if (!r.data) {
          const err: ResourceNotFoundError = {
            status: 'resource_not_found',
            resource_type: 'order',
            resource_id: input.orderId,
            suggested_action: 'propose create via crm-writer',
          }
          return err
        }

        const before = {
          id: r.data.id,
          pipelineId: r.data.pipelineId,
          stageId: r.data.stageId,
          totalValue: r.data.totalValue,
        }
        const preview: WriterPreview = {
          action: 'archive',
          entity: 'order',
          before,
          after: { ...before, archived: true },
        }
        return proposeAction(ctx, { tool: 'archiveOrder', input, preview })
      },
    }),
  }
}
