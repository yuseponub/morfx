/**
 * CRM Writer — Contact Tools
 * Phase 44 Plan 05. Task 2.
 *
 * Propose-only tools. Each tool.execute returns either:
 *   - ProposedAction (happy path)
 *   - ResourceNotFoundError (precheck failure via domain getByIds — Blocker 1)
 *   - { status: 'error', message } on unexpected lookup failures
 *
 * These handlers NEVER call domain write functions directly — only proposeAction.
 * These handlers NEVER import createAdminClient — existence checks go through
 * Plan 03 domain getByIds (Blocker 1 invariant).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { proposeAction } from '../two-step'
import type { WriterContext, WriterPreview, ResourceNotFoundError } from '../types'
import type { DomainContext } from '@/lib/domain/types'
import { getTagById } from '@/lib/domain/tags'
import { getContactById } from '@/lib/domain/contacts'

export function makeContactWriteTools(ctx: WriterContext) {
  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'tool-handler' }

  return {
    createContact: tool({
      description:
        'PROPONE crear un contacto. NO ejecuta — devuelve {status:"proposed", action_id, preview, expires_at}. ' +
        'Para ejecutar, el caller debe llamar confirmAction(action_id) en un segundo request. ' +
        'Si se pasa tagIds, cada tag debe existir en el workspace (writer NO crea tags).',
      inputSchema: z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        tagIds: z.array(z.string().uuid()).optional(),
      }),
      execute: async (input) => {
        // Existence check for tagIds using domain getByIds (Blocker 1).
        if (input.tagIds && input.tagIds.length > 0) {
          for (const tagId of input.tagIds) {
            const r = await getTagById(domainCtx, { tagId })
            if (!r.success) {
              return { status: 'error' as const, message: r.error ?? 'tag lookup failed' }
            }
            if (!r.data) {
              const err: ResourceNotFoundError = {
                status: 'resource_not_found',
                resource_type: 'tag',
                resource_id: tagId,
                suggested_action: 'create manually in UI',
              }
              return err
            }
          }
        }

        const preview: WriterPreview = { action: 'create', entity: 'contact', after: input }
        return proposeAction(ctx, { tool: 'createContact', input, preview })
      },
    }),

    updateContact: tool({
      description:
        'PROPONE actualizar campos de un contacto existente. NO ejecuta sin confirm. ' +
        'Si el contacto no existe, retorna resource_not_found con resource_type="contact".',
      inputSchema: z.object({
        contactId: z.string().uuid(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        department: z.string().optional(),
      }),
      execute: async (input) => {
        // Existence check via domain (Blocker 1).
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

        const before = {
          id: r.data.id,
          name: r.data.name,
          phone: r.data.phone,
          email: r.data.email,
          address: r.data.address,
          city: r.data.city,
        }
        const preview: WriterPreview = {
          action: 'update',
          entity: 'contact',
          before,
          after: { ...before, ...input },
        }
        return proposeAction(ctx, { tool: 'updateContact', input, preview })
      },
    }),

    archiveContact: tool({
      description:
        'PROPONE archivar (soft-delete) un contacto. NO ejecuta sin confirm. ' +
        'Si el contacto no existe, retorna resource_not_found.',
      inputSchema: z.object({ contactId: z.string().uuid() }),
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

        const before = { id: r.data.id, name: r.data.name, phone: r.data.phone, email: r.data.email }
        const preview: WriterPreview = {
          action: 'archive',
          entity: 'contact',
          before,
          after: { ...before, archived: true },
        }
        return proposeAction(ctx, { tool: 'archiveContact', input, preview })
      },
    }),
  }
}
