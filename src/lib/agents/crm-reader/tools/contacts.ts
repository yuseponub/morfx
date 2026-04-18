/**
 * CRM Reader — Contact Tools
 * Phase 44 Plan 04.
 *
 * BLOCKER 1 invariant (2026-04-18): this file MUST import ONLY from
 * '@/lib/domain/*' for data access. NO createAdminClient. NO @supabase/supabase-js.
 * Grep enforcement lives in Plan 04 Task 2 verify block.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  searchContacts,
  getContactById,
  type ContactListItem,
  type ContactDetail,
} from '@/lib/domain/contacts'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import type { ReaderContext, ToolLookupResult, ToolListResult } from '../types'

const logger = createModuleLogger('crm-reader.contacts')

export function makeContactReadTools(ctx: ReaderContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    contactsSearch: tool({
      description:
        'Busca contactos del workspace por telefono, email o parte del nombre. ' +
        'Retorna maximo 20 resultados por defecto. Campos devueltos: id, name, phone, email, createdAt.',
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe('Texto de busqueda: telefono completo o parcial, email, o parte del nombre'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ query, limit }): Promise<ToolListResult<ContactListItem>> => {
        const result = await searchContacts(domainCtx, { query, limit })
        if (!result.success) {
          logger.error(
            { error: result.error, workspaceId: ctx.workspaceId },
            'contactsSearch domain error',
          )
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        const items = result.data ?? []
        return { status: 'ok', count: items.length, items }
      },
    }),

    contactsGet: tool({
      description:
        'Obtiene un contacto por ID con tags y custom fields. ' +
        'Retorna {status:"not_found_in_workspace"} si no existe o esta en otro workspace.',
      inputSchema: z.object({
        contactId: z.string().uuid(),
      }),
      execute: async ({ contactId }): Promise<ToolLookupResult<ContactDetail>> => {
        const result = await getContactById(domainCtx, { contactId })
        if (!result.success) {
          logger.error(
            { error: result.error, workspaceId: ctx.workspaceId, contactId },
            'contactsGet domain error',
          )
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        if (!result.data) return { status: 'not_found_in_workspace' }
        return { status: 'found', data: result.data }
      },
    }),
  }
}
