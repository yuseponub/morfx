'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getRequestAuth } from '@/lib/auth/request-auth'
import type {
  Template,
  TemplateComponent,
  TemplateCategory,
  ActionResult,
} from '@/lib/whatsapp/types'
import {
  listTemplates360,
  deleteTemplate360,
} from '@/lib/whatsapp/templates-api'
import {
  listTemplatesMeta,
  deleteTemplateMeta,
  editTemplateMeta,
  syncTemplateStatusMeta,
} from '@/lib/meta/templates'
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { createTemplate as createTemplateDomain } from '@/lib/domain/whatsapp-templates'

// ============================================================================
// PROVIDER RESOLUTION (WA-08 / MIG-03)
// ============================================================================

type WhatsappProvider = 'meta_direct' | '360dialog'

/**
 * Read the workspace's WhatsApp provider + 360dialog settings in one query.
 * Default / null → '360dialog' (Regla 6 default-safe). The `meta_direct` arm
 * resolves Meta creds from workspaceId (never from input — T-39-02).
 */
async function readTemplateProviderConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string
): Promise<{ provider: WhatsappProvider; apiKey: string | undefined }> {
  const { data } = await supabase
    .from('workspaces')
    .select('whatsapp_provider, settings')
    .eq('id', workspaceId)
    .single()

  const provider: WhatsappProvider =
    data?.whatsapp_provider === 'meta_direct' ? 'meta_direct' : '360dialog'
  const apiKey = data?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  return { provider, apiKey }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get all templates for current workspace.
 * Returns templates ordered by creation date (newest first).
 */
export async function getTemplates(): Promise<Template[]> {
  const auth = await getRequestAuth()
  if (!auth) {
    return []
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching templates:', error)
    return []
  }

  return (data || []) as Template[]
}

/**
 * Get a single template by ID.
 */
export async function getTemplate(id: string): Promise<Template | null> {
  const auth = await getRequestAuth()
  if (!auth) {
    return null
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (error) {
    console.error('Error fetching template:', error)
    return null
  }

  return data as Template
}

/**
 * Get only approved templates (for sending messages).
 * Returns templates ordered by name for easy selection.
 */
export async function getApprovedTemplates(): Promise<Template[]> {
  const auth = await getRequestAuth()
  if (!auth) {
    return []
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'APPROVED')
    .order('name')

  if (error) {
    console.error('Error fetching approved templates:', error)
    return []
  }

  return (data || []) as Template[]
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new template and submit to 360dialog.
 *
 * Template names must be lowercase with underscores only.
 * Submitted templates start with PENDING status.
 */
export async function createTemplate(params: {
  name: string
  language?: string
  category: TemplateCategory
  components: TemplateComponent[]
  variable_mapping?: Record<string, string>
  headerImage?: { storagePath: string; mimeType: 'image/jpeg' | 'image/png' }
}): Promise<ActionResult<Template>> {
  // 1-2. Auth + workspace resolution
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  // 3. Name validation + cleanup (lowercase, underscores only)
  if (!params.name.trim()) {
    return { error: 'El nombre es requerido', field: 'name' }
  }
  const cleanName = params.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  if (cleanName.length < 1) {
    return { error: 'El nombre debe contener letras o numeros', field: 'name' }
  }

  // 4. Component validation
  if (!params.components || params.components.length === 0) {
    return { error: 'El template debe tener al menos un componente', field: 'components' }
  }

  // 5. Fetch workspace API key (fallback to env var)
  const { data: wsData } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  const apiKey = wsData?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) {
    return { error: 'API key de WhatsApp no configurada en el workspace' }
  }

  // 6. Delegate to domain (Regla 3: single source of truth)
  const result = await createTemplateDomain(
    { workspaceId, source: 'server-action' },
    {
      name: cleanName,
      language: params.language || 'es',
      category: params.category,
      components: params.components,
      variableMapping: params.variable_mapping || {},
      headerImage: params.headerImage,
      apiKey,
    }
  )

  // 7. Translate DomainResult -> ActionResult
  if (!result.success) {
    return { error: result.error || 'Error desconocido al crear template' }
  }

  revalidatePath('/configuracion/whatsapp/templates')
  return { success: true, data: result.data as Template }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update template variable mapping.
 *
 * Note: Cannot update template content after submission to Meta.
 * Only the local variable mapping can be modified.
 */
export async function updateTemplateMapping(
  id: string,
  variable_mapping: Record<string, string>
): Promise<ActionResult> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { error } = await supabase
    .from('whatsapp_templates')
    .update({
      variable_mapping,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error updating template mapping:', error)
    return { error: 'Error al actualizar el mapeo de variables' }
  }

  revalidatePath('/configuracion/whatsapp/templates')
  return { success: true, data: undefined }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a template (local + from 360dialog).
 *
 * Note: Deleted templates cannot be recreated with the same name
 * for a period of time in 360dialog.
 */
export async function deleteTemplate(id: string): Promise<ActionResult> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  // Get template name first
  const { data: template, error: fetchError } = await supabase
    .from('whatsapp_templates')
    .select('name, submitted_at')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (fetchError || !template) {
    return { error: 'Template no encontrado' }
  }

  // Provider-aware remote delete (WA-08). Only attempt the remote delete if the
  // template was ever submitted. meta_direct → Meta Graph; 360dialog → unchanged (Regla 6).
  const { provider, apiKey } = await readTemplateProviderConfig(supabase, workspaceId)
  if (template.submitted_at) {
    if (provider === 'meta_direct') {
      try {
        const creds = await resolveByWorkspace(workspaceId, 'whatsapp')
        if (creds?.accessToken && creds.wabaId) {
          await deleteTemplateMeta(
            { accessToken: creds.accessToken, wabaId: creds.wabaId, phoneNumberId: creds.phoneNumberId ?? undefined },
            template.name
          )
        } else {
          console.error('Failed to delete template from Meta: credenciales no configuradas')
        }
      } catch (apiError) {
        console.error('Failed to delete template from Meta:', apiError)
        // Continue with local delete
      }
    } else if (apiKey) {
      try {
        await deleteTemplate360(apiKey, template.name)
      } catch (apiError) {
        console.error('Failed to delete template from 360dialog:', apiError)
        // Continue with local delete
      }
    }
  }

  // Delete from local database
  const { error: deleteError } = await supabase
    .from('whatsapp_templates')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (deleteError) {
    console.error('Error deleting template:', deleteError)
    return { error: 'Error al eliminar el template' }
  }

  revalidatePath('/configuracion/whatsapp/templates')
  return { success: true, data: undefined }
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Sync all template statuses from 360dialog.
 *
 * Fetches current status from the API and updates local database.
 * Used to update local records after Meta approval/rejection.
 */
export async function syncTemplateStatuses(): Promise<ActionResult<number>> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { provider, apiKey } = await readTemplateProviderConfig(supabase, workspaceId)

  try {
    // Normalize both providers into a single { name, status, quality_score?, rejected_reason }[]
    // list, then apply identical UPDATEs (the persistence tail is provider-agnostic).
    let remoteTemplates: Array<{
      name: string
      status?: string
      quality_score?: { score?: string } | null
      rejected_reason?: string | null
    }>

    if (provider === 'meta_direct') {
      const creds = await resolveByWorkspace(workspaceId, 'whatsapp')
      if (!creds?.accessToken || !creds.wabaId) {
        return { error: 'Credenciales Meta no configuradas' }
      }
      const metaCreds = {
        accessToken: creds.accessToken,
        wabaId: creds.wabaId,
        phoneNumberId: creds.phoneNumberId ?? undefined,
      }
      const response = await listTemplatesMeta(metaCreds)
      remoteTemplates = (response.data || []).map((t) => ({
        name: t.name,
        status: t.status,
        quality_score: t.quality_score,
        rejected_reason: t.rejected_reason,
      }))
      // syncTemplateStatusMeta stays available as the per-name poll fallback (Pattern 3);
      // referencing it keeps the import live for single-row reconciliation callers.
      void syncTemplateStatusMeta
    } else {
      if (!apiKey) {
        return { error: 'API key de WhatsApp no configurada' }
      }
      const response = await listTemplates360(apiKey)
      remoteTemplates = response.waba_templates || []
    }

    let updatedCount = 0

    // Update local templates with remote status (provider-agnostic persistence tail).
    for (const remote of remoteTemplates) {
      // 360dialog returns lowercase status; Meta returns uppercase — normalize either way.
      const normalizedStatus = remote.status?.toUpperCase() || 'PENDING'

      const { error } = await supabase
        .from('whatsapp_templates')
        .update({
          status: normalizedStatus,
          quality_rating: remote.quality_score?.score || null,
          rejected_reason: (remote.rejected_reason && remote.rejected_reason !== 'NONE') ? remote.rejected_reason : null,
          approved_at: normalizedStatus === 'APPROVED' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('name', remote.name)

      if (!error) {
        updatedCount++
      }
    }

    // Note: revalidatePath is called by the form action, not here
    // (calling during render causes Next.js error)
    return { success: true, data: updatedCount }
  } catch (error) {
    console.error('Failed to sync template statuses:', error)
    return { error: 'Error al sincronizar estados de templates' }
  }
}

// ============================================================================
// EDIT OPERATIONS (WA-08 / D-05)
// ============================================================================

/**
 * Edit an existing template's content (WA-08, the MANDATORY D-05 experience).
 *
 * Provider-aware:
 *   - `meta_direct` → `editTemplateMeta` (Plan 03), which ENFORCES D-05 at the service
 *     layer (name/language immutable; status must be APPROVED/REJECTED/PAUSED; APPROVED is
 *     rate-limited and flips to PENDING after edit). This action resolves the Meta
 *     `message_template_id` from the workspace's WABA (the local row does not store it),
 *     then surfaces any D-05 violation thrown by the service as a clean `{ error }` — never
 *     crashes (T-39-08, defense in depth alongside the UI gating in Task 2).
 *   - `360dialog` → there is no edit endpoint; returns a clear "duplica y recrea" result so
 *     the caller never silently fails (RESEARCH D-05 note — 360dialog stays create-only).
 *
 * `name` / `language` are NEVER editable here — the params surface intentionally omits them,
 * and the service guard rejects them as a second layer (T-39-08).
 * workspaceId + creds resolve from the session, never from input (T-39-02).
 */
export async function editTemplate(params: {
  id: string
  category?: TemplateCategory
  components?: TemplateComponent[]
}): Promise<ActionResult> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  // Load the local row (name + language + current status) scoped to the workspace.
  const { data: template, error: fetchError } = await supabase
    .from('whatsapp_templates')
    .select('name, language, status')
    .eq('id', params.id)
    .eq('workspace_id', workspaceId)
    .single()

  if (fetchError || !template) {
    return { error: 'Template no encontrado' }
  }

  const { provider } = await readTemplateProviderConfig(supabase, workspaceId)

  // 360dialog has no edit endpoint — editing maps to delete + recreate.
  if (provider !== 'meta_direct') {
    return {
      error:
        'Este template no se puede editar directamente en 360dialog. Duplica y recrea el template con los cambios.',
    }
  }

  // meta_direct: resolve creds + the Meta message_template_id (the local row doesn't store it).
  const creds = await resolveByWorkspace(workspaceId, 'whatsapp')
  if (!creds?.accessToken || !creds.wabaId) {
    return { error: 'Credenciales Meta no configuradas' }
  }
  const metaCreds = {
    accessToken: creds.accessToken,
    wabaId: creds.wabaId,
    phoneNumberId: creds.phoneNumberId ?? undefined,
  }

  let messageTemplateId: string | undefined
  let currentStatus: string = template.status
  try {
    const list = await listTemplatesMeta(metaCreds)
    const match = (list.data || []).find(
      (t) => t.name === template.name && (!t.language || t.language === template.language)
    )
    messageTemplateId = match?.id
    if (match?.status) {
      currentStatus = match.status
    }
  } catch (lookupError) {
    console.error('Failed to resolve Meta template id for edit:', lookupError)
    return { error: 'No se pudo resolver el template en Meta para editarlo' }
  }

  if (!messageTemplateId) {
    return { error: 'No se encontro el template en Meta (¿fue enviado a revision?)' }
  }

  // Delegate to the service — the D-05 guard lives there. NEVER forward name/language
  // (the params surface omits them); the service rejects them as a second layer.
  try {
    await editTemplateMeta(metaCreds, {
      templateId: messageTemplateId,
      status: currentStatus,
      category: params.category as ('MARKETING' | 'UTILITY' | 'AUTHENTICATION') | undefined,
      components: params.components,
    })
  } catch (editError) {
    // Surface the D-05 (or any Meta) violation as a clean user-facing error — do not crash.
    const message =
      editError instanceof Error ? editError.message : 'Error al editar el template en Meta'
    return { error: message }
  }

  // After a successful edit Meta flips status to PENDING (re-review). Reflect locally.
  await supabase
    .from('whatsapp_templates')
    .update({ status: 'PENDING', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('workspace_id', workspaceId)

  revalidatePath('/configuracion/whatsapp/templates')
  return { success: true, data: undefined }
}

/**
 * Get template statistics for the workspace.
 */
export async function getTemplateStats(): Promise<{
  total: number
  approved: number
  pending: number
  rejected: number
}> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { total: 0, approved: 0, pending: 0, rejected: 0 }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  // Total templates
  const { count: total } = await supabase
    .from('whatsapp_templates')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  // Approved
  const { count: approved } = await supabase
    .from('whatsapp_templates')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'APPROVED')

  // Pending
  const { count: pending } = await supabase
    .from('whatsapp_templates')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'PENDING')

  // Rejected
  const { count: rejected } = await supabase
    .from('whatsapp_templates')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'REJECTED')

  return {
    total: total || 0,
    approved: approved || 0,
    pending: pending || 0,
    rejected: rejected || 0,
  }
}
