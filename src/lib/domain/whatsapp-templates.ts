// ============================================================================
// Domain Layer — WhatsApp Templates
// Single source of truth for mutations on `whatsapp_templates` (Regla 3).
//
// Orchestration for createTemplate:
//   1. createAdminClient() (bypasses RLS)
//   2. Uniqueness check by (workspace_id, name)
//   3. If params.headerImage is present:
//       3a. Download bytes from Supabase Storage bucket `whatsapp-media`
//       3b. Upload to 360 Dialog resumable API via uploadHeaderImage360()
//       3c. Patch the HEADER component with example.header_handle = [handle]
//   4. INSERT row with status='PENDING'
//   5. Call createTemplate360()
//   6. On success -> UPDATE submitted_at
//   7. On 360 error (post-insert) -> UPDATE status='REJECTED' + rejected_reason
//      (row preserved for diagnostic — D-16, D-17)
//
// Callers:
//   - src/app/actions/templates.ts  (server-action path)
//   - src/lib/config-builder/templates/tools.ts  (AI tool path — Plan 03+)
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createTemplate360,
  uploadHeaderImage360,
} from '@/lib/whatsapp/templates-api'
import type { DomainContext, DomainResult } from './types'
import type {
  Template,
  TemplateCategory,
  TemplateComponent,
} from '@/lib/whatsapp/types'

// ============================================================================
// Param Types
// ============================================================================

export interface CreateTemplateParams {
  name: string
  language: string
  category: TemplateCategory
  components: TemplateComponent[]
  variableMapping: Record<string, string>
  /**
   * Optional — when present, the HEADER component (which must exist with
   * format='IMAGE') will be populated with a permanent handle obtained from
   * 360 Dialog's resumable upload API before submission to Meta.
   */
  headerImage?: {
    storagePath: string
    mimeType: 'image/jpeg' | 'image/png'
  }
  apiKey: string
}

// ============================================================================
// createTemplate
// ============================================================================

/**
 * Create a WhatsApp template in the workspace and submit it to 360 Dialog
 * (and therefore Meta). Handles both TEXT-only and IMAGE-header templates.
 *
 * Returns DomainResult<Template>:
 *   - { success: true, data: Template } on successful submission (status
 *     remains 'PENDING' locally; Meta will later flip it to APPROVED/REJECTED
 *     via the sync path)
 *   - { success: false, error } on uniqueness conflict, validation error,
 *     storage/upload failure, or 360 Dialog rejection
 */
export async function createTemplate(
  ctx: DomainContext,
  params: CreateTemplateParams
): Promise<DomainResult<Template>> {
  const supabase = createAdminClient()

  // Step 1: Uniqueness check (workspace_id + name)
  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('name', params.name)
    .maybeSingle()

  if (existing) {
    return {
      success: false,
      error: `Ya existe un template con nombre "${params.name}"`,
    }
  }

  // Step 2: Upload image to 360 Dialog and patch HEADER component (if IMAGE)
  let components = params.components
  if (params.headerImage) {
    const headerIdx = components.findIndex((c) => c.type === 'HEADER')
    if (headerIdx === -1 || components[headerIdx].format !== 'IMAGE') {
      return {
        success: false,
        error:
          'HEADER IMAGE requiere archivo pero no se encontro componente HEADER con format=IMAGE',
      }
    }

    // Step 2a: Download bytes from Supabase Storage
    const { data: blob, error: dlErr } = await supabase.storage
      .from('whatsapp-media')
      .download(params.headerImage.storagePath)

    if (dlErr || !blob) {
      return {
        success: false,
        error: `No se pudo descargar imagen: ${dlErr?.message || 'unknown'}`,
      }
    }

    // Step 2b: Upload to 360 Dialog resumable API
    let handle: string
    try {
      const bytes = await blob.arrayBuffer()
      const result = await uploadHeaderImage360(
        params.apiKey,
        bytes,
        params.headerImage.mimeType,
        params.headerImage.storagePath.split('/').pop() || 'header.jpg'
      )
      handle = result.handle
    } catch (err) {
      return {
        success: false,
        error: `Error subiendo imagen a 360 Dialog: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }
    }

    // Step 2c: Patch the HEADER component with the handle
    components = components.map((c, i) =>
      i === headerIdx
        ? {
            ...c,
            example: {
              ...(c.example || {}),
              header_handle: [handle],
            },
          }
        : c
    )
  }

  // Step 3: Insert local row (PENDING)
  const { data: inserted, error: insErr } = await supabase
    .from('whatsapp_templates')
    .insert({
      workspace_id: ctx.workspaceId,
      name: params.name,
      language: params.language,
      category: params.category,
      status: 'PENDING',
      components,
      variable_mapping: params.variableMapping,
    })
    .select()
    .single()

  if (insErr || !inserted) {
    if (insErr?.code === '23505') {
      return {
        success: false,
        error: `Ya existe un template con nombre "${params.name}"`,
      }
    }
    return {
      success: false,
      error: `Error al insertar template: ${insErr?.message || 'unknown'}`,
    }
  }

  // Step 4: Submit to 360 Dialog
  try {
    await createTemplate360(params.apiKey, {
      name: params.name,
      language: params.language,
      category: params.category,
      components,
    })

    // Step 5: Mark submitted_at
    await supabase
      .from('whatsapp_templates')
      .update({ submitted_at: new Date().toISOString() })
      .eq('id', inserted.id)
      .eq('workspace_id', ctx.workspaceId)

    return { success: true, data: inserted as Template }
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : 'Error desconocido'

    // Step 6: Mark rejected + store reason (audit trail preserved)
    await supabase
      .from('whatsapp_templates')
      .update({ status: 'REJECTED', rejected_reason: msg })
      .eq('id', inserted.id)
      .eq('workspace_id', ctx.workspaceId)

    return {
      success: false,
      error: `360 Dialog rechazo el template: ${msg}`,
    }
  }
}
