'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
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
import { createTemplate as createTemplateDomain } from '@/lib/domain/whatsapp-templates'

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get all templates for current workspace.
 * Returns templates ordered by creation date (newest first).
 */
export async function getTemplates(): Promise<Template[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return null
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

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
  // 1. Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // 2. Workspace resolution
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

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

  // Get workspace-specific API key
  const { data: wsData2 } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  const apiKey = wsData2?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (apiKey && template.submitted_at) {
    try {
      await deleteTemplate360(apiKey, template.name)
    } catch (apiError) {
      console.error('Failed to delete template from 360dialog:', apiError)
      // Continue with local delete
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  const { data: wsData3 } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  const apiKey = wsData3?.settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY
  if (!apiKey) {
    return { error: 'API key de WhatsApp no configurada' }
  }

  try {
    const response = await listTemplates360(apiKey)
    const remoteTemplates = response.waba_templates || []

    let updatedCount = 0

    // Update local templates with remote status
    for (const remote of remoteTemplates) {
      // 360dialog returns lowercase status, normalize to uppercase
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

/**
 * Get template statistics for the workspace.
 */
export async function getTemplateStats(): Promise<{
  total: number
  approved: number
  pending: number
  rejected: number
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { total: 0, approved: 0, pending: 0, rejected: 0 }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { total: 0, approved: 0, pending: 0, rejected: 0 }
  }

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
