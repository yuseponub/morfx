/**
 * CRM Mutation Tools — Contact Tools.
 *
 * Standalone crm-mutation-tools Wave 1 (Plan 02).
 *
 * BLOCKER invariant (CRITICAL — Regla 3 / D-pre-02): this file MUST import
 * ONLY from '@/lib/domain/*' for data access. NO admin client. NO direct
 * supabase-js import.
 *
 * Verified via grep:
 *   grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-mutation-tools/
 * Expected: zero matches in production code (only doc-comments allowed to mention).
 *
 * Invariants for THIS file (and the broader module):
 *   - D-pre-04: NEVER call deleteContact (or any DELETE helper). Soft-delete only via
 *     archived_at — Plan 03 will add an archiveContact tool. Verifiable via grep gate.
 *   - D-pre-03: workspace ALWAYS from ctx.workspaceId — never input. Zod schema MUST
 *     NOT include a workspaceId field. Verifiable via grep gate.
 *
 * Domain signature reality (recorded for Plan 03/04 consumers):
 *   - createContact requires `name: string` (not optional). When the caller only
 *     provides phone or email, we synthesize `name = phone ?? email` to satisfy the
 *     domain contract. This matches existing UI flows where contacts are created
 *     from just a phone number.
 *   - createContact accepts tag NAMES (not UUIDs) in the `tags: string[]` param.
 *     Tool exposes `tags: string[]` (names) to keep symmetry with domain. UUID-only
 *     tag references are out of V1 scope (mismatch documented here for Plans 03/04).
 *   - createContact does NOT accept customFields on creation — only updateContact
 *     does. Tool input schema mirrors this constraint.
 *
 * Re-hydration (D-09): after createContact returns `{ contactId }`, we always
 * re-fetch via getContactById and return the full ContactDetail. Idempotency
 * `duplicate` path also re-hydrates fresh (Pitfall 6: NUNCA fabricar snapshot).
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  createContact as domainCreateContact,
  getContactById,
  type ContactDetail,
} from '@/lib/domain/contacts'
import { createModuleLogger } from '@/lib/audit/logger'
import type { DomainContext } from '@/lib/domain/types'
import type { CrmMutationToolsContext, MutationResult } from './types'
import {
  withIdempotency,
  emitInvoked,
  emitCompleted,
  emitFailed,
  phoneSuffix,
  emailRedact,
  mapDomainError,
} from './helpers'

const logger = createModuleLogger('crm-mutation-tools.contacts')

export function makeContactMutationTools(ctx: CrmMutationToolsContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    createContact: tool({
      description:
        'Crea un nuevo contacto en el workspace del agente. Requiere al menos uno de ' +
        'name/phone/email; cuando solo se da phone o email se usan como nombre por defecto. ' +
        'Idempotency-key opcional para evitar duplicados en reintentos: segundo call con misma ' +
        'key retorna { status: "duplicate", data: <contacto fresh re-hidratado> } sin crear de nuevo. ' +
        'Tags acepta nombres de tags existentes en el workspace (los inexistentes se ignoran).',
      inputSchema: z
        .object({
          name: z.string().min(1).optional(),
          phone: z.string().min(7).optional(),
          email: z.string().email().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          department: z.string().optional(),
          tags: z.array(z.string().min(1)).optional(),
          idempotencyKey: z.string().min(1).max(128).optional(),
        })
        .refine((i) => Boolean(i.name || i.phone || i.email), {
          message: 'Al menos uno de name/phone/email es requerido',
        }),
      execute: async (input): Promise<MutationResult<ContactDetail>> => {
        const startedAt = Date.now()
        const base = {
          tool: 'createContact' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }

        // D-23 / Pattern 5: PII-redacted invoked event.
        emitInvoked(base, {
          ...(input.phone ? { phoneSuffix: phoneSuffix(input.phone) } : {}),
          ...(input.email ? { email: emailRedact(input.email) } : {}),
          ...(input.name ? { hasName: true } : { hasName: false }),
          hasIdempotencyKey: Boolean(input.idempotencyKey),
        })

        try {
          // Domain createContact requires `name: string`. When the caller did not
          // provide one, fall back to phone or email as a synthetic name. The
          // refine() above guarantees one of the three is present.
          const synthesizedName =
            input.name ?? input.phone ?? input.email ?? ''

          const result = await withIdempotency<ContactDetail>(
            domainCtx,
            ctx,
            'createContact',
            input.idempotencyKey,
            async () => {
              const created = await domainCreateContact(domainCtx, {
                name: synthesizedName,
                phone: input.phone,
                email: input.email,
                address: input.address,
                city: input.city,
                department: input.department,
                tags: input.tags,
              })
              if (!created.success || !created.data) {
                if (created.success && !created.data) {
                  // Forensics: domain claims success but returned no data.
                  // Should never happen per domain contract; surface contract violation.
                  logger.error(
                    { tool: 'createContact', workspaceId: ctx.workspaceId },
                    'createContact: domain success=true but data is null',
                  )
                }
                throw new Error(
                  created.success
                    ? 'createContact returned no data'
                    : (created.error ?? 'unknown domain error'),
                )
              }
              const detail = await getContactById(domainCtx, {
                contactId: created.data.contactId,
              })
              if (!detail.success || !detail.data) {
                throw new Error(
                  detail.success
                    ? 'Contacto no encontrado tras crear'
                    : (detail.error ?? 'getContactById failed'),
                )
              }
              return { id: created.data.contactId, data: detail.data }
            },
            async (id) => {
              const detail = await getContactById(domainCtx, { contactId: id })
              return detail.success ? (detail.data ?? null) : null
            },
          )

          emitCompleted(base, {
            resultStatus: result.status,
            latencyMs: Date.now() - startedAt,
            resultId: result.data?.id,
            idempotencyKeyHit: result.idempotencyKeyHit,
          })

          // Narrow the return type: withIdempotency yields 'executed' | 'duplicate'
          // both of which carry data. Both map cleanly onto MutationResult<T>.
          return result.status === 'duplicate'
            ? { status: 'duplicate', data: result.data }
            : { status: 'executed', data: result.data }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const mapped = mapDomainError(message)

          logger.warn(
            { err: message, tool: 'createContact', workspaceId: ctx.workspaceId },
            'createContact failed',
          )
          emitFailed(base, {
            errorCode: mapped,
            latencyMs: Date.now() - startedAt,
          })

          if (mapped === 'resource_not_found') {
            return {
              status: 'resource_not_found',
              error: {
                code: 'contact_not_found',
                message,
                missing: { resource: 'contact', id: '' },
              },
            }
          }
          if (mapped === 'validation_error') {
            return {
              status: 'validation_error',
              error: { code: 'validation_error', message },
            }
          }
          // 'stage_changed_concurrently' is impossible for createContact (no stage),
          // but the type union covers it; fall through to generic error.
          return {
            status: 'error',
            error: { code: 'create_contact_failed', message },
          }
        }
      },
    }),
  }
}
