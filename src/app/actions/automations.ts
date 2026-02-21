'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type {
  Automation,
  AutomationFolder,
  AutomationFormData,
  AutomationExecution,
} from '@/lib/automations/types'
import {
  MAX_ACTIONS_PER_AUTOMATION,
  MAX_AUTOMATIONS_PER_WORKSPACE,
} from '@/lib/automations/constants'

// ============================================================================
// Validation Schemas
// ============================================================================

const conditionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    logic: z.enum(['AND', 'OR']),
    conditions: z.array(
      z.union([
        z.object({
          field: z.string().min(1),
          operator: z.string().min(1),
          value: z.unknown(),
        }),
        conditionSchema as z.ZodType<unknown>,
      ])
    ),
  })
)

const actionSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  delay: z
    .object({
      amount: z.number().positive(),
      unit: z.enum(['seconds', 'minutes', 'hours', 'days']),
    })
    .nullable()
    .optional(),
})

const automationSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  description: z.string().max(500).optional().nullable(),
  trigger_type: z.string().min(1, 'El trigger es requerido'),
  trigger_config: z.record(z.string(), z.unknown()).optional().default({}),
  conditions: conditionSchema.nullable().optional(),
  actions: z
    .array(actionSchema)
    .min(1, 'Se requiere al menos una accion')
    .max(MAX_ACTIONS_PER_AUTOMATION, `Maximo ${MAX_ACTIONS_PER_AUTOMATION} acciones por automatizacion`),
})

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Auth & Workspace Helpers
// ============================================================================

async function getAuthContext() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return null
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return null
  }

  return { supabase, user, workspaceId }
}

// ============================================================================
// Automation CRUD Operations
// ============================================================================

/**
 * Get all automations for the current workspace.
 * Ordered by created_at DESC.
 * Includes recent execution count (last 24h) and last execution status.
 */
export async function getAutomations(): Promise<Automation[]> {
  const ctx = await getAuthContext()
  if (!ctx) return []

  const { supabase, workspaceId } = ctx

  const { data: automations, error } = await supabase
    .from('automations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching automations:', error)
    return []
  }

  if (!automations || automations.length === 0) return []

  // Get execution stats for all automations (last 24h count + last execution status)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: recentExecs } = await supabase
    .from('automation_executions')
    .select('automation_id, status, started_at')
    .eq('workspace_id', workspaceId)
    .gte('started_at', twentyFourHoursAgo)
    .order('started_at', { ascending: false })

  // Build stats map
  const statsMap = new Map<string, { recentCount: number; lastStatus: string | null }>()
  for (const exec of recentExecs || []) {
    const existing = statsMap.get(exec.automation_id)
    if (existing) {
      existing.recentCount++
    } else {
      statsMap.set(exec.automation_id, {
        recentCount: 1,
        lastStatus: exec.status,
      })
    }
  }

  return automations.map((a) => ({
    ...a,
    _recentExecutions: statsMap.get(a.id)?.recentCount ?? 0,
    _lastExecutionStatus: statsMap.get(a.id)?.lastStatus ?? null,
  })) as Automation[]
}

/**
 * Get a single automation by ID.
 * Verifies workspace ownership.
 */
export async function getAutomation(id: string): Promise<Automation | null> {
  const ctx = await getAuthContext()
  if (!ctx) return null

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (error) {
    console.error('Error fetching automation:', error)
    return null
  }

  return data as Automation
}

/**
 * Create a new automation.
 * Validates with Zod. Enforces MAX_AUTOMATIONS_PER_WORKSPACE limit.
 */
export async function createAutomation(
  formData: AutomationFormData
): Promise<ActionResult<Automation>> {
  const validation = automationSchema.safeParse(formData)
  if (!validation.success) {
    const firstIssue = validation.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autorizado' }
  }

  const { supabase, user, workspaceId } = ctx

  // Check automation limit
  const { count, error: countError } = await supabase
    .from('automations')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  if (countError) {
    console.error('Error checking automation count:', countError)
    return { error: 'Error al verificar limites' }
  }

  if (count !== null && count >= MAX_AUTOMATIONS_PER_WORKSPACE) {
    return {
      error: `Limite alcanzado: maximo ${MAX_AUTOMATIONS_PER_WORKSPACE} automatizaciones por workspace`,
    }
  }

  const { data, error } = await supabase
    .from('automations')
    .insert({
      workspace_id: workspaceId,
      name: validation.data.name,
      description: validation.data.description || null,
      trigger_type: validation.data.trigger_type,
      trigger_config: validation.data.trigger_config,
      conditions: validation.data.conditions || null,
      actions: validation.data.actions,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating automation:', error)
    return { error: 'Error al crear la automatizacion' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: data as Automation }
}

/**
 * Update an existing automation.
 * Validates with Zod. Verifies workspace ownership.
 */
export async function updateAutomation(
  id: string,
  formData: AutomationFormData
): Promise<ActionResult<Automation>> {
  const validation = automationSchema.safeParse(formData)
  if (!validation.success) {
    const firstIssue = validation.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autorizado' }
  }

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('automations')
    .update({
      name: validation.data.name,
      description: validation.data.description || null,
      trigger_type: validation.data.trigger_type,
      trigger_config: validation.data.trigger_config,
      conditions: validation.data.conditions || null,
      actions: validation.data.actions,
    })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) {
    console.error('Error updating automation:', error)
    if (error.code === 'PGRST116') {
      return { error: 'Automatizacion no encontrada' }
    }
    return { error: 'Error al actualizar la automatizacion' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: data as Automation }
}

/**
 * Delete an automation.
 * Verifies workspace ownership. Executions are deleted via CASCADE.
 */
export async function deleteAutomation(id: string): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autorizado' }
  }

  const { supabase, workspaceId } = ctx

  const { error } = await supabase
    .from('automations')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error deleting automation:', error)
    return { error: 'Error al eliminar la automatizacion' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: undefined }
}

/**
 * Toggle automation is_enabled state.
 * Reads current value, flips it.
 */
export async function toggleAutomation(
  id: string
): Promise<ActionResult<{ is_enabled: boolean }>> {
  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autorizado' }
  }

  const { supabase, workspaceId } = ctx

  // Get current state
  const { data: current, error: fetchError } = await supabase
    .from('automations')
    .select('is_enabled')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (fetchError || !current) {
    return { error: 'Automatizacion no encontrada' }
  }

  const newState = !current.is_enabled

  const { error: updateError } = await supabase
    .from('automations')
    .update({ is_enabled: newState })
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (updateError) {
    console.error('Error toggling automation:', updateError)
    return { error: 'Error al cambiar el estado' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: { is_enabled: newState } }
}

/**
 * Duplicate an automation.
 * Creates a copy with ' (copia)' suffix and is_enabled = false.
 */
export async function duplicateAutomation(
  id: string
): Promise<ActionResult<Automation>> {
  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autorizado' }
  }

  const { supabase, user, workspaceId } = ctx

  // Check automation limit before duplicating
  const { count } = await supabase
    .from('automations')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  if (count !== null && count >= MAX_AUTOMATIONS_PER_WORKSPACE) {
    return {
      error: `Limite alcanzado: maximo ${MAX_AUTOMATIONS_PER_WORKSPACE} automatizaciones por workspace`,
    }
  }

  // Get original
  const { data: original, error: fetchError } = await supabase
    .from('automations')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (fetchError || !original) {
    return { error: 'Automatizacion no encontrada' }
  }

  // Truncate name if needed to stay within 100 char limit
  const baseName = original.name.length > 92
    ? original.name.substring(0, 92)
    : original.name

  const { data: copy, error: insertError } = await supabase
    .from('automations')
    .insert({
      workspace_id: workspaceId,
      name: `${baseName} (copia)`,
      description: original.description,
      is_enabled: false,
      trigger_type: original.trigger_type,
      trigger_config: original.trigger_config,
      conditions: original.conditions,
      actions: original.actions,
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error duplicating automation:', insertError)
    return { error: 'Error al duplicar la automatizacion' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: copy as Automation }
}

// ============================================================================
// Execution History Operations
// ============================================================================

/**
 * Get execution history with optional filters and pagination.
 * Joins with automations table to get automation name.
 */
export async function getExecutionHistory(params: {
  automationId?: string
  page?: number
  pageSize?: number
  status?: string
}): Promise<{
  data: (AutomationExecution & { automation_name: string })[]
  total: number
  page: number
  pageSize: number
}> {
  const emptyResult = { data: [], total: 0, page: 1, pageSize: 20 }

  const ctx = await getAuthContext()
  if (!ctx) return emptyResult

  const { supabase, workspaceId } = ctx

  const pageSize = params.pageSize ?? 20
  const page = params.page ?? 1
  const offset = (page - 1) * pageSize

  // Count total matching records
  let countQuery = supabase
    .from('automation_executions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  if (params.automationId) {
    countQuery = countQuery.eq('automation_id', params.automationId)
  }
  if (params.status) {
    countQuery = countQuery.eq('status', params.status)
  }

  const { count, error: countError } = await countQuery

  if (countError) {
    console.error('Error counting executions:', countError)
    return emptyResult
  }

  // Fetch paginated data
  let dataQuery = supabase
    .from('automation_executions')
    .select('*, automations!inner(name)')
    .eq('workspace_id', workspaceId)
    .order('started_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (params.automationId) {
    dataQuery = dataQuery.eq('automation_id', params.automationId)
  }
  if (params.status) {
    dataQuery = dataQuery.eq('status', params.status)
  }

  const { data, error } = await dataQuery

  if (error) {
    console.error('Error fetching execution history:', error)
    return emptyResult
  }

  // Map joined automation name
  const mapped = (data || []).map((exec: Record<string, unknown>) => {
    const automations = exec.automations as { name: string } | null
    const { automations: _, ...rest } = exec
    return {
      ...rest,
      automation_name: automations?.name ?? 'Automatizacion eliminada',
    }
  }) as (AutomationExecution & { automation_name: string })[]

  return {
    data: mapped,
    total: count ?? 0,
    page,
    pageSize,
  }
}

/**
 * Get a single execution with full detail.
 * Includes actions_log, trigger_event snapshot, and parent automation name.
 * Verifies workspace ownership.
 */
export async function getExecutionDetail(
  executionId: string
): Promise<(AutomationExecution & { automation_name: string }) | null> {
  const ctx = await getAuthContext()
  if (!ctx) return null

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('automation_executions')
    .select('*, automations!inner(name)')
    .eq('id', executionId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) {
    console.error('Error fetching execution detail:', error)
    return null
  }

  const automations = (data as Record<string, unknown>).automations as { name: string } | null
  const { automations: _, ...rest } = data as Record<string, unknown>

  return {
    ...rest,
    automation_name: automations?.name ?? 'Automatizacion eliminada',
  } as AutomationExecution & { automation_name: string }
}

/**
 * Get count of failed executions in the last 24 hours.
 * Used for badge display in sidebar.
 */
export async function getRecentFailures(): Promise<number> {
  const ctx = await getAuthContext()
  if (!ctx) return 0

  const { supabase, workspaceId } = ctx

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count, error } = await supabase
    .from('automation_executions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'failed')
    .gte('started_at', twentyFourHoursAgo)

  if (error) {
    console.error('Error fetching recent failures:', error)
    return 0
  }

  return count ?? 0
}

/**
 * Get basic stats for a single automation.
 * Total executions, success rate, last execution date.
 * Used in the automation list view.
 */
export async function getAutomationStats(automationId: string): Promise<{
  totalExecutions: number
  successRate: number
  lastExecutionAt: string | null
} | null> {
  const ctx = await getAuthContext()
  if (!ctx) return null

  const { supabase, workspaceId } = ctx

  // Get total executions
  const { count: totalCount, error: totalError } = await supabase
    .from('automation_executions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('automation_id', automationId)

  if (totalError) {
    console.error('Error fetching automation stats:', totalError)
    return null
  }

  const total = totalCount ?? 0

  if (total === 0) {
    return { totalExecutions: 0, successRate: 100, lastExecutionAt: null }
  }

  // Get success count
  const { count: successCount } = await supabase
    .from('automation_executions')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('automation_id', automationId)
    .eq('status', 'success')

  // Get last execution
  const { data: lastExec } = await supabase
    .from('automation_executions')
    .select('started_at')
    .eq('workspace_id', workspaceId)
    .eq('automation_id', automationId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  const successRate = total > 0 ? Math.round(((successCount ?? 0) / total) * 100) : 100

  return {
    totalExecutions: total,
    successRate,
    lastExecutionAt: lastExec?.started_at ?? null,
  }
}

// ============================================================================
// Integration Checks
// ============================================================================

// ============================================================================
// Folder Operations
// ============================================================================

/**
 * Get all folders for the current workspace, ordered by position.
 */
export async function getFolders(): Promise<AutomationFolder[]> {
  const ctx = await getAuthContext()
  if (!ctx) return []

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('automation_folders')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })

  if (error) {
    console.error('Error fetching folders:', error)
    return []
  }

  return (data ?? []) as AutomationFolder[]
}

/**
 * Create a new folder. Position is set to the end.
 */
export async function createFolder(
  name: string
): Promise<ActionResult<AutomationFolder>> {
  if (!name.trim()) return { error: 'El nombre es requerido' }
  if (name.length > 100) return { error: 'Maximo 100 caracteres' }

  const ctx = await getAuthContext()
  if (!ctx) return { error: 'No autorizado' }

  const { supabase, workspaceId } = ctx

  // Get max position to place at end
  const { data: existing } = await supabase
    .from('automation_folders')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = existing && existing.length > 0
    ? (existing[0].position as number) + 1000
    : 1000

  const { data, error } = await supabase
    .from('automation_folders')
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      position: nextPosition,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating folder:', error)
    return { error: 'Error al crear la carpeta' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: data as AutomationFolder }
}

/**
 * Rename a folder.
 */
export async function renameFolder(
  id: string,
  name: string
): Promise<ActionResult<AutomationFolder>> {
  if (!name.trim()) return { error: 'El nombre es requerido' }
  if (name.length > 100) return { error: 'Maximo 100 caracteres' }

  const ctx = await getAuthContext()
  if (!ctx) return { error: 'No autorizado' }

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('automation_folders')
    .update({ name: name.trim() })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) {
    console.error('Error renaming folder:', error)
    return { error: 'Error al renombrar la carpeta' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: data as AutomationFolder }
}

/**
 * Get automation names inside a folder (for delete confirmation dialog).
 */
export async function getFolderAutomationNames(
  folderId: string
): Promise<string[]> {
  const ctx = await getAuthContext()
  if (!ctx) return []

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('automations')
    .select('name')
    .eq('workspace_id', workspaceId)
    .eq('folder_id', folderId)
    .order('position', { ascending: true })

  if (error) {
    console.error('Error fetching folder automations:', error)
    return []
  }

  return (data ?? []).map((a) => a.name)
}

/**
 * Delete a folder and all its automations (CASCADE).
 */
export async function deleteFolder(id: string): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: 'No autorizado' }

  const { supabase, workspaceId } = ctx

  const { error } = await supabase
    .from('automation_folders')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error deleting folder:', error)
    return { error: 'Error al eliminar la carpeta' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: undefined }
}

/**
 * Toggle folder collapsed state.
 */
export async function toggleFolderCollapse(
  id: string
): Promise<ActionResult<{ is_collapsed: boolean }>> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: 'No autorizado' }

  const { supabase, workspaceId } = ctx

  const { data: current, error: fetchError } = await supabase
    .from('automation_folders')
    .select('is_collapsed')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single()

  if (fetchError || !current) {
    return { error: 'Carpeta no encontrada' }
  }

  const newState = !current.is_collapsed

  const { error: updateError } = await supabase
    .from('automation_folders')
    .update({ is_collapsed: newState })
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (updateError) {
    console.error('Error toggling folder collapse:', updateError)
    return { error: 'Error al cambiar estado de carpeta' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: { is_collapsed: newState } }
}

/**
 * Reorder folders by updating their positions.
 */
export async function reorderFolders(
  orderedIds: string[]
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: 'No autorizado' }

  const { supabase, workspaceId } = ctx

  // Update positions: 1000, 2000, 3000, ...
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('automation_folders')
      .update({ position: (index + 1) * 1000 })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)

  if (failed?.error) {
    console.error('Error reordering folders:', failed.error)
    return { error: 'Error al reordenar carpetas' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: undefined }
}

/**
 * Move an automation to a folder (or root) and set its position.
 */
export async function moveAutomation(
  automationId: string,
  folderId: string | null,
  position: number
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: 'No autorizado' }

  const { supabase, workspaceId } = ctx

  const { error } = await supabase
    .from('automations')
    .update({ folder_id: folderId, position })
    .eq('id', automationId)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error moving automation:', error)
    return { error: 'Error al mover la automatizacion' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: undefined }
}

/**
 * Batch reorder automations (positions + folder assignments).
 */
export async function reorderAutomations(
  updates: { id: string; folder_id: string | null; position: number }[]
): Promise<ActionResult> {
  const ctx = await getAuthContext()
  if (!ctx) return { error: 'No autorizado' }

  const { supabase, workspaceId } = ctx

  const promises = updates.map((u) =>
    supabase
      .from('automations')
      .update({ folder_id: u.folder_id, position: u.position })
      .eq('id', u.id)
      .eq('workspace_id', workspaceId)
  )

  const results = await Promise.all(promises)
  const failed = results.find((r) => r.error)

  if (failed?.error) {
    console.error('Error reordering automations:', failed.error)
    return { error: 'Error al reordenar automatizaciones' }
  }

  revalidatePath('/automatizaciones')
  return { success: true, data: undefined }
}

// ============================================================================
// Integration Checks
// ============================================================================

/**
 * Check if Twilio is configured and active for the current workspace.
 * Returns boolean. Used by the wizard to show configuration warnings.
 */
export async function checkTwilioConfigured(): Promise<boolean> {
  const ctx = await getAuthContext()
  if (!ctx) return false

  const { supabase, workspaceId } = ctx

  const { data, error } = await supabase
    .from('integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('type', 'twilio')
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('Error checking Twilio config:', error)
    return false
  }

  return !!data
}
