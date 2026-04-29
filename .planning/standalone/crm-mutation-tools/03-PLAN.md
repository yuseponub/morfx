---
plan: 03
wave: 2
phase: standalone-crm-mutation-tools
depends_on:
  - 01
  - 02
files_modified:
  - src/lib/agents/shared/crm-mutation-tools/contacts.ts
  - src/lib/agents/shared/crm-mutation-tools/orders.ts
  - src/lib/agents/shared/crm-mutation-tools/index.ts
  - src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts
  - src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts
autonomous: true
requirements:
  - MUT-CT-02  # updateContact
  - MUT-CT-03  # archiveContact
  - MUT-OR-01  # createOrder
  - MUT-OR-02  # updateOrder (NO products in V1)
  - MUT-OR-03  # moveOrderToStage (CAS propagation)
  - MUT-OR-04  # archiveOrder
  - MUT-OR-05  # closeOrder (wraps Plan 01 domain)
---

<objective>
Wave 2 — Contacts + Orders fan-out. Extiende `contacts.ts` con `updateContact` + `archiveContact`, y crea `orders.ts` con los 5 tools de pedidos: `createOrder`, `updateOrder` (sin `products` — V1.1 deferred), `moveOrderToStage` (propaga `stage_changed_concurrently` verbatim sin retry — Pitfall 1), `archiveOrder`, `closeOrder` (wraps Plan 01's new domain function).

Purpose: cierra 7/15 tools de la suite (3 contacts + 4 orders mutation + 1 close). Plan 04 hace los 8 restantes (notes + tasks).

Output: 5 archivos editados/nuevos. Suite de tests Vitest unit cubriendo ~26 escenarios.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/crm-mutation-tools/CONTEXT.md
@.planning/standalone/crm-mutation-tools/RESEARCH.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 3.1: Extend `contacts.ts` with `updateContact` + `archiveContact`</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:357-376 (Pattern 3 — existence pre-check)
    - src/lib/agents/shared/crm-mutation-tools/contacts.ts (current — Plan 02 scaffold)
    - src/lib/domain/contacts.ts:189-260 (updateContact signature)
    - src/lib/domain/contacts.ts:466-540 (archiveContact signature — already idempotent)
  </read_first>
  <behavior>
    - updateContact: pre-check via getContactById → if missing, returns `resource_not_found`. Happy path → calls domain.updateContact → re-hydrates → `executed`.
    - archiveContact: pre-check via getContactById → if missing, `resource_not_found`. If found → calls domain.archiveContact (idempotent at domain) → re-hydrates → `executed` whether already archived or just archived.
    - Both emit 3 observability events (invoked / completed | failed).
  </behavior>
  <action>
    Editar `src/lib/agents/shared/crm-mutation-tools/contacts.ts`. Agregar dentro de `makeContactMutationTools(ctx)`:

    ```typescript
    updateContact: tool({
      description: 'Actualiza campos de un contacto existente en el workspace del agente. Partial update.',
      inputSchema: z.object({
        contactId: z.string().uuid(),
        name: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        // No customFields in V1 (RESEARCH Q7); add later if agent requires.
        tags: z.array(z.string().uuid()).optional(),
      }),
      execute: async (input): Promise<MutationResult<ContactDetail>> => {
        const startedAt = Date.now()
        const base = { tool: 'updateContact', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
        emitInvoked(base, {
          contactIdSuffix: idSuffix(input.contactId),
          ...(input.phone ? { phoneSuffix: phoneSuffix(input.phone) } : {}),
          ...(input.email ? { email: emailRedact(input.email) } : {}),
        })
        const domainCtx = { workspaceId: ctx.workspaceId }

        const existing = await getContactById(domainCtx, { contactId: input.contactId })
        if (!existing.success || !existing.data) {
          emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
          return {
            status: 'resource_not_found',
            error: { code: 'contact_not_found', missing: { resource: 'contact', id: input.contactId } },
          }
        }

        try {
          const updated = await domainUpdateContact(domainCtx, {
            contactId: input.contactId,
            name: input.name,
            phone: input.phone,
            email: input.email,
            tags: input.tags,
          })
          if (!updated.success) {
            const mapped = mapDomainError(updated.error ?? '')
            emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
            if (mapped === 'validation_error') {
              return { status: 'validation_error', error: { code: 'validation_error', message: updated.error ?? '' } }
            }
            return { status: 'error', error: { code: 'update_contact_failed', message: updated.error } }
          }

          const detail = await getContactById(domainCtx, { contactId: input.contactId })
          if (!detail.success || !detail.data) {
            emitFailed(base, { errorCode: 'rehydrate_failed', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'rehydrate_failed' } }
          }
          emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.contactId })
          return { status: 'executed', data: detail.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
          return { status: 'error', error: { code: 'unhandled', message } }
        }
      },
    }),

    archiveContact: tool({
      description: 'Soft-delete de un contacto (set archived_at). Idempotent — si ya estaba archived, retorna executed con archived_at original. NEVER hard-delete.',
      inputSchema: z.object({ contactId: z.string().uuid() }),
      execute: async (input): Promise<MutationResult<ContactDetail>> => {
        const startedAt = Date.now()
        const base = { tool: 'archiveContact', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
        emitInvoked(base, { contactIdSuffix: idSuffix(input.contactId) })
        const domainCtx = { workspaceId: ctx.workspaceId }

        const existing = await getContactById(domainCtx, { contactId: input.contactId })
        if (!existing.success || !existing.data) {
          emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
          return {
            status: 'resource_not_found',
            error: { code: 'contact_not_found', missing: { resource: 'contact', id: input.contactId } },
          }
        }

        try {
          const archived = await domainArchiveContact(domainCtx, { contactId: input.contactId })
          if (!archived.success) {
            emitFailed(base, { errorCode: 'archive_failed', latencyMs: Date.now() - startedAt })
            return { status: 'error', error: { code: 'archive_contact_failed', message: archived.error } }
          }
          const detail = await getContactById(domainCtx, { contactId: input.contactId })
          if (!detail.success || !detail.data) {
            return { status: 'error', error: { code: 'rehydrate_failed' } }
          }
          emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.contactId })
          return { status: 'executed', data: detail.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
          return { status: 'error', error: { code: 'unhandled', message } }
        }
      },
    }),
    ```

    Agregar imports faltantes: `updateContact as domainUpdateContact, archiveContact as domainArchiveContact` from `@/lib/domain/contacts`. `idSuffix` from `./helpers`.

    Extender `__tests__/contacts.test.ts` con tests para updateContact (resource_not_found, executed, validation_error) y archiveContact (resource_not_found, executed-already-archived, executed-newly-archived). ~6 tests adicionales.

    **Doc-comment al inicio del archivo (después del comentario existente):** `// BLOCKER invariants (Pitfalls 2+4+10): no workspaceId in input, no deleteContact import, no @/lib/agents/crm-writer imports.`
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - 3 tools exported from `makeContactMutationTools`: createContact, updateContact, archiveContact.
    - `grep -c "deleteContact\b" src/lib/agents/shared/crm-mutation-tools/contacts.ts` == 0 (Pitfall 4).
    - `grep -E "workspaceId.*z\\.string|workspaceId.*\\.uuid" src/lib/agents/shared/crm-mutation-tools/contacts.ts` returns 0 matches inside inputSchema blocks (Pitfall 2).
    - Vitest reports ≥ 12 passing tests in contacts.test.ts (6 from Plan 02 + 6 new).
  </acceptance_criteria>
  <done>3/3 contact tools complete.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3.2: Create `orders.ts` with 5 tools</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:529-544 (domain function audit — exact line:col references)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:573-587 (zod schema for updateOrder — NO products field)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:846-848 (CAS propagation contract)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:940-948 (Pitfall 1 — NO retry on stage_changed_concurrently)
    - src/lib/domain/orders.ts:597-770 (moveOrderToStage CAS pattern + currentStageId in error data)
    - src/lib/domain/orders.ts:224-320 (createOrder signature + auto-resolves first stage if not provided)
  </read_first>
  <behavior>
    - createOrder: idempotency-eligible (uses withIdempotency). Happy → calls domain.createOrder → rehydrates via getOrderById → `executed`. Pipeline/stage not found → `resource_not_found` with missing.resource: 'pipeline' or 'stage'.
    - updateOrder: pre-check getOrderById → resource_not_found if missing. NO `products` in input schema (V1.1 deferred). Happy → re-hydrates → `executed`.
    - moveOrderToStage: pre-check getOrderById. Pre-check stage exists (research suggests existence via list_stages — keep simple: trust domain to return descriptive error if stageId invalid). Domain returns `{success:false, error:'stage_changed_concurrently', data:{currentStageId}}` → tool returns `{status:'stage_changed_concurrently', error:{code:'stage_changed_concurrently', expectedStageId: input.stageId, actualStageId: data.currentStageId}}`. **NEVER retries.**
    - archiveOrder: pre-check + domain.archiveOrder (idempotent) + rehydrate.
    - closeOrder: pre-check + domain.closeOrder (Plan 01) + rehydrate. Idempotent.
  </behavior>
  <action>
    Crear `src/lib/agents/shared/crm-mutation-tools/orders.ts`:

    ```typescript
    // BLOCKER invariants:
    //  - NO workspaceId in inputSchema (Pitfall 2 — D-pre-03).
    //  - NO products field in updateOrder inputSchema (V1.1 deferred — CONTEXT § Fuera de scope).
    //  - NO retry on stage_changed_concurrently (Pitfall 1 — agent loop decides).
    //  - NO hard delete imports (Pitfall 4 — soft-delete only).
    //  - NO imports from @/lib/agents/crm-writer (Pitfall 10 — mirror separately).
    //  - NO createAdminClient (Regla 3 — D-pre-02).
    import { tool } from 'ai'
    import { z } from 'zod'
    import {
      createOrder as domainCreateOrder,
      updateOrder as domainUpdateOrder,
      moveOrderToStage as domainMoveOrderToStage,
      archiveOrder as domainArchiveOrder,
      closeOrder as domainCloseOrder,
      getOrderById,
    } from '@/lib/domain/orders'
    import type { OrderDetail } from '@/lib/domain/orders'
    import { createModuleLogger } from '@/lib/audit/logger'
    import type { CrmMutationToolsContext, MutationResult } from './types'
    import {
      withIdempotency,
      emitInvoked, emitCompleted, emitFailed,
      idSuffix, mapDomainError,
    } from './helpers'

    const logger = createModuleLogger('crm-mutation-tools.orders')

    export function makeOrderMutationTools(ctx: CrmMutationToolsContext) {
      const domainCtx = { workspaceId: ctx.workspaceId }

      return {
        createOrder: tool({
          description: 'Crea un nuevo pedido. Si pipelineId/stageId no provistos, se resuelven al primer pipeline/stage del workspace. Idempotency-key opcional.',
          inputSchema: z.object({
            contactId: z.string().uuid(),
            pipelineId: z.string().uuid().optional(),
            stageId: z.string().uuid().optional(),
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            shippingAddress: z.string().optional(),
            shippingCity: z.string().optional(),
            shippingDepartment: z.string().optional(),
            items: z.array(z.object({
              productId: z.string().uuid().optional(),
              name: z.string(),
              quantity: z.number().int().positive(),
              unitPrice: z.number().nonnegative(),
            })).optional(),
            idempotencyKey: z.string().min(1).max(128).optional(),
          }),
          execute: async (input): Promise<MutationResult<OrderDetail>> => {
            const startedAt = Date.now()
            const base = { tool: 'createOrder', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, {
              contactIdSuffix: idSuffix(input.contactId),
              hasPipelineId: Boolean(input.pipelineId),
              hasIdempotencyKey: Boolean(input.idempotencyKey),
            })
            try {
              const result = await withIdempotency<OrderDetail>(
                domainCtx, ctx, 'createOrder', input.idempotencyKey,
                async () => {
                  const created = await domainCreateOrder(domainCtx, {
                    contactId: input.contactId,
                    pipelineId: input.pipelineId ?? null,
                    stageId: input.stageId ?? null,
                    name: input.name ?? null,
                    description: input.description ?? null,
                    shippingAddress: input.shippingAddress ?? null,
                    shippingCity: input.shippingCity ?? null,
                    shippingDepartment: input.shippingDepartment ?? null,
                    items: input.items ?? [],
                  })
                  if (!created.success || !created.data) {
                    throw new Error(created.success ? 'createOrder returned no data' : created.error)
                  }
                  const detail = await getOrderById(domainCtx, { orderId: created.data.orderId })
                  if (!detail.success || !detail.data) {
                    throw new Error(detail.success ? 'Pedido no encontrado tras crear' : detail.error)
                  }
                  return { id: created.data.orderId, data: detail.data }
                },
                async (id) => {
                  const detail = await getOrderById(domainCtx, { orderId: id })
                  return detail.success ? detail.data : null
                },
              )
              emitCompleted(base, { resultStatus: result.status, latencyMs: Date.now() - startedAt, resultId: result.data.id, idempotencyKeyHit: result.idempotencyKeyHit })
              return { status: result.status, data: result.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              const mapped = mapDomainError(message)
              emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })

              // Pipeline/stage not found → bubble as resource_not_found with missing.resource discriminated
              if (mapped === 'resource_not_found') {
                let resource: 'pipeline' | 'stage' | 'contact' | 'order' = 'order'
                if (/pipeline/i.test(message)) resource = 'pipeline'
                else if (/stage|etapa/i.test(message)) resource = 'stage'
                else if (/contacto|contact/i.test(message)) resource = 'contact'
                return {
                  status: 'resource_not_found',
                  error: { code: `${resource}_not_found`, message, missing: { resource, id: '' } },
                }
              }
              if (mapped === 'validation_error') {
                return { status: 'validation_error', error: { code: 'validation_error', message } }
              }
              return { status: 'error', error: { code: 'create_order_failed', message } }
            }
          },
        }),

        updateOrder: tool({
          description: 'Actualiza campos de un pedido existente. NO incluye items (V1.1 deferred — usa handoff humano si cliente quiere cambiar items).',
          inputSchema: z.object({
            orderId: z.string().uuid(),
            contactId: z.string().uuid().nullable().optional(),
            closingDate: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            name: z.string().nullable().optional(),
            shippingAddress: z.string().nullable().optional(),
            shippingCity: z.string().nullable().optional(),
            shippingDepartment: z.string().nullable().optional(),
            // NO products field in V1 (CONTEXT.md § Fuera de scope)
          }),
          execute: async (input): Promise<MutationResult<OrderDetail>> => {
            const startedAt = Date.now()
            const base = { tool: 'updateOrder', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { orderIdSuffix: idSuffix(input.orderId) })

            const existing = await getOrderById(domainCtx, { orderId: input.orderId })
            if (!existing.success || !existing.data) {
              emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
              return { status: 'resource_not_found', error: { code: 'order_not_found', missing: { resource: 'order', id: input.orderId } } }
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
                const mapped = mapDomainError(updated.error ?? '')
                emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
                if (mapped === 'validation_error') return { status: 'validation_error', error: { code: 'validation_error', message: updated.error ?? '' } }
                return { status: 'error', error: { code: 'update_order_failed', message: updated.error } }
              }
              const detail = await getOrderById(domainCtx, { orderId: input.orderId })
              if (!detail.success || !detail.data) return { status: 'error', error: { code: 'rehydrate_failed' } }
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.orderId })
              return { status: 'executed', data: detail.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
              return { status: 'error', error: { code: 'unhandled', message } }
            }
          },
        }),

        moveOrderToStage: tool({
          description: 'Mueve un pedido a otra etapa (CAS-protected). NUNCA reintenta en stage_changed_concurrently — el agente decide re-proponer.',
          inputSchema: z.object({
            orderId: z.string().uuid(),
            stageId: z.string().uuid(),
          }),
          execute: async (input): Promise<MutationResult<OrderDetail>> => {
            const startedAt = Date.now()
            const base = { tool: 'moveOrderToStage', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { orderIdSuffix: idSuffix(input.orderId), stageIdSuffix: idSuffix(input.stageId) })

            const existing = await getOrderById(domainCtx, { orderId: input.orderId })
            if (!existing.success || !existing.data) {
              emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
              return { status: 'resource_not_found', error: { code: 'order_not_found', missing: { resource: 'order', id: input.orderId } } }
            }

            try {
              const moved = await domainMoveOrderToStage(domainCtx, { orderId: input.orderId, stageId: input.stageId })

              // CAS reject path — domain returns error: 'stage_changed_concurrently' with data.currentStageId.
              // Domain widens its return shape via `as any` for this branch (orders.ts:660-669):
              //   { success: false, error: 'stage_changed_concurrently', data: { currentStageId: string | null } }
              // DomainResult<T>'s failure type does NOT expose `data`, so we must widen here.
              // Pitfall 1: propagate verbatim, NEVER retry. actualStageId may be null if refetch failed.
              if (!moved.success && moved.error === 'stage_changed_concurrently') {
                const widened = moved as unknown as {
                  success: false
                  error: 'stage_changed_concurrently'
                  data?: { currentStageId: string | null }
                }
                const actualStageId = widened.data?.currentStageId ?? null
                emitFailed(base, { errorCode: 'stage_changed_concurrently', latencyMs: Date.now() - startedAt })
                return {
                  status: 'stage_changed_concurrently',
                  error: {
                    code: 'stage_changed_concurrently',
                    expectedStageId: input.stageId,
                    actualStageId,  // string | null — Plan 02 types.ts widened to match
                  },
                }
              }

              if (!moved.success) {
                const mapped = mapDomainError(moved.error ?? '')
                emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
                if (mapped === 'resource_not_found') {
                  return { status: 'resource_not_found', error: { code: 'stage_not_found', message: moved.error, missing: { resource: 'stage', id: input.stageId } } }
                }
                return { status: 'error', error: { code: 'move_order_failed', message: moved.error } }
              }

              const detail = await getOrderById(domainCtx, { orderId: input.orderId })
              if (!detail.success || !detail.data) return { status: 'error', error: { code: 'rehydrate_failed' } }
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.orderId })
              return { status: 'executed', data: detail.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
              return { status: 'error', error: { code: 'unhandled', message } }
            }
          },
        }),

        archiveOrder: tool({
          description: 'Soft-delete de un pedido (set archived_at). Idempotent. NEVER hard-delete.',
          inputSchema: z.object({ orderId: z.string().uuid() }),
          execute: async (input): Promise<MutationResult<OrderDetail>> => {
            const startedAt = Date.now()
            const base = { tool: 'archiveOrder', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { orderIdSuffix: idSuffix(input.orderId) })

            const existing = await getOrderById(domainCtx, { orderId: input.orderId })
            if (!existing.success || !existing.data) {
              emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
              return { status: 'resource_not_found', error: { code: 'order_not_found', missing: { resource: 'order', id: input.orderId } } }
            }
            try {
              const archived = await domainArchiveOrder(domainCtx, { orderId: input.orderId })
              if (!archived.success) {
                emitFailed(base, { errorCode: 'archive_failed', latencyMs: Date.now() - startedAt })
                return { status: 'error', error: { code: 'archive_order_failed', message: archived.error } }
              }
              const detail = await getOrderById(domainCtx, { orderId: input.orderId })
              if (!detail.success || !detail.data) return { status: 'error', error: { code: 'rehydrate_failed' } }
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.orderId })
              return { status: 'executed', data: detail.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
              return { status: 'error', error: { code: 'unhandled', message } }
            }
          },
        }),

        closeOrder: tool({
          description: 'Cierra un pedido (set closed_at) — pedido finalizado por flujo de negocio, sigue visible en histórico. Idempotent. Distinto de archive (que oculta). D-11.',
          inputSchema: z.object({ orderId: z.string().uuid() }),
          execute: async (input): Promise<MutationResult<OrderDetail>> => {
            const startedAt = Date.now()
            const base = { tool: 'closeOrder', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { orderIdSuffix: idSuffix(input.orderId) })

            const existing = await getOrderById(domainCtx, { orderId: input.orderId })
            if (!existing.success || !existing.data) {
              emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
              return { status: 'resource_not_found', error: { code: 'order_not_found', missing: { resource: 'order', id: input.orderId } } }
            }
            try {
              const closed = await domainCloseOrder(domainCtx, { orderId: input.orderId })
              if (!closed.success || !closed.data) {
                emitFailed(base, { errorCode: 'close_failed', latencyMs: Date.now() - startedAt })
                return { status: 'error', error: { code: 'close_order_failed', message: closed.success ? 'no data' : closed.error } }
              }
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.orderId })
              return { status: 'executed', data: closed.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
              return { status: 'error', error: { code: 'unhandled', message } }
            }
          },
        }),
      }
    }
    ```

    Update `index.ts` to spread `makeOrderMutationTools(ctx)`:

    ```typescript
    import { makeContactMutationTools } from './contacts'
    import { makeOrderMutationTools } from './orders'
    import type { CrmMutationToolsContext } from './types'

    export function createCrmMutationTools(ctx: CrmMutationToolsContext) {
      return {
        ...makeContactMutationTools(ctx),
        ...makeOrderMutationTools(ctx),
        // Plan 04 spreads notes + tasks here.
      }
    }

    export type { CrmMutationToolsContext, MutationResult, ResourceType } from './types'
    ```

    Crear `src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts`. ~20 tests:
    - createOrder: happy + idempotency hit + pipeline_not_found + stage_not_found + validation_error + error
    - updateOrder: resource_not_found + happy + validation_error + error
    - moveOrderToStage: resource_not_found + happy + **stage_changed_concurrently with actualStageId asserted** + stage_not_found + error
    - archiveOrder: resource_not_found + happy + idempotent (already archived)
    - closeOrder: resource_not_found + happy + idempotent (already closed)

    Use vi.hoisted pattern + two-step cast for `.execute`. CAS-reject test:
    ```typescript
    // Case A — domain returns currentStageId (refetch succeeded)
    domainMoveOrderToStageMock.mockResolvedValueOnce({
      success: false,
      error: 'stage_changed_concurrently',
      data: { currentStageId: 'stage-actual-uuid' },
    })
    const resultA = await (tools.moveOrderToStage as unknown as { execute: (i: unknown) => Promise<unknown> })
      .execute({ orderId: '...', stageId: 'stage-expected-uuid' })
    expect(resultA).toMatchObject({
      status: 'stage_changed_concurrently',
      error: { code: 'stage_changed_concurrently', expectedStageId: 'stage-expected-uuid', actualStageId: 'stage-actual-uuid' },
    })

    // Case B — domain returns currentStageId: null (refetch failed; actualStageId must be null, NOT '')
    domainMoveOrderToStageMock.mockResolvedValueOnce({
      success: false,
      error: 'stage_changed_concurrently',
      data: { currentStageId: null },
    })
    const resultB = await (tools.moveOrderToStage as unknown as { execute: (i: unknown) => Promise<unknown> })
      .execute({ orderId: '...', stageId: 'stage-expected-uuid' })
    expect(resultB).toMatchObject({
      status: 'stage_changed_concurrently',
      error: { code: 'stage_changed_concurrently', expectedStageId: 'stage-expected-uuid', actualStageId: null },
    })
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - 5 tools in orders.ts: createOrder, updateOrder, moveOrderToStage, archiveOrder, closeOrder.
    - `grep -A 30 "updateOrder: tool" src/lib/agents/shared/crm-mutation-tools/orders.ts | grep -c "products"` == 0 (V1.1 deferred).
    - `grep "deleteOrder\b" src/lib/agents/shared/crm-mutation-tools/orders.ts` returns 0 (Pitfall 4).
    - `grep -E "workspaceId.*z\\.string|workspaceId.*\\.uuid" src/lib/agents/shared/crm-mutation-tools/orders.ts` returns 0 (Pitfall 2).
    - `grep -E "from '@/lib/agents/crm-writer" src/lib/agents/shared/crm-mutation-tools/orders.ts` returns 0 (Pitfall 10).
    - `grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/orders.ts | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | wc -l` == 0 (Regla 3).
    - **Pitfall 1 textbook gate (no-retry on stage_changed_concurrently):** `grep -E 'while.*stage_changed_concurrently|for.*stage_changed_concurrently|retry.*moveOrderToStage|moveOrderToStage.*retry' src/lib/agents/shared/crm-mutation-tools/orders.ts | wc -l` == 0.
    - **TypeScript clean for the tool file:** `npx tsc --noEmit -p . 2>&1 | grep -E "src/lib/agents/shared/crm-mutation-tools/orders\.ts" | wc -l` == 0.
    - **Type contract widened in Plan 02 types.ts:** `MutationResult.stage_changed_concurrently.error.actualStageId` is typed as `string | null` (NOT `string`) — verifiable: `grep -c "actualStageId: string | null" src/lib/agents/shared/crm-mutation-tools/types.ts` ≥ 1. If the executor finds `actualStageId: string` instead (Plan 02 type missed widening), apply the 1-character fix here in Task 3.2 — this is part of the BLOCKER #1 contract.
    - Vitest reports ≥ 20 passing tests in orders.test.ts including TWO CAS-reject tests: one asserting `actualStageId === 'stage-actual-uuid'` (domain returned currentStageId), and one asserting `actualStageId === null` (domain returned currentStageId: null).
    - index.ts exports all 8 tools (3 contacts + 5 orders) per `Object.keys(createCrmMutationTools({...}))` size.
  </acceptance_criteria>
  <done>5/5 order tools complete. 8/15 total tools shipped.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3.3: Commit + push (Regla 1)</name>
  <action>
    ```
    git add src/lib/agents/shared/crm-mutation-tools/
    git commit -m "$(cat <<'EOF'
    feat(crm-mutation-tools): wave 2 — contacts + orders fan-out (8/15)

    - contacts.ts: añade updateContact (pre-check + re-hydrate) y archiveContact (idempotent).
    - orders.ts NUEVO: createOrder (idempotency-eligible) + updateOrder (sin products V1.1) + moveOrderToStage (CAS propagation, no retry — Pitfall 1) + archiveOrder + closeOrder (wraps Plan 01 domain).
    - index.ts: spread makeOrderMutationTools.
    - Tests contacts.test.ts (+6 = 12 total) y orders.test.ts (~20) incluyendo CAS-reject con actualStageId.

    BLOCKER invariants (verified via grep gates):
    - Sin workspaceId en inputSchema (Pitfall 2).
    - Sin products en updateOrder.inputSchema (V1.1 deferred).
    - Sin retry en stage_changed_concurrently (Pitfall 1).
    - Sin deleteContact/deleteOrder (Pitfall 4).
    - Sin createAdminClient en módulo (Regla 3).
    - Sin imports cross-module @/lib/agents/crm-writer (Pitfall 10).

    Standalone: crm-mutation-tools Plan 03 (Wave 2).
    Refs MUT-CT-02, MUT-CT-03, MUT-OR-01..05.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "wave 2"</automated>
  </verify>
  <acceptance_criteria>
    - Commit pushed; clean tree.
  </acceptance_criteria>
  <done>Wave 2 cierra.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tool execute() → Domain mutation | Pre-check via getXxxById; resource_not_found short-circuit |
| Domain CAS-protected move → Tool | stage_changed_concurrently propagated VERBATIM (no retry) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-03-01 | Tampering | Silent overwrite of concurrent stage move | HIGH | mitigate | Tool propagates verbatim — no retry, no swallow. Test asserts `actualStageId === mocked-currentStageId`. (Pitfall 1) |
| T-03-02 | Information Disclosure | updateOrder.products allows item edits without humanization gate | LOW | mitigate | inputSchema explicitly excludes `products`. Grep gate. V1 escalates to handoff if cliente pide cambiar items. |
| T-03-03 | Tampering | Cross-workspace order ID forces mutation | HIGH | mitigate | getOrderById filters by workspaceId at domain layer; returns null → resource_not_found. Plan 05 integration test verifies. |
| T-03-04 | Repudiation | closeOrder + archiveOrder both touched in same flow obscures audit | LOW | accept | Both tools emit observability separately. INTEGRATION-HANDOFF (Plan 06) documents distinction. |
| T-03-05 | Tampering | Stage UUID hardcoded by caller bypasses workspace boundary | LOW | mitigate | stageId from input goes through CAS — domain rejects if stage doesn't belong to order's pipeline. |
</threat_model>

<must_haves>
truths:
  - "updateContact and archiveContact short-circuit with resource_not_found when target missing."
  - "createOrder supports idempotency-key dedup."
  - "moveOrderToStage propagates stage_changed_concurrently with actualStageId from domain data.currentStageId."
  - "updateOrder input schema does NOT contain `products` field (V1.1 deferred)."
  - "closeOrder wraps Plan 01's new domain function and returns OrderDetail with closedAt."
  - "8 of 15 tools (3 contacts + 5 orders) accessible via createCrmMutationTools(ctx)."
artifacts:
  - path: "src/lib/agents/shared/crm-mutation-tools/contacts.ts"
    provides: "3 contact mutation tools"
    exports: ["makeContactMutationTools"]
  - path: "src/lib/agents/shared/crm-mutation-tools/orders.ts"
    provides: "5 order mutation tools"
    exports: ["makeOrderMutationTools"]
  - path: "src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts"
    provides: "~20 unit tests covering all 5 order tools and CAS reject path"
    contains: "stage_changed_concurrently"
key_links:
  - from: "src/lib/agents/shared/crm-mutation-tools/orders.ts"
    to: "src/lib/domain/orders.ts"
    via: "imports closeOrder from domain (Plan 01 added)"
    pattern: "closeOrder"
  - from: "src/lib/agents/shared/crm-mutation-tools/orders.ts"
    to: "moveOrderToStage CAS contract"
    via: "propagates currentStageId verbatim from domain"
    pattern: "actualStageId.*currentStageId"
</must_haves>
</content>
</invoke>