/**
 * CRM Query Tools — Contact Tools.
 *
 * Standalone crm-query-tools Wave 2 (Plan 03).
 *
 * BLOCKER invariant (CRITICAL): this file MUST import ONLY from '@/lib/domain/*'
 * for data access. NO admin client. NO direct supabase-js import.
 * Verified via grep:
 *   grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/
 * Expected: zero matches in production code (this comment is the only allowed mention).
 *
 * D-04: factory pattern.
 * D-05: workspace from ctx, NEVER from input.
 * D-08: duplicates resolution — newest by createdAt + duplicates_count + duplicates: string[].
 * D-09: phone normalization via normalizePhone — invalid_phone if null.
 * D-10: not_found if no contact matches.
 * D-18: ContactDetail imported from domain (no fork).
 * D-19: no cache; every call hits domain.
 * D-20: tags + customFields always present (handled by getContactById).
 * D-23: emits pipeline_decision:crm_query_invoked/completed/failed.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  searchContacts,
  getContactById,
  type ContactDetail,
} from '@/lib/domain/contacts'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import { getCollector } from '@/lib/observability'
import { normalizePhone } from '@/lib/utils/phone'
import type {
  CrmQueryToolsContext,
  CrmQueryLookupResult,
  ContactWithDuplicates,
} from './types'

const logger = createModuleLogger('crm-query-tools.contacts')

function phoneSuffix(raw: string): string {
  return raw.replace(/\D/g, '').slice(-4)
}

export function makeContactQueryTools(ctx: CrmQueryToolsContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    getContactByPhone: tool({
      description:
        'Busca un contacto del workspace por numero de telefono. Acepta cualquier formato razonable ' +
        '(3001234567, +57 300 123 4567, etc) y normaliza a E.164 internamente. ' +
        'Retorna el contacto con tags y custom_fields. Si hay duplicados con el mismo telefono, ' +
        'retorna el mas reciente con duplicates_count y la lista duplicates.',
      inputSchema: z.object({
        phone: z.string().min(7).describe('Telefono del contacto en cualquier formato razonable.'),
      }),
      execute: async ({ phone }): Promise<CrmQueryLookupResult<ContactWithDuplicates>> => {
        const startedAt = Date.now()
        const collector = getCollector()
        const baseEvt = {
          tool: 'getContactByPhone' as const,
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
        }

        collector?.recordEvent('pipeline_decision', 'crm_query_invoked', {
          ...baseEvt,
          phoneSuffix: phoneSuffix(phone),
        })

        // 1. Phone normalization (D-09)
        const e164 = normalizePhone(phone)
        if (!e164) {
          collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
            ...baseEvt,
            errorCode: 'invalid_phone',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'error', error: { code: 'invalid_phone' } }
        }

        // 2. Search via domain (workspace-filtered)
        const search = await searchContacts(domainCtx, {
          query: e164.replace(/^\+/, ''), // strip + for ILIKE substring match (Pitfall 4)
          limit: 50,
        })
        if (!search.success) {
          logger.error(
            { error: search.error, workspaceId: ctx.workspaceId, phoneSuffix: phoneSuffix(phone) },
            'getContactByPhone: searchContacts failed',
          )
          collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
            ...baseEvt,
            errorCode: 'db_error',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'error', error: { code: 'db_error', message: search.error } }
        }

        // 3. Filter for exact phone match (search is ILIKE substring → narrow)
        const matches = (search.data ?? []).filter(
          (c) => normalizePhone(c.phone ?? '') === e164,
        )

        if (matches.length === 0) {
          collector?.recordEvent('pipeline_decision', 'crm_query_completed', {
            ...baseEvt,
            status: 'not_found',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'not_found' }
        }

        // 4. D-08: sort DESC by createdAt; primary = newest, duplicates = the rest
        matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const primary = matches[0]
        const duplicates = matches.slice(1).map((m) => m.id)

        // 5. Fetch full ContactDetail (tags + custom_fields + department)
        const detail = await getContactById(domainCtx, { contactId: primary.id })
        if (!detail.success || !detail.data) {
          logger.error(
            {
              error: detail.success ? 'no detail' : detail.error,
              contactId: primary.id,
              workspaceId: ctx.workspaceId,
            },
            'getContactByPhone: getContactById failed for primary',
          )
          collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
            ...baseEvt,
            errorCode: 'detail_fetch_failed',
            latencyMs: Date.now() - startedAt,
          })
          return {
            status: 'error',
            error: {
              code: 'db_error',
              message: detail.success
                ? 'contact disappeared between search and detail fetch'
                : detail.error,
            },
          }
        }

        // 6. Emit success + return
        collector?.recordEvent('pipeline_decision', 'crm_query_completed', {
          ...baseEvt,
          status: 'found',
          duplicatesCount: duplicates.length,
          latencyMs: Date.now() - startedAt,
        })

        const data: ContactWithDuplicates = {
          ...(detail.data as ContactDetail),
          duplicates_count: duplicates.length,
          duplicates,
        }
        return { status: 'found', data }
      },
    }),
  }
}
