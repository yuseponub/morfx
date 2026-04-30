/**
 * CRM Mutation Tools — Note Tools.
 *
 * Standalone crm-mutation-tools Wave 3 (Plan 04).
 *
 * Tools (4):
 *   - addContactNote (idempotency-eligible)
 *   - addOrderNote   (idempotency-eligible)
 *   - archiveContactNote (idempotent at domain — already-archived returns same archived_at)
 *   - archiveOrderNote   (idempotent at domain)
 *
 * BLOCKER invariants (verified via grep gates in Plan 04 acceptance criteria):
 *   - NO workspaceId in inputSchema (Pitfall 2 / D-pre-03 — workspace from ctx).
 *   - NO hard-delete imports (Pitfall 4 / D-pre-04 — soft-delete only via archived_at).
 *   - NO imports from @/lib/agents/crm-writer (Pitfall 10 — coexistence per D-01).
 *   - NO createAdminClient (Regla 3 / D-pre-02 — only domain layer mutates).
 *
 * Re-hydration (D-09, Pitfall 6 — CRITICAL):
 *   addContactNote/addOrderNote idempotency rehydrate callbacks call domain getters
 *   (getContactNoteById / getOrderNoteById) — they NEVER fabricate snapshots from
 *   the input body or from the idempotency cached result_payload alone. This
 *   guarantees that on idempotency replay the caller sees the freshest version
 *   of the note even if it was edited or archived between the original mutation
 *   and the retry.
 *
 * Adaptations to domain reality (recorded for downstream consumers):
 *   - Domain `createNote` (alias here `domainCreateContactNote`) accepts `content`
 *     (NOT `body`). The tool surface uses `body` (caller-friendly, consistent with
 *     `getContactNoteById` interface that maps DB column `content` → field `body`).
 *     Mapping happens in `execute` — input.body → domain.content.
 *   - Domain `createNote` and `createOrderNote` require `createdBy: string` (used
 *     for activity log preview). The tool injects `ctx.invoker ?? 'agent'` as the
 *     identifier — this surfaces in `contact_activity` rows so audits can trace
 *     mutations back to the calling agent. Symmetric with how crm-writer threads
 *     the agent's identity into createdBy.
 *   - Domain `archiveNote` (alias `domainArchiveContactNote`) and `archiveOrderNote`
 *     return `{ noteId, archivedAt }` directly — no separate getXxxNoteById call
 *     needed for the executed branch. Pre-check via getContactNoteById/getOrderNoteById
 *     is NOT done here per plan: domain returns "Nota no encontrada" / "Nota de
 *     pedido no encontrada" which mapDomainError converts to resource_not_found.
 *
 * Pitfall 6 enforcement:
 *   The withIdempotency `rehydrate` callback for both add* tools calls
 *   getContactNoteById / getOrderNoteById — never `{ noteId: id, body: input.body, ... }`.
 *   See Test 3 of notes.test.ts which proves the rehydrate returns DB body, not input.
 */

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
import { createModuleLogger } from '@/lib/audit/logger'
import type { DomainContext } from '@/lib/domain/types'
import type { CrmMutationToolsContext, MutationResult } from './types'
import {
  withIdempotency,
  emitInvoked,
  emitCompleted,
  emitFailed,
  idSuffix,
  bodyTruncate,
  mapDomainError,
} from './helpers'

const logger = createModuleLogger('crm-mutation-tools.notes')

/**
 * Minimal note projection returned by note tools. Tool callers typically only
 * need id + body confirmation + archive flag. If a future caller needs full
 * audit metadata (createdAt, contactId/orderId, etc.) we add a fuller projection
 * via a separate field in MutationResult — mismo patrón que ContactDetail.
 */
export interface NoteSnapshot {
  noteId: string
  body: string
  archivedAt: string | null
}

export function makeNoteMutationTools(ctx: CrmMutationToolsContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  // Activity log identity for createdBy. Falls back to 'agent' when invoker
  // is not provided (defensive — agents should always pass an invoker).
  const createdBy = ctx.invoker ?? 'agent'

  return {
    // ========================================================================
    // addContactNote (MUT-NT-01)
    // Idempotency-eligible. Pre-check contact existence → resource_not_found.
    // Body redacted to 200 chars in observability payload (PII).
    // Rehydrate via getContactNoteById per D-09 / Pitfall 6 — NEVER fabricate.
    // ========================================================================
    addContactNote: tool({
      description:
        'Crea una nota asociada a un contacto. Idempotency-key opcional: ' +
        'segundo call con misma key retorna { status: "duplicate", data: <nota fresh ' +
        're-hidratada> } sin crear de nuevo. El body se redacta a 200 chars en ' +
        'observability (PII).',
      inputSchema: z.object({
        contactId: z.string().uuid(),
        body: z.string().min(1).max(10_000),
        idempotencyKey: z.string().min(1).max(128).optional(),
      }),
      execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'addContactNote' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        // T-04-01 mitigation: body truncated to 200 chars in payload (PII).
        emitInvoked(base, {
          contactIdSuffix: idSuffix(input.contactId),
          body: bodyTruncate(input.body),
          hasIdempotencyKey: Boolean(input.idempotencyKey),
        })

        // Pre-check contact existence (Pattern 3 — RESEARCH).
        const contact = await getContactById(domainCtx, {
          contactId: input.contactId,
        })
        if (!contact.success || !contact.data) {
          emitFailed(base, {
            errorCode: 'resource_not_found',
            latencyMs: Date.now() - startedAt,
          })
          return {
            status: 'resource_not_found',
            error: {
              code: 'contact_not_found',
              missing: { resource: 'contact', id: input.contactId },
            },
          }
        }

        try {
          const result = await withIdempotency<NoteSnapshot>(
            domainCtx,
            ctx,
            'addContactNote',
            input.idempotencyKey,
            async () => {
              const created = await domainCreateContactNote(domainCtx, {
                contactId: input.contactId,
                content: input.body,
                createdBy,
              })
              if (!created.success || !created.data) {
                throw new Error(
                  created.success
                    ? 'addContactNote: no data'
                    : (created.error ?? 'unknown domain error'),
                )
              }
              const noteId = created.data.noteId
              // CRITICAL: rehydrate via getContactNoteById per D-09 / Pitfall 6.
              // NEVER fabricate snapshot from input.body — the DB row is the truth.
              const fetched = await getContactNoteById(domainCtx, { noteId })
              if (!fetched.success || !fetched.data) {
                throw new Error('addContactNote: created but rehydrate failed')
              }
              return {
                id: noteId,
                data: {
                  noteId: fetched.data.noteId,
                  body: fetched.data.body,
                  archivedAt: fetched.data.archivedAt,
                },
              }
            },
            // CRITICAL: rehydrate via getContactNoteById per D-09. NEVER
            // fabricate from input/id alone (Pitfall 6).
            async (id) => {
              const fetched = await getContactNoteById(domainCtx, { noteId: id })
              return fetched.success && fetched.data
                ? {
                    noteId: fetched.data.noteId,
                    body: fetched.data.body,
                    archivedAt: fetched.data.archivedAt,
                  }
                : null
            },
          )
          emitCompleted(base, {
            resultStatus: result.status,
            latencyMs: Date.now() - startedAt,
            resultId: result.data.noteId,
            idempotencyKeyHit: result.idempotencyKeyHit,
          })
          return result.status === 'duplicate'
            ? { status: 'duplicate', data: result.data }
            : { status: 'executed', data: result.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const mapped = mapDomainError(message)
          logger.warn(
            { err: message, tool: 'addContactNote', workspaceId: ctx.workspaceId },
            'addContactNote failed',
          )
          emitFailed(base, {
            errorCode: mapped,
            latencyMs: Date.now() - startedAt,
          })
          if (mapped === 'validation_error') {
            return {
              status: 'validation_error',
              error: { code: 'validation_error', message },
            }
          }
          return {
            status: 'error',
            error: { code: 'add_contact_note_failed', message },
          }
        }
      },
    }),

    // ========================================================================
    // addOrderNote (MUT-NT-02)
    // Idempotency-eligible. Pre-check order existence → resource_not_found.
    // Body redacted to 200 chars in observability payload (PII).
    // Rehydrate via getOrderNoteById per D-09 / Pitfall 6.
    // ========================================================================
    addOrderNote: tool({
      description:
        'Crea una nota asociada a un pedido. Idempotency-key opcional. El body ' +
        'se redacta a 200 chars en observability (PII).',
      inputSchema: z.object({
        orderId: z.string().uuid(),
        body: z.string().min(1).max(10_000),
        idempotencyKey: z.string().min(1).max(128).optional(),
      }),
      execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'addOrderNote' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, {
          orderIdSuffix: idSuffix(input.orderId),
          body: bodyTruncate(input.body),
          hasIdempotencyKey: Boolean(input.idempotencyKey),
        })

        const order = await getOrderById(domainCtx, { orderId: input.orderId })
        if (!order.success || !order.data) {
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
          const result = await withIdempotency<NoteSnapshot>(
            domainCtx,
            ctx,
            'addOrderNote',
            input.idempotencyKey,
            async () => {
              const created = await domainCreateOrderNote(domainCtx, {
                orderId: input.orderId,
                content: input.body,
                createdBy,
              })
              if (!created.success || !created.data) {
                throw new Error(
                  created.success
                    ? 'addOrderNote: no data'
                    : (created.error ?? 'unknown domain error'),
                )
              }
              const noteId = created.data.noteId
              const fetched = await getOrderNoteById(domainCtx, { noteId })
              if (!fetched.success || !fetched.data) {
                throw new Error('addOrderNote: created but rehydrate failed')
              }
              return {
                id: noteId,
                data: {
                  noteId: fetched.data.noteId,
                  body: fetched.data.body,
                  archivedAt: fetched.data.archivedAt,
                },
              }
            },
            // CRITICAL: rehydrate via getOrderNoteById per D-09 / Pitfall 6.
            async (id) => {
              const fetched = await getOrderNoteById(domainCtx, { noteId: id })
              return fetched.success && fetched.data
                ? {
                    noteId: fetched.data.noteId,
                    body: fetched.data.body,
                    archivedAt: fetched.data.archivedAt,
                  }
                : null
            },
          )
          emitCompleted(base, {
            resultStatus: result.status,
            latencyMs: Date.now() - startedAt,
            resultId: result.data.noteId,
            idempotencyKeyHit: result.idempotencyKeyHit,
          })
          return result.status === 'duplicate'
            ? { status: 'duplicate', data: result.data }
            : { status: 'executed', data: result.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const mapped = mapDomainError(message)
          logger.warn(
            { err: message, tool: 'addOrderNote', workspaceId: ctx.workspaceId },
            'addOrderNote failed',
          )
          emitFailed(base, {
            errorCode: mapped,
            latencyMs: Date.now() - startedAt,
          })
          if (mapped === 'validation_error') {
            return {
              status: 'validation_error',
              error: { code: 'validation_error', message },
            }
          }
          return {
            status: 'error',
            error: { code: 'add_order_note_failed', message },
          }
        }
      },
    }),

    // ========================================================================
    // archiveContactNote (MUT-NT-03)
    // Soft-delete via archived_at. Idempotent at domain.
    // No idempotency key needed (mismo input → mismo state).
    // Domain returns "Nota no encontrada" → resource_not_found note.
    // ========================================================================
    archiveContactNote: tool({
      description:
        'Soft-delete (set archived_at) de una nota de contacto. Idempotent — ' +
        'si ya estaba archivada retorna executed con el archived_at original. ' +
        'NUNCA hard-delete.',
      inputSchema: z.object({ noteId: z.string().uuid() }),
      execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'archiveContactNote' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, { noteIdSuffix: idSuffix(input.noteId) })

        try {
          const archived = await domainArchiveContactNote(domainCtx, {
            noteId: input.noteId,
          })
          if (!archived.success || !archived.data) {
            const message = archived.error ?? ''
            const mapped = mapDomainError(message)
            emitFailed(base, {
              errorCode: mapped,
              latencyMs: Date.now() - startedAt,
            })
            if (mapped === 'resource_not_found') {
              return {
                status: 'resource_not_found',
                error: {
                  code: 'note_not_found',
                  missing: { resource: 'note', id: input.noteId },
                },
              }
            }
            return {
              status: 'error',
              error: { code: 'archive_contact_note_failed', message },
            }
          }
          const snapshot: NoteSnapshot = {
            noteId: archived.data.noteId,
            // Domain archiveNote does not return body — fetch from getter to keep
            // snapshot shape consistent across all 4 note tools. Rehydrate is
            // best-effort: if the row is gone (concurrent delete) we surface ''.
            body: '',
            archivedAt: archived.data.archivedAt,
          }
          // Best-effort body rehydrate (D-09 spirit) — non-fatal.
          // Wrapped in try/catch so transient getter failures don't fail the archive.
          try {
            const fetched = await getContactNoteById(domainCtx, {
              noteId: input.noteId,
            })
            if (fetched && fetched.success && fetched.data) {
              snapshot.body = fetched.data.body
              snapshot.archivedAt =
                fetched.data.archivedAt ?? snapshot.archivedAt
            }
          } catch {
            // ignored — snapshot already has noteId + archivedAt from domain
          }
          emitCompleted(base, {
            resultStatus: 'executed',
            latencyMs: Date.now() - startedAt,
            resultId: snapshot.noteId,
          })
          return { status: 'executed', data: snapshot }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'archiveContactNote', workspaceId: ctx.workspaceId },
            'archiveContactNote failed',
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
    // archiveOrderNote (MUT-NT-04)
    // Soft-delete via archived_at. Idempotent at domain.
    // ========================================================================
    archiveOrderNote: tool({
      description:
        'Soft-delete (set archived_at) de una nota de pedido. Idempotent. ' +
        'NUNCA hard-delete.',
      inputSchema: z.object({ noteId: z.string().uuid() }),
      execute: async (input): Promise<MutationResult<NoteSnapshot>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'archiveOrderNote' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }
        emitInvoked(base, { noteIdSuffix: idSuffix(input.noteId) })

        try {
          const archived = await domainArchiveOrderNote(domainCtx, {
            noteId: input.noteId,
          })
          if (!archived.success || !archived.data) {
            const message = archived.error ?? ''
            const mapped = mapDomainError(message)
            emitFailed(base, {
              errorCode: mapped,
              latencyMs: Date.now() - startedAt,
            })
            if (mapped === 'resource_not_found') {
              return {
                status: 'resource_not_found',
                error: {
                  code: 'note_not_found',
                  missing: { resource: 'note', id: input.noteId },
                },
              }
            }
            return {
              status: 'error',
              error: { code: 'archive_order_note_failed', message },
            }
          }
          const snapshot: NoteSnapshot = {
            noteId: archived.data.noteId,
            body: '',
            archivedAt: archived.data.archivedAt,
          }
          // Best-effort body rehydrate (D-09 spirit) — non-fatal.
          try {
            const fetched = await getOrderNoteById(domainCtx, {
              noteId: input.noteId,
            })
            if (fetched && fetched.success && fetched.data) {
              snapshot.body = fetched.data.body
              snapshot.archivedAt =
                fetched.data.archivedAt ?? snapshot.archivedAt
            }
          } catch {
            // ignored — snapshot already has noteId + archivedAt from domain
          }
          emitCompleted(base, {
            resultStatus: 'executed',
            latencyMs: Date.now() - startedAt,
            resultId: snapshot.noteId,
          })
          return { status: 'executed', data: snapshot }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(
            { err: message, tool: 'archiveOrderNote', workspaceId: ctx.workspaceId },
            'archiveOrderNote failed',
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
