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
  createTemplate360,
  listTemplates360,
  deleteTemplate360,
} from '@/lib/whatsapp/templates-api'

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
}): Promise<ActionResult<Template>> {
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

  // Validate and clean template name (lowercase, underscores only)
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

  // Validate components
  if (!params.components || params.components.length === 0) {
    return { error: 'El template debe tener al menos un componente', field: 'components' }
  }

  const language = params.language || 'es'

  // Insert into local database first
  const { data: template, error: insertError } = await supabase
    .from('whatsapp_templates')
    .insert({
      workspace_id: workspaceId,
      name: cleanName,
      language,
      category: params.category,
      status: 'PENDING',
      components: params.components,
      variable_mapping: params.variable_mapping || {},
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating template:', insertError)
    if (insertError.code === '23505') {
      return { error: 'Ya existe un template con este nombre', field: 'name' }
    }
    return { error: 'Error al crear el template' }
  }

  // Submit to 360dialog (async, don't block)
  const apiKey = process.env.WHATSAPP_API_KEY
  if (apiKey) {
    try {
      await createTemplate360(apiKey, {
        name: cleanName,
        language,
        category: params.category,
        components: params.components,
      })

      // Update submitted_at
      await supabase
        .from('whatsapp_templates')
        .update({ submitted_at: new Date().toISOString() })
        .eq('id', template.id)
    } catch (apiError) {
      console.error('Failed to submit template to 360dialog:', apiError)
      const errorMessage = apiError instanceof Error ? apiError.message : 'Error al enviar a 360dialog'

      // Update template with error info
      await supabase
        .from('whatsapp_templates')
        .update({
          status: 'REJECTED',
          rejected_reason: errorMessage,
        })
        .eq('id', template.id)

      revalidatePath('/configuracion/whatsapp/templates')
      return { error: `Error de 360dialog: ${errorMessage}` }
    }
  }

  revalidatePath('/configuracion/whatsapp/templates')
  return { success: true, data: template as Template }
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

  // Delete from 360dialog if it was submitted
  const apiKey = process.env.WHATSAPP_API_KEY
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

  const apiKey = process.env.WHATSAPP_API_KEY
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
          rejected_reason: remote.rejected_reason || null,
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
