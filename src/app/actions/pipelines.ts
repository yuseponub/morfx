'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { Pipeline, PipelineStage, PipelineFormData, PipelineStageFormData, PipelineWithStages } from '@/lib/orders/types'

// ============================================================================
// Validation Schemas
// ============================================================================

const pipelineSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(100),
  description: z.string().optional().nullable(),
  is_default: z.boolean().optional().default(false),
})

const stageSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color invalido').default('#6366f1'),
  position: z.number().int().min(0).optional(),
  wip_limit: z.number().int().min(1).optional().nullable(),
  is_closed: z.boolean().optional().default(false),
})

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Default Stages
// ============================================================================

const DEFAULT_STAGES = [
  { name: 'Nuevo', color: '#6366f1', position: 0, is_closed: false },
  { name: 'En Proceso', color: '#f59e0b', position: 1, is_closed: false },
  { name: 'Ganado', color: '#10b981', position: 2, is_closed: true },
  { name: 'Perdido', color: '#ef4444', position: 3, is_closed: true },
]

// ============================================================================
// Read Operations - Pipelines
// ============================================================================

/**
 * Get all pipelines with their stages for the current workspace
 * Ordered by is_default DESC, name ASC
 */
export async function getPipelines(): Promise<PipelineWithStages[]> {
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

  const { data: pipelines, error } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('is_default', { ascending: false })
    .order('name')

  if (error) {
    console.error('Error fetching pipelines:', error)
    return []
  }

  // Sort stages by position within each pipeline
  return (pipelines || []).map(p => ({
    ...p,
    stages: (p.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
  }))
}

/**
 * Get single pipeline with stages
 * Returns null if not found or not accessible
 */
export async function getPipeline(id: string): Promise<PipelineWithStages | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: pipeline, error } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('id', id)
    .single()

  if (error || !pipeline) {
    return null
  }

  // Sort stages by position
  return {
    ...pipeline,
    stages: (pipeline.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
  }
}

/**
 * Get or create default pipeline for the workspace
 * Creates "Ventas" pipeline with default stages if none exists
 */
export async function getOrCreateDefaultPipeline(): Promise<PipelineWithStages | null> {
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

  // Try to find existing default pipeline
  const { data: existing } = await supabase
    .from('pipelines')
    .select(`*, stages:pipeline_stages(*)`)
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()

  if (existing) {
    return {
      ...existing,
      stages: (existing.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
    }
  }

  // Create default pipeline
  const { data: pipeline, error: pipelineError } = await supabase
    .from('pipelines')
    .insert({
      workspace_id: workspaceId,
      name: 'Ventas',
      is_default: true,
    })
    .select()
    .single()

  if (pipelineError) {
    console.error('Error creating default pipeline:', pipelineError)
    return null
  }

  // Create default stages
  const stagesToInsert = DEFAULT_STAGES.map(s => ({
    ...s,
    pipeline_id: pipeline.id,
  }))

  const { error: stagesError } = await supabase
    .from('pipeline_stages')
    .insert(stagesToInsert)

  if (stagesError) {
    console.error('Error creating default stages:', stagesError)
    return null
  }

  // Note: No revalidatePath here - this is called during render
  // Revalidation happens on explicit mutations (create/update/delete)
  return getPipeline(pipeline.id)
}

// ============================================================================
// Create/Update Operations - Pipelines
// ============================================================================

/**
 * Create a new pipeline with default stages
 */
export async function createPipeline(formData: PipelineFormData): Promise<ActionResult<PipelineWithStages>> {
  const validation = pipelineSchema.safeParse(formData)
  if (!validation.success) {
    return { error: validation.error.issues[0].message }
  }

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

  // Create pipeline
  const { data: pipeline, error } = await supabase
    .from('pipelines')
    .insert({
      workspace_id: workspaceId,
      name: validation.data.name,
      description: validation.data.description || null,
      is_default: validation.data.is_default,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating pipeline:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe un pipeline con este nombre' }
    }
    return { error: 'Error al crear el pipeline' }
  }

  // Create default stages
  const stagesToInsert = DEFAULT_STAGES.map(s => ({
    ...s,
    pipeline_id: pipeline.id,
  }))

  await supabase.from('pipeline_stages').insert(stagesToInsert)

  revalidatePath('/crm/configuracion/pipelines')

  const result = await getPipeline(pipeline.id)
  if (!result) {
    return { error: 'Error al obtener el pipeline creado' }
  }

  return { success: true, data: result }
}

/**
 * Update an existing pipeline
 */
export async function updatePipeline(id: string, formData: Partial<PipelineFormData>): Promise<ActionResult<Pipeline>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { data, error } = await supabase
    .from('pipelines')
    .update({
      ...formData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating pipeline:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe un pipeline con este nombre' }
    }
    return { error: 'Error al actualizar el pipeline' }
  }

  revalidatePath('/crm/configuracion/pipelines')
  return { success: true, data }
}

/**
 * Delete a pipeline
 * Only allowed if not default and has no orders
 */
export async function deletePipeline(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Check if default
  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('is_default')
    .eq('id', id)
    .single()

  if (pipeline?.is_default) {
    return { error: 'No se puede eliminar el pipeline por defecto' }
  }

  // Check for orders
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_id', id)

  if (count && count > 0) {
    return { error: `Este pipeline tiene ${count} pedidos. Muevelos antes de eliminar.` }
  }

  const { error } = await supabase.from('pipelines').delete().eq('id', id)

  if (error) {
    console.error('Error deleting pipeline:', error)
    return { error: 'Error al eliminar el pipeline' }
  }

  revalidatePath('/crm/configuracion/pipelines')
  return { success: true, data: undefined }
}

// ============================================================================
// Stage Operations
// ============================================================================

/**
 * Create a new stage in a pipeline
 */
export async function createStage(pipelineId: string, formData: PipelineStageFormData): Promise<ActionResult<PipelineStage>> {
  const validation = stageSchema.safeParse(formData)
  if (!validation.success) {
    return { error: validation.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get max position for this pipeline
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = stages && stages.length > 0 ? stages[0].position + 1 : 0

  const { data, error } = await supabase
    .from('pipeline_stages')
    .insert({
      pipeline_id: pipelineId,
      name: validation.data.name,
      color: validation.data.color,
      position: formData.position ?? nextPosition,
      wip_limit: validation.data.wip_limit ?? null,
      is_closed: validation.data.is_closed ?? false,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating stage:', error)
    return { error: 'Error al crear la etapa' }
  }

  revalidatePath('/crm/configuracion/pipelines')
  revalidatePath('/crm/pedidos')
  return { success: true, data }
}

/**
 * Update an existing stage
 */
export async function updateStage(id: string, formData: Partial<PipelineStageFormData>): Promise<ActionResult<PipelineStage>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { data, error } = await supabase
    .from('pipeline_stages')
    .update(formData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating stage:', error)
    return { error: 'Error al actualizar la etapa' }
  }

  revalidatePath('/crm/configuracion/pipelines')
  revalidatePath('/crm/pedidos')
  return { success: true, data }
}

/**
 * Update stage positions after drag reorder
 */
export async function updateStageOrder(pipelineId: string, stageIds: string[]): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // First, set all positions to negative values to avoid unique constraint violations
  // Then set them to their correct positive values
  for (let i = 0; i < stageIds.length; i++) {
    const { error } = await supabase
      .from('pipeline_stages')
      .update({ position: -(i + 1000) }) // Negative temp value
      .eq('id', stageIds[i])
      .eq('pipeline_id', pipelineId)

    if (error) {
      console.error('Error setting temp position:', error)
      return { error: 'Error actualizando posiciones' }
    }
  }

  // Now set the correct positions
  for (let i = 0; i < stageIds.length; i++) {
    const { error } = await supabase
      .from('pipeline_stages')
      .update({ position: i })
      .eq('id', stageIds[i])
      .eq('pipeline_id', pipelineId)

    if (error) {
      console.error('Error setting final position:', error)
      return { error: 'Error actualizando posiciones' }
    }
  }

  revalidatePath('/crm/configuracion/pipelines')
  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}

/**
 * Delete a stage
 * Only allowed if no orders in that stage
 */
export async function deleteStage(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Check for orders in this stage
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('stage_id', id)

  if (count && count > 0) {
    return { error: `Esta etapa tiene ${count} pedidos. Muevelos antes de eliminar.` }
  }

  const { error } = await supabase.from('pipeline_stages').delete().eq('id', id)

  if (error) {
    console.error('Error deleting stage:', error)
    return { error: 'Error al eliminar la etapa' }
  }

  revalidatePath('/crm/configuracion/pipelines')
  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}
