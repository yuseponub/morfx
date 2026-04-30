/**
 * CRM Mutation Tools — Order Tools.
 *
 * Standalone crm-mutation-tools Wave 2 (Plan 03).
 *
 * BLOCKER invariants (verified via grep gates in Plan 03 acceptance criteria):
 *   - NO workspaceId in inputSchema (Pitfall 2 / D-pre-03 — workspace from ctx).
 *   - NO products field in updateOrder.inputSchema (V1.1 deferred — CONTEXT § Fuera de scope).
 *     If the cliente needs item edits, the agent must escalate to handoff humano.
 *   - NO retry on stage_changed_concurrently (Pitfall 1 — agent loop decides re-propose).
 *     The tool propagates verbatim with actualStageId from domain.data.currentStageId.
 *   - NO hard-delete imports (Pitfall 4 / D-pre-04 — soft-delete only).
 *   - NO imports from @/lib/agents/crm-writer (Pitfall 10 — coexistence per D-01).
 *   - NO createAdminClient (Regla 3 / D-pre-02 — only domain layer mutates).
 *
 * Re-hydration (D-09): every successful mutation re-fetches via getOrderById
 * (with includeArchived=true on archive flow to surface the now-archived row).
 *
 * Adaptations to domain reality (recorded for downstream consumers):
 *   - domain `CreateOrderParams.pipelineId` is REQUIRED (string, not nullable).
 *     Tool input schema mirrors this constraint — pipelineId is required.
 *     If unspecified, the caller must look up via crm-query-tools first.
 *   - domain `MoveOrderToStageParams.newStageId` (NOT `stageId`). Tool input
 *     uses `stageId` (caller-friendly) and maps to `newStageId` for the domain.
 *   - domain `archiveOrder` returns `{ orderId, archivedAt }`. Re-hydration uses
 *     `getOrderById({ includeArchived: true })` so the archived row is returned.
 *   - domain `closeOrder` already re-hydrates internally and returns `OrderDetail`.
 *     The tool just unwraps + emits observability — no extra getOrderById call.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  createOrder as domainCreateOrder,
  updateOrder as domainUpdateOrder,
  moveOrderToStage as domainMoveOrderToStage,
  archiveOrder as domainArchiveOrder,
  closeOrder as domainCloseOrder,
  getOrderById,
  type OrderDetail,
} from '@/lib/domain/orders'
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

const logger = createModuleLogger('crm-mutation-tools.orders')

export function makeOrderMutationTools(ctx: CrmMutationToolsContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    // ========================================================================
    // createOrder (MUT-OR-01)
    // Idempotency-eligible (uses withIdempotency).
    // Domain returns Spanish error strings; we map:
    //   "Pipeline no encontrado en este workspace" → resource_not_found pipeline
    //   "No hay etapas configuradas en el pipeline" → resource_not_found stage
    //   "Numero/Telefono/...invalido|requerido" → validation_error
    //   else → status:error
    // ========================================================================
    createOrder: tool({
      description:
        'Crea un nuevo pedido en el workspace del agente. Requiere contactId + ' +
        'pipelineId. Si stageId no se provee, el domain resuelve la primera etapa ' +
        'del pipeline. Idempotency-key opcional para evitar duplicados en reintentos.',
      inputSchema: z.object({
        contactId: z.string().uuid(),
        pipelineId: z.string().uuid(),
        stageId: z.string().uuid().optional(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        shippingAddress: z.string().optional(),
        shippingCity: z.string().optional(),
        shippingDepartment: z.string().optional(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid().optional(),
              sku: z.string().min(1),
              title: z.string().min(1),
              unitPrice: z.number().nonnegative(),
              quantity: z.number().int().positive(),
            }),
          )
          .optional(),
        idempotencyKey: z.string().min(1).max(128).optional(),
      }),
      execute: async (input): Promise<MutationResult<OrderDetail>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'createOrder' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, {
          contactIdSuffix: idSuffix(input.contactId),
          pipelineIdSuffix: idSuffix(input.pipelineId),
          ...(input.stageId ? { stageIdSuffix: idSuffix(input.stageId) } : {}),
          itemCount: input.items?.length ?? 0,
          hasIdempotencyKey: Boolean(input.idempotencyKey),
        })

        try {
          const result = await withIdempotency<OrderDetail>(
            domainCtx,
            ctx,
            'createOrder',
            input.idempotencyKey,
            async () => {
              const created = await domainCreateOrder(domainCtx, {
                contactId: input.contactId,
                pipelineId: input.pipelineId,
                stageId: input.stageId ?? null,
                name: input.name ?? null,
                description: input.description ?? null,
                shippingAddress: input.shippingAddress ?? null,
                shippingCity: input.shippingCity ?? null,
                shippingDepartment: input.shippingDepartment ?? null,
                products: input.items?.map((it) => ({
                  productId: it.productId ?? null,
                  sku: it.sku,
                  title: it.title,
                  unitPrice: it.unitPrice,
                  quantity: it.quantity,
                })),
              })
              if (!created.success || !created.data) {
                throw new Error(
                  created.success
                    ? 'createOrder returned no data'
                    : (created.error ?? 'unknown domain error'),
                )
              }
              const detail = await getOrderById(domainCtx, {
                orderId: created.data.orderId,
              })
              if (!detail.success || !detail.data) {
                throw new Error(
                  detail.success
                    ? 'Pedido no encontrado tras crear'
                    : (detail.error ?? 'getOrderById failed'),
                )
              }
              return { id: created.data.orderId, data: detail.data }
            },
            async (id) => {
              const detail = await getOrderById(domainCtx, { orderId: id })
              return detail.success ? (detail.data ?? null) : null
            },
          )
          emitCompleted(base, {
            resultStatus: result.status,
            latencyMs: Date.now() - startedAt,
            resultId: result.data?.id,
            idempotencyKeyHit: result.idempotencyKeyHit,
          })
          return result.status === 'duplicate'
            ? { status: 'duplicate', data: result.data }
            : { status: 'executed', data: result.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const mapped = mapDomainError(message)
          logger.warn(
            { err: message, tool: 'createOrder', workspaceId: ctx.workspaceId },
            'createOrder failed',
          )
          emitFailed(base, {
            errorCode: mapped,
            latencyMs: Date.now() - startedAt,
          })

          // Disambiguate which resource is missing using the Spanish error string.
          // Domain emits "Pipeline no encontrado..." vs "No hay etapas configuradas en el pipeline"
          // vs "Pedido no encontrado tras crear" (rehydrate) vs "Contacto no encontrado"
          // (future cross-check). Order matters: stage/etapa FIRST because the
          // "no etapas configuradas en el pipeline" message contains both words —
          // stage is the actual missing resource there.
          if (mapped === 'resource_not_found' || /etapas configuradas/i.test(message)) {
            let resource: 'pipeline' | 'stage' | 'contact' | 'order' = 'order'
            if (/etapa|stage/i.test(message)) resource = 'stage'
            else if (/pipeline/i.test(message)) resource = 'pipeline'
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
            error: { code: 'create_order_failed', message },
          }
        }
      },
    }),

    // ========================================================================
    // updateOrder (MUT-OR-02)
    // V1: NO `products` field in inputSchema (deferred to V1.1 — CONTEXT § Fuera de scope).
    // Pre-check via getOrderById → resource_not_found short-circuit.
    // ========================================================================
    updateOrder: tool({
      description:
        'Actualiza campos de un pedido existente. NO incluye items (V1.1 ' +
        'deferred — para cambiar productos del pedido el agente escala a ' +
        'handoff humano). Pre-check de existencia: si el pedido no existe en ' +
        'el workspace retorna resource_not_found sin mutar.',
      inputSchema: z.object({
        orderId: z.string().uuid(),
        contactId: z.string().uuid().nullable().optional(),
        closingDate: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
        shippingAddress: z.string().nullable().optional(),
        shippingCity: z.string().nullable().optional(),
        shippingDepartment: z.string().nullable().optional(),
      }),
      execute: async (input): Promise<MutationResult<OrderDetail>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'updateOrder' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, {
          orderIdSuffix: idSuffix(input.orderId),
          fields: Object.keys(input).filter((k) => k !== 'orderId'),
        })

        const existing = await getOrderById(domainCtx, { orderId: input.orderId })
        if (!existing.success || !existing.data) {
          emitFailed(base, {
            errorCode: 'resource_not_found',
            latencyMs: Date.now() - startedAt,
          })
          return {
            status: 'resource_not_found',
            error: {
              code: 'order_not_found',
              missing: { resource: 'order', id: input.orderId },
            },
          }
        }

        try {
          const updated = await domainUpdateOrder(domainCtx, {
            orderId: input.orderId,
            contactId: input.contactId,
            closingDate: input.closingDate,
            description: input.description,
            name: input.name,
            shippingAddress: input.shippingAddress,
            shippingCity: input.shippingCity,
            shippingDepartment: input.shippingDepartment,
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
                  code: 'order_not_found',
                  message,
                  missing: { resource: 'order', id: input.orderId },
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
              error: { code: 'update_order_failed', message },
            }
          }

          const detail = await getOrderById(domainCtx, { orderId: input.orderId })
          if (!detail.success || !detail.data) {
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
            resultId: input.orderId,
          })
          return { status: 'executed', data: detail.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'updateOrder', workspaceId: ctx.workspaceId },
            'updateOrder failed',
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
    // moveOrderToStage (MUT-OR-03)
    //
    // Pitfall 1 contract — CRITICAL:
    //   When domain returns { success: false, error: 'stage_changed_concurrently',
    //   data: { currentStageId } }, the tool MUST propagate verbatim WITHOUT retry.
    //   Domain widens its return shape via `as any` (orders.ts:660-669) — DomainResult<T>
    //   failure type does NOT expose `data`, so we widen here too.
    //   actualStageId may be `null` if domain refetch failed — types.ts MutationResult
    //   models this as `string | null` (NOT just string).
    //
    // Caller-friendly schema: input uses `stageId` (mapped to domain.newStageId).
    // ========================================================================
    moveOrderToStage: tool({
      description:
        'Mueve un pedido a otra etapa (CAS-protected en domain). NUNCA reintenta ' +
        'en stage_changed_concurrently — el agente decide re-proponer la mutación ' +
        'con estado fresco. Pre-check de existencia del pedido.',
      inputSchema: z.object({
        orderId: z.string().uuid(),
        stageId: z.string().uuid(),
      }),
      execute: async (input): Promise<MutationResult<OrderDetail>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'moveOrderToStage' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, {
          orderIdSuffix: idSuffix(input.orderId),
          stageIdSuffix: idSuffix(input.stageId),
        })

        const existing = await getOrderById(domainCtx, { orderId: input.orderId })
        if (!existing.success || !existing.data) {
          emitFailed(base, {
            errorCode: 'resource_not_found',
            latencyMs: Date.now() - startedAt,
          })
          return {
            status: 'resource_not_found',
            error: {
              code: 'order_not_found',
              missing: { resource: 'order', id: input.orderId },
            },
          }
        }

        try {
          // NOTE: domain expects `newStageId`, tool exposes caller-friendly `stageId`.
          const moved = await domainMoveOrderToStage(domainCtx, {
            orderId: input.orderId,
            newStageId: input.stageId,
          })

          // CAS reject path — Pitfall 1 verbatim propagation.
          // Domain widens its return shape via `as any` for this branch, so we
          // widen here to extract data.currentStageId without TS error.
          if (!moved.success && moved.error === 'stage_changed_concurrently') {
            const widened = moved as unknown as {
              success: false
              error: 'stage_changed_concurrently'
              data?: { currentStageId: string | null }
            }
            const actualStageId = widened.data?.currentStageId ?? null
            emitFailed(base, {
              errorCode: 'stage_changed_concurrently',
              latencyMs: Date.now() - startedAt,
            })
            return {
              status: 'stage_changed_concurrently',
              error: {
                code: 'stage_changed_concurrently',
                expectedStageId: input.stageId,
                actualStageId,
              },
            }
          }

          if (!moved.success) {
            const message = moved.error ?? ''
            const mapped = mapDomainError(message)
            emitFailed(base, {
              errorCode: mapped,
              latencyMs: Date.now() - startedAt,
            })
            if (mapped === 'resource_not_found') {
              // Disambiguate: if message mentions stage/etapa, missing resource is stage;
              // otherwise it's order (pre-check covers normal order-missing path so this
              // is a race where order disappeared between pre-check and CAS).
              const resource: 'stage' | 'order' = /stage|etapa/i.test(message)
                ? 'stage'
                : 'order'
              return {
                status: 'resource_not_found',
                error: {
                  code: `${resource}_not_found`,
                  message,
                  missing: {
                    resource,
                    id: resource === 'stage' ? input.stageId : input.orderId,
                  },
                },
              }
            }
            return {
              status: 'error',
              error: { code: 'move_order_failed', message },
            }
          }

          const detail = await getOrderById(domainCtx, { orderId: input.orderId })
          if (!detail.success || !detail.data) {
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
            resultId: input.orderId,
          })
          return { status: 'executed', data: detail.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'moveOrderToStage', workspaceId: ctx.workspaceId },
            'moveOrderToStage failed',
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
    // archiveOrder (MUT-OR-04)
    // Soft-delete via archived_at. Domain idempotent.
    // Re-hydrate uses includeArchived=true so the archived row surfaces.
    // ========================================================================
    archiveOrder: tool({
      description:
        'Soft-delete de un pedido (set archived_at). Idempotent — si ya estaba ' +
        'archivado, retorna executed con archived_at original. NUNCA hard-delete. ' +
        'Distinto de closeOrder (cierra por flujo de negocio sin ocultar del UI).',
      inputSchema: z.object({
        orderId: z.string().uuid(),
      }),
      execute: async (input): Promise<MutationResult<OrderDetail>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'archiveOrder' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, { orderIdSuffix: idSuffix(input.orderId) })

        // Pre-check: include archived rows so we can fall through to idempotent
        // archive on already-archived orders.
        const existing = await getOrderById(domainCtx, {
          orderId: input.orderId,
          includeArchived: true,
        })
        if (!existing.success || !existing.data) {
          emitFailed(base, {
            errorCode: 'resource_not_found',
            latencyMs: Date.now() - startedAt,
          })
          return {
            status: 'resource_not_found',
            error: {
              code: 'order_not_found',
              missing: { resource: 'order', id: input.orderId },
            },
          }
        }

        try {
          const archived = await domainArchiveOrder(domainCtx, {
            orderId: input.orderId,
          })
          if (!archived.success || !archived.data) {
            emitFailed(base, {
              errorCode: 'archive_failed',
              latencyMs: Date.now() - startedAt,
            })
            return {
              status: 'error',
              error: {
                code: 'archive_order_failed',
                message: archived.success ? 'no data' : archived.error,
              },
            }
          }

          // Re-hydrate WITH archived rows included (the row is now archived).
          const detail = await getOrderById(domainCtx, {
            orderId: input.orderId,
            includeArchived: true,
          })
          if (!detail.success || !detail.data) {
            emitFailed(base, {
              errorCode: 'rehydrate_failed',
              latencyMs: Date.now() - startedAt,
            })
            return { status: 'error', error: { code: 'rehydrate_failed' } }
          }
          emitCompleted(base, {
            resultStatus: 'executed',
            latencyMs: Date.now() - startedAt,
            resultId: input.orderId,
          })
          return { status: 'executed', data: detail.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'archiveOrder', workspaceId: ctx.workspaceId },
            'archiveOrder failed',
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
    // closeOrder (MUT-OR-05) — wraps Plan 01 domain function.
    // Distinct from archive (closeOrder retains visibility; archiveOrder hides).
    // Domain already re-hydrates internally and returns OrderDetail.
    // Idempotent at domain (already-closed returns same closed_at).
    // ========================================================================
    closeOrder: tool({
      description:
        'Cierra un pedido (set closed_at) — pedido finalizado por flujo de negocio. ' +
        'Sigue visible en histórico. Idempotent — si ya estaba cerrado retorna ' +
        'executed con closed_at original. Distinto de archiveOrder (que oculta del UI). D-11.',
      inputSchema: z.object({
        orderId: z.string().uuid(),
      }),
      execute: async (input): Promise<MutationResult<OrderDetail>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'closeOrder' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, { orderIdSuffix: idSuffix(input.orderId) })

        // Pre-check: include archived so we can close already-archived orders if
        // the workspace allows that combination (closed_at and archived_at are
        // independent per D-11).
        const existing = await getOrderById(domainCtx, {
          orderId: input.orderId,
          includeArchived: true,
        })
        if (!existing.success || !existing.data) {
          emitFailed(base, {
            errorCode: 'resource_not_found',
            latencyMs: Date.now() - startedAt,
          })
          return {
            status: 'resource_not_found',
            error: {
              code: 'order_not_found',
              missing: { resource: 'order', id: input.orderId },
            },
          }
        }

        try {
          // Domain closeOrder already re-hydrates and returns OrderDetail.
          const closed = await domainCloseOrder(domainCtx, {
            orderId: input.orderId,
          })
          if (!closed.success || !closed.data) {
            emitFailed(base, {
              errorCode: 'close_failed',
              latencyMs: Date.now() - startedAt,
            })
            return {
              status: 'error',
              error: {
                code: 'close_order_failed',
                message: closed.success ? 'no data' : closed.error,
              },
            }
          }
          emitCompleted(base, {
            resultStatus: 'executed',
            latencyMs: Date.now() - startedAt,
            resultId: input.orderId,
          })
          return { status: 'executed', data: closed.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'closeOrder', workspaceId: ctx.workspaceId },
            'closeOrder failed',
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
