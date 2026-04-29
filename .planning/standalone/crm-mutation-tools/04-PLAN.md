---
plan: 04
wave: 3
phase: standalone-crm-mutation-tools
depends_on:
  - 01
  - 02
files_modified:
  - src/lib/agents/shared/crm-mutation-tools/notes.ts
  - src/lib/agents/shared/crm-mutation-tools/tasks.ts
  - src/lib/agents/shared/crm-mutation-tools/index.ts
  - src/lib/agents/shared/crm-mutation-tools/__tests__/notes.test.ts
  - src/lib/agents/shared/crm-mutation-tools/__tests__/tasks.test.ts
autonomous: true
requirements:
  - MUT-NT-01  # addContactNote
  - MUT-NT-02  # addOrderNote
  - MUT-NT-03  # archiveContactNote
  - MUT-NT-04  # archiveOrderNote
  - MUT-TK-01  # createTask
  - MUT-TK-02  # updateTask
  - MUT-TK-03  # completeTask
---

<objective>
Wave 3 — Notes + Tasks fan-out. Crea `notes.ts` (4 tools) y `tasks.ts` (3 tools) completando los 15/15 tools de la suite. Ejecutable en paralelo a Plan 03 (depends_on solo de 01 y 02; no de 03).

Purpose: cierra los 7 tools restantes — completes la suite total. `bodyTruncate` se usa para redaction de note body en observability. `createTask` valida exclusive arc (al menos uno de contactId/orderId/conversationId, según domain rule).

Output: 5 archivos. ~20 unit tests adicionales. Suite total 15/15 tools.
</objective>

<context>
@./CLAUDE.md
@.planning/standalone/crm-mutation-tools/CONTEXT.md
@.planning/standalone/crm-mutation-tools/RESEARCH.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 4.1: Create `notes.ts` with 4 tools</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:537-540 (domain function map for notes)
    - src/lib/domain/notes.ts:123 (createNote signature for contact notes — RESEARCH says domain name is `createNote`, tool exposes as `addContactNote`)
    - src/lib/domain/notes.ts:455 (createOrderNote signature)
    - src/lib/domain/notes.ts:606 (archiveNote signature — for contact notes)
    - src/lib/domain/notes.ts:674 (archiveOrderNote signature)
    - src/lib/domain/notes.ts (NEW: getContactNoteById, getOrderNoteById added by Plan 01 Task 1.5-bis — Plan 04 imports these for rehydrate per D-09)
  </read_first>
  <behavior>
    - addContactNote: pre-check contact exists (getContactById) → resource_not_found if missing. Idempotency-eligible. Body truncated in observability (`bodyTruncate(body, 200)`).
    - addOrderNote: pre-check order exists (getOrderById) → resource_not_found. Idempotency-eligible. Body truncated.
    - archiveContactNote: NO pre-check via separate getNoteById (research notes A11 — getNoteById may not exist). Strategy: rely on domain.archiveNote returning `'no encontrad'` error string when noteId missing → maps to `resource_not_found` via mapDomainError. Re-hydration: domain.archiveNote returns updated note row directly (idempotent).
    - archiveOrderNote: same pattern as archiveContactNote.
  </behavior>
  <action>
    Crear `src/lib/agents/shared/crm-mutation-tools/notes.ts`:

    ```typescript
    // BLOCKER invariants:
    //  - NO workspaceId in inputSchema (Pitfall 2).
    //  - NO hard delete (Pitfall 4 — archived_at only).
    //  - NO createAdminClient (Regla 3).
    //  - NO imports from @/lib/agents/crm-writer (Pitfall 10).
    import { tool } from 'ai'
    import { z } from 'zod'
    import {
      createNote as domainCreateContactNote,
      createOrderNote as domainCreateOrderNote,
      archiveNote as domainArchiveContactNote,
      archiveOrderNote as domainArchiveOrderNote,
      getContactNoteById,
      getOrderNoteById,
    } from '@/lib/domain/notes'
    import { getContactById } from '@/lib/domain/contacts'
    import { getOrderById } from '@/lib/domain/orders'
    import type { CrmMutationToolsContext, MutationResult } from './types'
    import {
      withIdempotency,
      emitInvoked, emitCompleted, emitFailed,
      idSuffix, bodyTruncate, mapDomainError,
    } from './helpers'

    // NoteDetail derivation: until/unless domain exports a NoteDetail interface,
    // use Awaited<ReturnType<...>>['data'] non-null where possible.
    // Tool surface keeps return shape minimal — caller agents typically only need ID + body confirmation.

    interface NoteSnapshot {
      noteId: string
      body: string
      archivedAt: string | null
    }

    export function makeNoteMutationTools(ctx: CrmMutationToolsContext) {
      const domainCtx = { workspaceId: ctx.workspaceId }

      return {
        addContactNote: tool({
          description: 'Crea una nota asociada a un contacto. Idempotency-key opcional. Body redactado en observability (200 chars max).',
          inputSchema: z.object({
            contactId: z.string().uuid(),
            body: z.string().min(1).max(10_000),
            idempotencyKey: z.string().min(1).max(128).optional(),
          }),
          execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
            const startedAt = Date.now()
            const base = { tool: 'addContactNote', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, {
              contactIdSuffix: idSuffix(input.contactId),
              body: bodyTruncate(input.body),
              hasIdempotencyKey: Boolean(input.idempotencyKey),
            })

            // Pre-check contact existence
            const contact = await getContactById(domainCtx, { contactId: input.contactId })
            if (!contact.success || !contact.data) {
              emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
              return { status: 'resource_not_found', error: { code: 'contact_not_found', missing: { resource: 'contact', id: input.contactId } } }
            }

            try {
              const result = await withIdempotency<NoteSnapshot>(
                domainCtx, ctx, 'addContactNote', input.idempotencyKey,
                async () => {
                  const created = await domainCreateContactNote(domainCtx, { contactId: input.contactId, body: input.body })
                  if (!created.success || !created.data) throw new Error(created.success ? 'no data' : created.error)
                  const noteId = (created.data as { noteId?: string; id?: string }).noteId ?? (created.data as { id: string }).id
                  // Rehydrate via domain getter (NOT input) — D-09, Pitfall 6.
                  const fetched = await getContactNoteById(domainCtx, { noteId })
                  if (!fetched.success || !fetched.data) throw new Error('addContactNote: created but rehydrate failed')
                  return { id: noteId, data: { noteId: fetched.data.noteId, body: fetched.data.body, archivedAt: fetched.data.archivedAt } }
                },
                // CRITICAL: rehydrate via getContactNoteById per D-09. NEVER fabricate from input (Pitfall 6).
                async (id) => {
                  const fetched = await getContactNoteById(domainCtx, { noteId: id })
                  return fetched.success && fetched.data
                    ? { noteId: fetched.data.noteId, body: fetched.data.body, archivedAt: fetched.data.archivedAt }
                    : null
                },
              )
              emitCompleted(base, { resultStatus: result.status, latencyMs: Date.now() - startedAt, resultId: result.data.noteId, idempotencyKeyHit: result.idempotencyKeyHit })
              return { status: result.status, data: result.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              const mapped = mapDomainError(message)
              emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
              if (mapped === 'validation_error') return { status: 'validation_error', error: { code: 'validation_error', message } }
              return { status: 'error', error: { code: 'add_contact_note_failed', message } }
            }
          },
        }),

        addOrderNote: tool({
          description: 'Crea una nota asociada a un pedido. Idempotency-key opcional.',
          inputSchema: z.object({
            orderId: z.string().uuid(),
            body: z.string().min(1).max(10_000),
            idempotencyKey: z.string().min(1).max(128).optional(),
          }),
          execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
            const startedAt = Date.now()
            const base = { tool: 'addOrderNote', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, {
              orderIdSuffix: idSuffix(input.orderId),
              body: bodyTruncate(input.body),
              hasIdempotencyKey: Boolean(input.idempotencyKey),
            })

            const order = await getOrderById(domainCtx, { orderId: input.orderId })
            if (!order.success || !order.data) {
              emitFailed(base, { errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
              return { status: 'resource_not_found', error: { code: 'order_not_found', missing: { resource: 'order', id: input.orderId } } }
            }

            try {
              const result = await withIdempotency<NoteSnapshot>(
                domainCtx, ctx, 'addOrderNote', input.idempotencyKey,
                async () => {
                  const created = await domainCreateOrderNote(domainCtx, { orderId: input.orderId, body: input.body })
                  if (!created.success || !created.data) throw new Error(created.success ? 'no data' : created.error)
                  const noteId = (created.data as { noteId?: string; id?: string }).noteId ?? (created.data as { id: string }).id
                  // Rehydrate via domain getter (NOT input) — D-09, Pitfall 6.
                  const fetched = await getOrderNoteById(domainCtx, { noteId })
                  if (!fetched.success || !fetched.data) throw new Error('addOrderNote: created but rehydrate failed')
                  return { id: noteId, data: { noteId: fetched.data.noteId, body: fetched.data.body, archivedAt: fetched.data.archivedAt } }
                },
                // CRITICAL: rehydrate via getOrderNoteById per D-09. NEVER fabricate from input (Pitfall 6).
                async (id) => {
                  const fetched = await getOrderNoteById(domainCtx, { noteId: id })
                  return fetched.success && fetched.data
                    ? { noteId: fetched.data.noteId, body: fetched.data.body, archivedAt: fetched.data.archivedAt }
                    : null
                },
              )
              emitCompleted(base, { resultStatus: result.status, latencyMs: Date.now() - startedAt, resultId: result.data.noteId, idempotencyKeyHit: result.idempotencyKeyHit })
              return { status: result.status, data: result.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              const mapped = mapDomainError(message)
              emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
              if (mapped === 'validation_error') return { status: 'validation_error', error: { code: 'validation_error', message } }
              return { status: 'error', error: { code: 'add_order_note_failed', message } }
            }
          },
        }),

        archiveContactNote: tool({
          description: 'Soft-delete (archived_at) de una nota de contacto. Idempotent.',
          inputSchema: z.object({ noteId: z.string().uuid() }),
          execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
            const startedAt = Date.now()
            const base = { tool: 'archiveContactNote', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { noteIdSuffix: idSuffix(input.noteId) })
            try {
              const archived = await domainArchiveContactNote(domainCtx, { noteId: input.noteId })
              if (!archived.success) {
                const mapped = mapDomainError(archived.error ?? '')
                emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
                if (mapped === 'resource_not_found') {
                  return { status: 'resource_not_found', error: { code: 'note_not_found', missing: { resource: 'note', id: input.noteId } } }
                }
                return { status: 'error', error: { code: 'archive_contact_note_failed', message: archived.error } }
              }
              const data = archived.data as { noteId?: string; id?: string; body?: string; archived_at?: string | null }
              const snapshot: NoteSnapshot = {
                noteId: data?.noteId ?? data?.id ?? input.noteId,
                body: data?.body ?? '',
                archivedAt: data?.archived_at ?? new Date().toISOString(),
              }
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: snapshot.noteId })
              return { status: 'executed', data: snapshot }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
              return { status: 'error', error: { code: 'unhandled', message } }
            }
          },
        }),

        archiveOrderNote: tool({
          description: 'Soft-delete (archived_at) de una nota de pedido. Idempotent.',
          inputSchema: z.object({ noteId: z.string().uuid() }),
          execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
            const startedAt = Date.now()
            const base = { tool: 'archiveOrderNote', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { noteIdSuffix: idSuffix(input.noteId) })
            try {
              const archived = await domainArchiveOrderNote(domainCtx, { noteId: input.noteId })
              if (!archived.success) {
                const mapped = mapDomainError(archived.error ?? '')
                emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
                if (mapped === 'resource_not_found') {
                  return { status: 'resource_not_found', error: { code: 'note_not_found', missing: { resource: 'note', id: input.noteId } } }
                }
                return { status: 'error', error: { code: 'archive_order_note_failed', message: archived.error } }
              }
              const data = archived.data as { noteId?: string; id?: string; body?: string; archived_at?: string | null }
              const snapshot: NoteSnapshot = {
                noteId: data?.noteId ?? data?.id ?? input.noteId,
                body: data?.body ?? '',
                archivedAt: data?.archived_at ?? new Date().toISOString(),
              }
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: snapshot.noteId })
              return { status: 'executed', data: snapshot }
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

    Crear `__tests__/notes.test.ts` con ~10 tests: each tool happy + resource_not_found + observability redaction (body truncated to 200 chars in inputRedacted).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/notes.test.ts 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - 4 tools in notes.ts.
    - `grep -c "bodyTruncate" src/lib/agents/shared/crm-mutation-tools/notes.ts` ≥ 2 (used in addContactNote + addOrderNote observability).
    - `grep -E "deleteNote|deleteOrderNote\b" src/lib/agents/shared/crm-mutation-tools/notes.ts` returns 0.
    - `grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/notes.ts | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | wc -l` == 0.
    - `grep -E "workspaceId.*z\\.string|workspaceId.*\\.uuid" src/lib/agents/shared/crm-mutation-tools/notes.ts` returns 0.
    - **Rehydrate via domain getter (D-09, Pitfall 6):** `grep -c "getContactNoteById" src/lib/agents/shared/crm-mutation-tools/notes.ts` ≥ 1 (addContactNote `withIdempotency` rehydrate callback).
    - **Same for order notes:** `grep -c "getOrderNoteById" src/lib/agents/shared/crm-mutation-tools/notes.ts` ≥ 1 (addOrderNote rehydrate).
    - **No fabricated snapshots in rehydrate:** every `async (id) =>` arrow inside a `withIdempotency` call in `notes.ts` must contain `getContactNoteById` or `getOrderNoteById` (verifiable by reading the diff — both `addContactNote` and `addOrderNote` call domain getters in their rehydrate callback, not literal `{ noteId: id, body: input.body, ...}`).
    - Vitest reports ≥ 10 passing tests.
  </acceptance_criteria>
  <done>4/4 note tools complete.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4.2: Create `tasks.ts` with 3 tools (validate exclusive arc)</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:541-543 (tasks domain map)
    - src/lib/domain/tasks.ts:86 (createTask — validates exclusive arc contactId/orderId/conversationId)
    - src/lib/domain/tasks.ts:170 (updateTask)
    - src/lib/domain/tasks.ts:281 (completeTask — idempotent)
    - src/lib/domain/tasks.ts (NEW: getTaskById added by Plan 01 Task 1.5-bis — Plan 04 imports it for createTask rehydrate per D-09)
  </read_first>
  <behavior>
    - createTask: idempotency-eligible. Validates that AT MOST one of contactId/orderId/conversationId is provided (zod refine — surface validation_error before domain call when both are set).
    - updateTask: pre-check via getTaskById (research A11 says this may not exist; if not, rely on domain to return "no encontrado").
    - completeTask: idempotent at domain (no-op if already completed). Returns updated task with completed_at populated.
  </behavior>
  <action>
    Crear `src/lib/agents/shared/crm-mutation-tools/tasks.ts`:

    ```typescript
    // BLOCKER invariants: same as notes.ts (Regla 3 + Pitfalls 2,4,10).
    import { tool } from 'ai'
    import { z } from 'zod'
    import {
      createTask as domainCreateTask,
      updateTask as domainUpdateTask,
      completeTask as domainCompleteTask,
      getTaskById,
    } from '@/lib/domain/tasks'
    import type { CrmMutationToolsContext, MutationResult } from './types'
    import {
      withIdempotency,
      emitInvoked, emitCompleted, emitFailed,
      idSuffix, mapDomainError,
    } from './helpers'

    interface TaskSnapshot {
      taskId: string
      title: string
      status: string
      completedAt: string | null
      contactId: string | null
      orderId: string | null
      conversationId: string | null
      assignedTo: string | null
      dueAt: string | null
    }

    function snapshotFrom(raw: unknown, fallbackId: string): TaskSnapshot {
      const r = (raw ?? {}) as Record<string, unknown>
      return {
        taskId: (r.taskId as string) ?? (r.id as string) ?? fallbackId,
        title: (r.title as string) ?? '',
        status: (r.status as string) ?? '',
        completedAt: (r.completed_at as string | null) ?? (r.completedAt as string | null) ?? null,
        contactId: (r.contact_id as string | null) ?? (r.contactId as string | null) ?? null,
        orderId: (r.order_id as string | null) ?? (r.orderId as string | null) ?? null,
        conversationId: (r.conversation_id as string | null) ?? (r.conversationId as string | null) ?? null,
        assignedTo: (r.assigned_to as string | null) ?? (r.assignedTo as string | null) ?? null,
        dueAt: (r.due_at as string | null) ?? (r.dueAt as string | null) ?? null,
      }
    }

    export function makeTaskMutationTools(ctx: CrmMutationToolsContext) {
      const domainCtx = { workspaceId: ctx.workspaceId }

      return {
        createTask: tool({
          description: 'Crea una task. Al menos uno de contactId/orderId/conversationId, AT MOST one (exclusive arc — domain rule). Idempotency-key opcional.',
          inputSchema: z.object({
            title: z.string().min(1),
            description: z.string().optional(),
            contactId: z.string().uuid().optional(),
            orderId: z.string().uuid().optional(),
            conversationId: z.string().uuid().optional(),
            assignedTo: z.string().uuid().optional(),
            dueAt: z.string().optional(),
            idempotencyKey: z.string().min(1).max(128).optional(),
          }).refine(
            (i) => {
              const arcCount = [i.contactId, i.orderId, i.conversationId].filter(Boolean).length
              return arcCount <= 1
            },
            { message: 'createTask: at most one of contactId/orderId/conversationId may be provided', path: ['contactId'] },
          ),
          execute: async (input): Promise<MutationResult<TaskSnapshot>> => {
            const startedAt = Date.now()
            const base = { tool: 'createTask', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, {
              hasContactId: Boolean(input.contactId),
              hasOrderId: Boolean(input.orderId),
              hasConversationId: Boolean(input.conversationId),
              hasIdempotencyKey: Boolean(input.idempotencyKey),
            })

            try {
              const result = await withIdempotency<TaskSnapshot>(
                domainCtx, ctx, 'createTask', input.idempotencyKey,
                async () => {
                  const created = await domainCreateTask(domainCtx, {
                    title: input.title,
                    description: input.description ?? null,
                    contactId: input.contactId ?? null,
                    orderId: input.orderId ?? null,
                    conversationId: input.conversationId ?? null,
                    assignedTo: input.assignedTo ?? null,
                    dueAt: input.dueAt ?? null,
                  })
                  if (!created.success || !created.data) throw new Error(created.success ? 'no data' : created.error)
                  const taskId = (created.data as { taskId?: string; id?: string }).taskId ?? (created.data as { id: string }).id
                  // Rehydrate via domain getter (NOT input snapshot) — D-09, Pitfall 6.
                  const fetched = await getTaskById(domainCtx, { taskId })
                  return { id: taskId, data: fetched.success && fetched.data ? snapshotFrom(fetched.data, taskId) : snapshotFrom(created.data, taskId) }
                },
                // CRITICAL: rehydrate via getTaskById per D-09. NEVER fabricate from input/id alone (Pitfall 6).
                async (id) => {
                  const fetched = await getTaskById(domainCtx, { taskId: id })
                  return fetched.success && fetched.data ? snapshotFrom(fetched.data, id) : null
                },
              )
              emitCompleted(base, { resultStatus: result.status, latencyMs: Date.now() - startedAt, resultId: result.data.taskId, idempotencyKeyHit: result.idempotencyKeyHit })
              return { status: result.status, data: result.data }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              const mapped = mapDomainError(message)
              emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
              if (mapped === 'resource_not_found') {
                let resource: 'contact' | 'order' | 'user' = 'contact'
                if (/order|pedido/i.test(message)) resource = 'order'
                else if (/usuario|user/i.test(message)) resource = 'user'
                return { status: 'resource_not_found', error: { code: `${resource}_not_found`, message, missing: { resource, id: '' } } }
              }
              if (mapped === 'validation_error') return { status: 'validation_error', error: { code: 'validation_error', message } }
              return { status: 'error', error: { code: 'create_task_failed', message } }
            }
          },
        }),

        updateTask: tool({
          description: 'Actualiza campos de una task existente. Para marcar como completada, usar completeTask.',
          inputSchema: z.object({
            taskId: z.string().uuid(),
            title: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            assignedTo: z.string().uuid().nullable().optional(),
            dueAt: z.string().nullable().optional(),
            status: z.string().optional(),
          }),
          execute: async (input): Promise<MutationResult<TaskSnapshot>> => {
            const startedAt = Date.now()
            const base = { tool: 'updateTask', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { taskIdSuffix: idSuffix(input.taskId) })
            try {
              const updated = await domainUpdateTask(domainCtx, {
                taskId: input.taskId,
                title: input.title,
                description: input.description,
                assignedTo: input.assignedTo,
                dueAt: input.dueAt,
                status: input.status,
              })
              if (!updated.success) {
                const mapped = mapDomainError(updated.error ?? '')
                emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
                if (mapped === 'resource_not_found') {
                  return { status: 'resource_not_found', error: { code: 'task_not_found', missing: { resource: 'task', id: input.taskId } } }
                }
                if (mapped === 'validation_error') return { status: 'validation_error', error: { code: 'validation_error', message: updated.error ?? '' } }
                return { status: 'error', error: { code: 'update_task_failed', message: updated.error } }
              }
              const snapshot = snapshotFrom(updated.data, input.taskId)
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.taskId })
              return { status: 'executed', data: snapshot }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              emitFailed(base, { errorCode: 'unhandled', latencyMs: Date.now() - startedAt })
              return { status: 'error', error: { code: 'unhandled', message } }
            }
          },
        }),

        completeTask: tool({
          description: 'Marca una task como completada (set completed_at). Idempotent — si ya estaba completada, retorna executed con timestamp original.',
          inputSchema: z.object({ taskId: z.string().uuid() }),
          execute: async (input): Promise<MutationResult<TaskSnapshot>> => {
            const startedAt = Date.now()
            const base = { tool: 'completeTask', workspaceId: ctx.workspaceId, invoker: ctx.invoker }
            emitInvoked(base, { taskIdSuffix: idSuffix(input.taskId) })
            try {
              const completed = await domainCompleteTask(domainCtx, { taskId: input.taskId })
              if (!completed.success) {
                const mapped = mapDomainError(completed.error ?? '')
                emitFailed(base, { errorCode: mapped, latencyMs: Date.now() - startedAt })
                if (mapped === 'resource_not_found') {
                  return { status: 'resource_not_found', error: { code: 'task_not_found', missing: { resource: 'task', id: input.taskId } } }
                }
                return { status: 'error', error: { code: 'complete_task_failed', message: completed.error } }
              }
              const snapshot = snapshotFrom(completed.data, input.taskId)
              emitCompleted(base, { resultStatus: 'executed', latencyMs: Date.now() - startedAt, resultId: input.taskId })
              return { status: 'executed', data: snapshot }
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

    Crear `__tests__/tasks.test.ts` ~9 tests:
    - createTask: happy + idempotency-hit + exclusive-arc-violation (zod refine fails) + resource_not_found (assignee/contact missing)
    - updateTask: happy + resource_not_found + validation_error
    - completeTask: happy + resource_not_found
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/tasks.test.ts 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - 3 tools in tasks.ts: createTask, updateTask, completeTask.
    - `grep "deleteTask\b" src/lib/agents/shared/crm-mutation-tools/tasks.ts` returns 0.
    - `grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/tasks.ts | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | wc -l` == 0.
    - `grep -c "arcCount <= 1" src/lib/agents/shared/crm-mutation-tools/tasks.ts` ≥ 1 (exclusive arc validation).
    - **Rehydrate via domain getter (D-09, Pitfall 6):** `grep -c "getTaskById" src/lib/agents/shared/crm-mutation-tools/tasks.ts` ≥ 1 (createTask `withIdempotency` rehydrate callback uses getTaskById, not fabricated `snapshotFrom({ id }, id)`).
    - Vitest reports ≥ 9 passing tests.
  </acceptance_criteria>
  <done>3/3 task tools complete.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.3: Wire `index.ts` to spread notes + tasks (15/15 final)</name>
  <read_first>
    - src/lib/agents/shared/crm-mutation-tools/index.ts (current — Plans 02 + 03 added contacts + orders)
  </read_first>
  <action>
    Final shape:

    ```typescript
    import { makeContactMutationTools } from './contacts'
    import { makeOrderMutationTools } from './orders'
    import { makeNoteMutationTools } from './notes'
    import { makeTaskMutationTools } from './tasks'
    import type { CrmMutationToolsContext } from './types'

    /**
     * Factory aggregator for the 15 mutation tools (closed list per CONTEXT D-02):
     *   contacts(3): createContact, updateContact, archiveContact
     *   orders(5):   createOrder, updateOrder, moveOrderToStage, archiveOrder, closeOrder
     *   notes(4):    addContactNote, addOrderNote, archiveContactNote, archiveOrderNote
     *   tasks(3):    createTask, updateTask, completeTask
     *
     * Usage in agent (when registered):
     *   const tools = createCrmMutationTools({ workspaceId, invoker: 'my-agent-v1' })
     *   await generateText({ ..., tools: { ...tools, ...otherTools } })
     */
    export function createCrmMutationTools(ctx: CrmMutationToolsContext) {
      return {
        ...makeContactMutationTools(ctx),
        ...makeOrderMutationTools(ctx),
        ...makeNoteMutationTools(ctx),
        ...makeTaskMutationTools(ctx),
      }
    }

    export type { CrmMutationToolsContext, MutationResult, ResourceType } from './types'
    ```

    Smoke test inline (add to one of the existing test files OR a new `__tests__/index.test.ts`): `expect(Object.keys(createCrmMutationTools({ workspaceId: 'ws' }))).toHaveLength(15)`. Optionally enumerate the 15 names in the assertion.
  </action>
  <verify>
    <automated>node -e "const m = require('./src/lib/agents/shared/crm-mutation-tools/index.ts'); console.log(typeof m.createCrmMutationTools)" 2>&1 | head -3 || npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__ 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `Object.keys(createCrmMutationTools({ workspaceId: 'x' })).length === 15`.
    - All 4 `make*MutationTools` factories spread.
    - `npx tsc --noEmit -p .` zero errors in module.
  </acceptance_criteria>
  <done>15/15 tools accessible via factory.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4.4: Commit + push (Regla 1)</name>
  <action>
    ```
    git add src/lib/agents/shared/crm-mutation-tools/
    git commit -m "$(cat <<'EOF'
    feat(crm-mutation-tools): wave 3 — notes + tasks fan-out (15/15 complete)

    - notes.ts NUEVO: addContactNote + addOrderNote (idempotency-eligible, body truncado en observability) + archiveContactNote + archiveOrderNote (idempotent).
    - tasks.ts NUEVO: createTask (idempotency + exclusive arc contactId/orderId/conversationId vía zod refine) + updateTask + completeTask (idempotent).
    - index.ts: spread completo de los 4 factories — 15/15 tools accesibles vía createCrmMutationTools(ctx).
    - Tests notes.test.ts (~10) + tasks.test.ts (~9) cubriendo happy/resource_not_found/idempotency/validation paths.

    Standalone: crm-mutation-tools Plan 04 (Wave 3).
    Refs MUT-NT-01..04, MUT-TK-01..03.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "wave 3"</automated>
  </verify>
  <acceptance_criteria>
    - Commit pushed; tree clean.
  </acceptance_criteria>
  <done>Wave 3 cierra. 15/15 tools shipped. Plan 05 (test infra) unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tool execute() → Note/Task body | bodyTruncate redacts in observability (200 chars max) |
| Tool execute() → Domain task createTask | Exclusive arc validated client-side (zod) BEFORE domain call to surface error early |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-04-01 | Information Disclosure | Note body in observability events | MED | mitigate | bodyTruncate(s, 200) applied to inputRedacted in addContactNote + addOrderNote. |
| T-04-02 | Tampering | createTask with multiple parent links violates domain invariant | LOW | mitigate | zod refine surfaces validation_error before domain call (defense-in-depth — domain also validates). |
| T-04-03 | Repudiation | archiveContactNote/archiveOrderNote without observability | LOW | mitigate | All 4 tools emit invoked + completed/failed events. |
| T-04-04 | Tampering | hard-deletion of notes/tasks bypasses audit | LOW | mitigate | Pitfall 4 — grep gate ensures no `deleteNote`/`deleteTask` imports. |
</threat_model>

<must_haves>
truths:
  - "All 4 note tools (addContactNote, addOrderNote, archiveContactNote, archiveOrderNote) operational."
  - "All 3 task tools (createTask, updateTask, completeTask) operational."
  - "createCrmMutationTools(ctx) returns object with exactly 15 tool keys."
  - "Note body truncated to 200 chars in observability payload (PII redaction)."
  - "createTask validates exclusive arc (≤1 of contactId/orderId/conversationId) via zod refine."
artifacts:
  - path: "src/lib/agents/shared/crm-mutation-tools/notes.ts"
    provides: "4 note mutation tools"
    exports: ["makeNoteMutationTools"]
  - path: "src/lib/agents/shared/crm-mutation-tools/tasks.ts"
    provides: "3 task mutation tools"
    exports: ["makeTaskMutationTools"]
  - path: "src/lib/agents/shared/crm-mutation-tools/index.ts"
    provides: "createCrmMutationTools(ctx) returning 15 tools total"
    exports: ["createCrmMutationTools"]
key_links:
  - from: "src/lib/agents/shared/crm-mutation-tools/index.ts"
    to: "all 4 entity files"
    via: "spread of make<Entity>MutationTools(ctx)"
    pattern: "...makeContact|...makeOrder|...makeNote|...makeTask"
</must_haves>
</content>
</invoke>