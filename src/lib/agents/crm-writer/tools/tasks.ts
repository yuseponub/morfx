/**
 * CRM Writer — Task Tools
 * Phase 44 Plan 05. Task 2.
 *
 * Three tools: createTask, updateTask, completeTask (dispatched in two-step.ts
 * as updateTask with status='completed').
 *
 * Coverage note: updateTask/completeTask cannot precheck task existence because
 * Plan 03 did not add getTaskById. Domain layer surfaces not_found at confirm
 * time with status='failed'. Acceptable for V1; follow-up can add getTaskById
 * to the tasks domain module.
 *
 * createTask optionally references contactId and orderId — those are
 * prechecked via getContactById / getOrderById since helpers exist.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { proposeAction } from '../two-step'
import type { WriterContext, WriterPreview, ResourceNotFoundError } from '../types'
import type { DomainContext } from '@/lib/domain/types'
import { getContactById } from '@/lib/domain/contacts'
import { getOrderById } from '@/lib/domain/orders'

export function makeTaskWriteTools(ctx: WriterContext) {
  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'tool-handler' }

  return {
    createTask: tool({
      description:
        'PROPONE crear una tarea. NO ejecuta sin confirm. Validación: al menos una entidad ' +
        'relacionada (contactId/orderId/conversationId) opcional. Si contactId u orderId se ' +
        'proveen, se prechequea su existencia.',
      inputSchema: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        status: z.enum(['pending', 'in_progress', 'completed']).optional(),
        contactId: z.string().uuid().optional(),
        orderId: z.string().uuid().optional(),
        conversationId: z.string().uuid().optional(),
        assignedTo: z.string().optional(),
      }),
      execute: async (input) => {
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
        if (input.orderId) {
          const o = await getOrderById(domainCtx, { orderId: input.orderId })
          if (!o.success) {
            return { status: 'error' as const, message: o.error ?? 'order lookup failed' }
          }
          if (!o.data) {
            const err: ResourceNotFoundError = {
              status: 'resource_not_found',
              resource_type: 'order',
              resource_id: input.orderId,
              suggested_action: 'propose create via crm-writer',
            }
            return err
          }
        }

        const preview: WriterPreview = { action: 'create', entity: 'task', after: input }
        return proposeAction(ctx, { tool: 'createTask', input, preview })
      },
    }),

    updateTask: tool({
      description:
        'PROPONE actualizar una tarea existente. NO ejecuta sin confirm. ' +
        'Sin precheck de existencia (no hay getTaskById en Plan 03); domain surfaces not_found at confirm.',
      inputSchema: z.object({
        taskId: z.string().uuid(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        status: z.enum(['pending', 'in_progress', 'completed']).optional(),
        assignedTo: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const preview: WriterPreview = {
          action: 'update',
          entity: 'task',
          after: input,
        }
        return proposeAction(ctx, { tool: 'updateTask', input, preview })
      },
    }),

    completeTask: tool({
      description:
        'PROPONE marcar una tarea como completada (updateTask con status="completed"). NO ejecuta sin confirm. ' +
        'Sin precheck de existencia; domain surfaces not_found at confirm.',
      inputSchema: z.object({ taskId: z.string().uuid() }),
      execute: async (input) => {
        // completeTask is dispatched as updateTask({ status: 'completed' }) in two-step.ts.
        // We propose under the completeTask tool name for audit clarity; input_params
        // must already include status='completed' so the confirm dispatch produces
        // the correct domain call.
        const mutationInput = { taskId: input.taskId, status: 'completed' as const }
        const preview: WriterPreview = {
          action: 'update',
          entity: 'task',
          after: mutationInput,
        }
        return proposeAction(ctx, { tool: 'completeTask', input: mutationInput, preview })
      },
    }),
  }
}
