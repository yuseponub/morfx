/**
 * CRM Mutation Tools — Task Tools.
 *
 * Standalone crm-mutation-tools Wave 3 (Plan 04).
 *
 * Tools (3):
 *   - createTask    (idempotency-eligible, validates exclusive arc client-side)
 *   - updateTask    (domain rejects unknown task with "Tarea no encontrada")
 *   - completeTask  (idempotent at domain — already-completed is no-op)
 *
 * BLOCKER invariants (verified via grep gates in Plan 04 acceptance criteria):
 *   - NO workspaceId in inputSchema (Pitfall 2 / D-pre-03 — workspace from ctx).
 *   - NO hard-delete imports (Pitfall 4 / D-pre-04 — completion via completed_at,
 *     Tasks domain uses completed_at for completion (NO archived_at column —
 *     A11 ajuste documented in domain getTaskById).
 *   - NO imports from @/lib/agents/crm-writer (Pitfall 10 — coexistence per D-01).
 *   - NO createAdminClient (Regla 3 / D-pre-02 — only domain layer mutates).
 *
 * Re-hydration (D-09, Pitfall 6 — CRITICAL):
 *   createTask idempotency rehydrate callback calls getTaskById — NEVER fabricates
 *   snapshot from input/id alone. completeTask + updateTask also re-hydrate via
 *   getTaskById to return fresh TaskSnapshot to the agent.
 *
 * Exclusive arc (T-04-02 mitigation, defense-in-depth):
 *   createTask uses a zod refine to surface validation_error BEFORE the domain
 *   call when caller passes more than one of contactId/orderId/conversationId.
 *   Domain also validates the same invariant — this is layered defense, not
 *   redundancy: the zod gate gives the agent a typed validation_error result
 *   that maps to user-facing messaging without round-tripping the DB.
 *
 * Adaptations to domain reality (recorded for downstream consumers):
 *   - Domain `CreateTaskParams` uses `dueDate` (NOT `dueAt`) — column name in
 *     DB is `due_date`, surface keeps domain naming. Tool input mirrors this.
 *   - Domain `UpdateTaskParams.priority` accepts the literal union
 *     'low' | 'medium' | 'high' | 'urgent'; status accepts
 *     'pending' | 'in_progress' | 'completed'. Tool surfaces these as enum
 *     zod schemas to enforce the contract at parse time.
 *   - Domain `completeTask` returns `{ taskId }` only. The tool re-hydrates
 *     via getTaskById to return the full TaskSnapshot with completedAt + status.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  createTask as domainCreateTask,
  updateTask as domainUpdateTask,
  completeTask as domainCompleteTask,
  getTaskById,
  type TaskDetail,
} from '@/lib/domain/tasks'
import { createModuleLogger } from '@/lib/audit/logger'
import type { DomainContext } from '@/lib/domain/types'
import type { CrmMutationToolsContext, MutationResult } from './types'
import {
  withIdempotency,
  emitInvoked,
  emitCompleted,
  emitFailed,
  idSuffix,
  mapDomainError,
} from './helpers'

const logger = createModuleLogger('crm-mutation-tools.tasks')

/**
 * TaskSnapshot — projection returned by task tools.
 *
 * Mirrors the domain `TaskDetail` shape exactly (re-export-equivalent — no
 * fields stripped). If a downstream consumer needs to `import { TaskSnapshot }`
 * separately from `TaskDetail`, both should remain interchangeable.
 */
export interface TaskSnapshot {
  taskId: string
  title: string
  description: string | null
  status: string
  priority: string
  contactId: string | null
  orderId: string | null
  conversationId: string | null
  assignedTo: string | null
  dueDate: string | null
  completedAt: string | null
  createdAt: string
}

function snapshotFromDetail(d: TaskDetail): TaskSnapshot {
  return {
    taskId: d.taskId,
    title: d.title,
    description: d.description,
    status: d.status,
    priority: d.priority,
    contactId: d.contactId,
    orderId: d.orderId,
    conversationId: d.conversationId,
    assignedTo: d.assignedTo,
    dueDate: d.dueDate,
    completedAt: d.completedAt,
    createdAt: d.createdAt,
  }
}

export function makeTaskMutationTools(ctx: CrmMutationToolsContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    // ========================================================================
    // createTask (MUT-TK-01)
    // Idempotency-eligible. Exclusive arc validated client-side (zod refine).
    // Domain validates the same invariant — defense-in-depth.
    // Rehydrate via getTaskById per D-09 / Pitfall 6.
    // ========================================================================
    createTask: tool({
      description:
        'Crea una nueva tarea en el workspace. AT MOST one de ' +
        'contactId/orderId/conversationId puede estar presente (exclusive arc — ' +
        'domain rule). Idempotency-key opcional para evitar duplicados en ' +
        'reintentos.',
      inputSchema: z
        .object({
          title: z.string().min(1),
          description: z.string().optional(),
          contactId: z.string().uuid().optional(),
          orderId: z.string().uuid().optional(),
          conversationId: z.string().uuid().optional(),
          assignedTo: z.string().uuid().optional(),
          dueDate: z.string().optional(),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
          status: z
            .enum(['pending', 'in_progress', 'completed'])
            .optional(),
          idempotencyKey: z.string().min(1).max(128).optional(),
        })
        .refine(
          (i) => {
            const arcCount = [i.contactId, i.orderId, i.conversationId].filter(
              Boolean,
            ).length
            return arcCount <= 1
          },
          {
            message:
              'createTask: at most one of contactId/orderId/conversationId may be provided',
            path: ['contactId'],
          },
        ),
      execute: async (input): Promise<MutationResult<TaskSnapshot>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'createTask' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, {
          hasContactId: Boolean(input.contactId),
          hasOrderId: Boolean(input.orderId),
          hasConversationId: Boolean(input.conversationId),
          hasIdempotencyKey: Boolean(input.idempotencyKey),
        })

        try {
          const result = await withIdempotency<TaskSnapshot>(
            domainCtx,
            ctx,
            'createTask',
            input.idempotencyKey,
            async () => {
              const created = await domainCreateTask(domainCtx, {
                title: input.title,
                description: input.description,
                dueDate: input.dueDate,
                priority: input.priority,
                status: input.status,
                contactId: input.contactId,
                orderId: input.orderId,
                conversationId: input.conversationId,
                assignedTo: input.assignedTo,
              })
              if (!created.success || !created.data) {
                throw new Error(
                  created.success
                    ? 'createTask: no data'
                    : (created.error ?? 'unknown domain error'),
                )
              }
              const taskId = created.data.taskId
              // Rehydrate via domain getter (NOT input snapshot) — D-09 / Pitfall 6.
              const fetched = await getTaskById(domainCtx, { taskId })
              if (!fetched.success || !fetched.data) {
                throw new Error('createTask: created but rehydrate failed')
              }
              return { id: taskId, data: snapshotFromDetail(fetched.data) }
            },
            // CRITICAL: rehydrate via getTaskById per D-09. NEVER fabricate
            // snapshot from input/id alone (Pitfall 6).
            async (id) => {
              const fetched = await getTaskById(domainCtx, { taskId: id })
              return fetched.success && fetched.data
                ? snapshotFromDetail(fetched.data)
                : null
            },
          )
          emitCompleted(base, {
            resultStatus: result.status,
            latencyMs: Date.now() - startedAt,
            resultId: result.data.taskId,
            idempotencyKeyHit: result.idempotencyKeyHit,
          })
          return result.status === 'duplicate'
            ? { status: 'duplicate', data: result.data }
            : { status: 'executed', data: result.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const mapped = mapDomainError(message)
          logger.warn(
            { err: message, tool: 'createTask', workspaceId: ctx.workspaceId },
            'createTask failed',
          )
          emitFailed(base, {
            errorCode: mapped,
            latencyMs: Date.now() - startedAt,
          })
          if (mapped === 'resource_not_found') {
            // Domain rarely surfaces resource_not_found on createTask (only
            // when assignedTo user is missing) — disambiguate from message.
            let resource: 'contact' | 'order' | 'user' = 'user'
            if (/order|pedido/i.test(message)) resource = 'order'
            else if (/contacto|contact/i.test(message)) resource = 'contact'
            return {
              status: 'resource_not_found',
              error: {
                code: `${resource}_not_found`,
                message,
                missing: { resource, id: '' },
              },
            }
          }
          if (mapped === 'validation_error') {
            return {
              status: 'validation_error',
              error: { code: 'validation_error', message },
            }
          }
          return {
            status: 'error',
            error: { code: 'create_task_failed', message },
          }
        }
      },
    }),

    // ========================================================================
    // updateTask (MUT-TK-02)
    // Domain validates ownership (workspace) + returns "Tarea no encontrada"
    // when missing. Re-hydrate via getTaskById for fresh TaskSnapshot.
    // For marking as completed prefer completeTask — updateTask still works
    // with status='completed' (domain auto-sets completed_at).
    // ========================================================================
    updateTask: tool({
      description:
        'Actualiza campos de una tarea existente. Para marcar como completada ' +
        'prefiere completeTask (mas explicito y idempotente). Pasar status=' +
        '"completed" tambien funciona — el domain setea completed_at.',
      inputSchema: z.object({
        taskId: z.string().uuid(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        assignedTo: z.string().uuid().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        status: z.enum(['pending', 'in_progress', 'completed']).optional(),
      }),
      execute: async (input): Promise<MutationResult<TaskSnapshot>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'updateTask' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, {
          taskIdSuffix: idSuffix(input.taskId),
          fields: Object.keys(input).filter((k) => k !== 'taskId'),
        })
        try {
          const updated = await domainUpdateTask(domainCtx, {
            taskId: input.taskId,
            title: input.title,
            description: input.description,
            dueDate: input.dueDate,
            priority: input.priority,
            status: input.status,
            assignedTo: input.assignedTo,
          })
          if (!updated.success) {
            const message = updated.error ?? ''
            const mapped = mapDomainError(message)
            emitFailed(base, {
              errorCode: mapped,
              latencyMs: Date.now() - startedAt,
            })
            if (mapped === 'resource_not_found') {
              return {
                status: 'resource_not_found',
                error: {
                  code: 'task_not_found',
                  missing: { resource: 'task', id: input.taskId },
                },
              }
            }
            if (mapped === 'validation_error') {
              return {
                status: 'validation_error',
                error: { code: 'validation_error', message },
              }
            }
            return {
              status: 'error',
              error: { code: 'update_task_failed', message },
            }
          }
          // Re-hydrate fresh — D-09 spirit.
          const fetched = await getTaskById(domainCtx, { taskId: input.taskId })
          if (!fetched.success || !fetched.data) {
            emitFailed(base, {
              errorCode: 'rehydrate_failed',
              latencyMs: Date.now() - startedAt,
            })
            return {
              status: 'error',
              error: { code: 'rehydrate_failed' },
            }
          }
          emitCompleted(base, {
            resultStatus: 'executed',
            latencyMs: Date.now() - startedAt,
            resultId: input.taskId,
          })
          return { status: 'executed', data: snapshotFromDetail(fetched.data) }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'updateTask', workspaceId: ctx.workspaceId },
            'updateTask failed',
          )
          emitFailed(base, {
            errorCode: 'unhandled',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'error', error: { code: 'unhandled', message } }
        }
      },
    }),

    // ========================================================================
    // completeTask (MUT-TK-03)
    // Idempotent — domain returns success no-op when task already completed.
    // Sets status='completed' + completed_at; emits task.completed trigger.
    // Rehydrate via getTaskById to return TaskSnapshot with completedAt.
    // ========================================================================
    completeTask: tool({
      description:
        'Marca una tarea como completada (status=completed + completed_at). ' +
        'Idempotente — si ya estaba completada retorna executed con el ' +
        'completed_at original. Emite trigger task.completed para automations.',
      inputSchema: z.object({ taskId: z.string().uuid() }),
      execute: async (input): Promise<MutationResult<TaskSnapshot>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'completeTask' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, { taskIdSuffix: idSuffix(input.taskId) })
        try {
          const completed = await domainCompleteTask(domainCtx, {
            taskId: input.taskId,
          })
          if (!completed.success) {
            const message = completed.error ?? ''
            const mapped = mapDomainError(message)
            emitFailed(base, {
              errorCode: mapped,
              latencyMs: Date.now() - startedAt,
            })
            if (mapped === 'resource_not_found') {
              return {
                status: 'resource_not_found',
                error: {
                  code: 'task_not_found',
                  missing: { resource: 'task', id: input.taskId },
                },
              }
            }
            return {
              status: 'error',
              error: { code: 'complete_task_failed', message },
            }
          }
          // Re-hydrate fresh to return full snapshot with completedAt.
          const fetched = await getTaskById(domainCtx, { taskId: input.taskId })
          if (!fetched.success || !fetched.data) {
            emitFailed(base, {
              errorCode: 'rehydrate_failed',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'error', error: { code: 'rehydrate_failed' } }
          }
          emitCompleted(base, {
            resultStatus: 'executed',
            latencyMs: Date.now() - startedAt,
            resultId: input.taskId,
          })
          return { status: 'executed', data: snapshotFromDetail(fetched.data) }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'completeTask', workspaceId: ctx.workspaceId },
            'completeTask failed',
          )
          emitFailed(base, {
            errorCode: 'unhandled',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'error', error: { code: 'unhandled', message } }
        }
      },
    }),
  }
}
