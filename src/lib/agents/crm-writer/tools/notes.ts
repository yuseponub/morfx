/**
 * CRM Writer — Note Tools
 * Phase 44 Plan 05. Task 2.
 *
 * Four tools: createNote, updateNote, archiveNote, archiveOrderNote.
 *
 * Coverage note: updateNote/archiveNote/archiveOrderNote cannot precheck
 * note existence because Plan 03 did not add getNoteById / getOrderNoteById
 * helpers. Domain layer (updateNote / archiveNote / archiveOrderNote) returns
 * an error if the note is missing; confirmAction surfaces it as status='failed'
 * with the domain error in crm_bot_actions.error. Acceptable for V1; adding
 * getNoteById in a follow-up would let us return the cleaner resource_not_found
 * shape at propose-time. Same applies to task tools.
 *
 * createNote does precheck the contactId (getContactById) since contacts do
 * have an existence helper.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { proposeAction } from '../two-step'
import type { WriterContext, WriterPreview, ResourceNotFoundError } from '../types'
import type { DomainContext } from '@/lib/domain/types'
import { getContactById } from '@/lib/domain/contacts'

export function makeNoteWriteTools(ctx: WriterContext) {
  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'tool-handler' }

  return {
    createNote: tool({
      description:
        'PROPONE crear una nota sobre un contacto. NO ejecuta sin confirm. ' +
        'Si el contacto no existe, retorna resource_not_found.',
      inputSchema: z.object({
        contactId: z.string().uuid(),
        content: z.string().min(1),
        createdBy: z.string().min(1).describe('Nombre visible en el activity log (e.g. email del usuario o "bot")'),
      }),
      execute: async (input) => {
        const r = await getContactById(domainCtx, { contactId: input.contactId })
        if (!r.success) {
          return { status: 'error' as const, message: r.error ?? 'contact lookup failed' }
        }
        if (!r.data) {
          const err: ResourceNotFoundError = {
            status: 'resource_not_found',
            resource_type: 'contact',
            resource_id: input.contactId,
            suggested_action: 'propose create via crm-writer',
          }
          return err
        }

        const preview: WriterPreview = {
          action: 'create',
          entity: 'note',
          after: { contactId: input.contactId, content: input.content, createdBy: input.createdBy },
        }
        return proposeAction(ctx, { tool: 'createNote', input, preview })
      },
    }),

    updateNote: tool({
      description:
        'PROPONE actualizar el contenido de una nota de contacto. NO ejecuta sin confirm. ' +
        'Si la nota no existe, confirm retornará status="failed" (no hay precheck getNoteById en Plan 03).',
      inputSchema: z.object({
        noteId: z.string().uuid(),
        content: z.string().min(1),
      }),
      execute: async (input) => {
        // No existence precheck available — domain layer surfaces not_found at confirm.
        const preview: WriterPreview = {
          action: 'update',
          entity: 'note',
          after: { noteId: input.noteId, content: input.content },
        }
        return proposeAction(ctx, { tool: 'updateNote', input, preview })
      },
    }),

    archiveNote: tool({
      description:
        'PROPONE archivar (soft-delete) una nota de contacto. NO ejecuta sin confirm. ' +
        'Sin precheck de existencia (ver JSDoc); domain surfaces not_found at confirm.',
      inputSchema: z.object({ noteId: z.string().uuid() }),
      execute: async (input) => {
        const preview: WriterPreview = {
          action: 'archive',
          entity: 'note',
          after: { noteId: input.noteId, archived: true },
        }
        return proposeAction(ctx, { tool: 'archiveNote', input, preview })
      },
    }),

    archiveOrderNote: tool({
      description:
        'PROPONE archivar (soft-delete) una nota de pedido. NO ejecuta sin confirm. ' +
        'Sin precheck (no hay getOrderNoteById); domain surfaces not_found at confirm.',
      inputSchema: z.object({ noteId: z.string().uuid() }),
      execute: async (input) => {
        const preview: WriterPreview = {
          action: 'archive',
          entity: 'note',
          after: { noteId: input.noteId, archived: true, kind: 'order_note' },
        }
        return proposeAction(ctx, { tool: 'archiveOrderNote', input, preview })
      },
    }),
  }
}
