'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { OrderState, OrderStateFormData, OrderStateWithStages, PipelineStage } from '@/lib/orders/types'

// ============================================================================
// Validation Schemas
// ============================================================================

const orderStateSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(50),
  emoji: z.string().min(1, 'Emoji es requerido'),
})

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all order states for the current workspace with their assigned stages.
 * Ordered by position ASC.
 */
export async function getOrderStates(): Promise<OrderStateWithStages[]> {
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

  // Fetch all order states for the workspace
  const { data: states, error: statesError } = await supabase
    .from('order_states')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })

  if (statesError) {
    console.error('Error fetching order states:', statesError)
    return []
  }

  if (!states || states.length === 0) {
    return []
  }

  // Fetch all stages that have an order_state_id assigned
  const stateIds = states.map(s => s.id)
  const { data: stages, error: stagesError } = await supabase
    .from('pipeline_stages')
    .select('id, name, color, pipeline_id, order_state_id')
    .in('order_state_id', stateIds)

  if (stagesError) {
    console.error('Error fetching stages for states:', stagesError)
    // Return states without stages on error
    return states.map(s => ({ ...s, stages: [] }))
  }

  // Group stages by order_state_id
  const stagesByState = (stages || []).reduce<Record<string, Pick<PipelineStage, 'id' | 'name' | 'color' | 'pipeline_id'>[]>>((acc, stage) => {
    if (stage.order_state_id) {
      if (!acc[stage.order_state_id]) {
        acc[stage.order_state_id] = []
      }
      acc[stage.order_state_id].push({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        pipeline_id: stage.pipeline_id,
      })
    }
    return acc
  }, {})

  // Combine states with their stages
  return states.map(state => ({
    ...state,
    stages: stagesByState[state.id] || [],
  }))
}

/**
 * Get the order state for a specific stage.
 * Returns null if the stage has no order state assigned.
 * Used by WhatsApp indicator to get emoji.
 */
export async function getOrderStateForStage(stageId: string): Promise<OrderState | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  // Get the stage's order_state_id
  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('order_state_id')
    .eq('id', stageId)
    .single()

  if (stageError || !stage || !stage.order_state_id) {
    return null
  }

  // Fetch the order state
  const { data: orderState, error: stateError } = await supabase
    .from('order_states')
    .select('*')
    .eq('id', stage.order_state_id)
    .single()

  if (stateError || !orderState) {
    return null
  }

  return orderState
}

// ============================================================================
// Create Operations
// ============================================================================

/**
 * Create a new order state.
 * Position is automatically set to the next available position.
 */
export async function createOrderState(data: OrderStateFormData): Promise<ActionResult<OrderState>> {
  const validation = orderStateSchema.safeParse(data)
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

  // Get next position (max position + 1)
  const { data: maxPosData } = await supabase
    .from('order_states')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const nextPosition = (maxPosData?.position ?? -1) + 1

  // Insert new order state
  const { data: state, error } = await supabase
    .from('order_states')
    .insert({
      workspace_id: workspaceId,
      name: validation.data.name,
      emoji: validation.data.emoji,
      position: nextPosition,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating order state:', error)
    return { error: 'Error al crear el estado' }
  }

  revalidatePath('/crm/configuracion/estados-pedido')
  return { success: true, data: state }
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Update an existing order state.
 */
export async function updateOrderState(id: string, data: Partial<OrderStateFormData>): Promise<ActionResult<OrderState>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { data: state, error } = await supabase
    .from('order_states')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating order state:', error)
    return { error: 'Error al actualizar el estado' }
  }

  revalidatePath('/crm/configuracion/estados-pedido')
  return { success: true, data: state }
}

/**
 * Update order state positions after drag reorder.
 * Uses temp negative positions to avoid unique constraint violations.
 */
export async function updateOrderStateOrder(stateIds: string[]): Promise<ActionResult> {
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

  // First, set all positions to negative values to avoid unique constraint violations
  for (let i = 0; i < stateIds.length; i++) {
    const { error } = await supabase
      .from('order_states')
      .update({ position: -(i + 1000) }) // Negative temp value
      .eq('id', stateIds[i])
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('Error setting temp position:', error)
      return { error: 'Error actualizando posiciones' }
    }
  }

  // Now set the correct positions
  for (let i = 0; i < stateIds.length; i++) {
    const { error } = await supabase
      .from('order_states')
      .update({ position: i })
      .eq('id', stateIds[i])
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('Error setting final position:', error)
      return { error: 'Error actualizando posiciones' }
    }
  }

  revalidatePath('/crm/configuracion/estados-pedido')
  return { success: true, data: undefined }
}

/**
 * Assign stages to an order state.
 * Clears existing assignments for the state and sets new ones.
 */
export async function assignStagesToState(stateId: string, stageIds: string[]): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Clear existing assignments for stages currently pointing to this state
  // but not in the new stageIds list
  const { error: clearError } = await supabase
    .from('pipeline_stages')
    .update({ order_state_id: null })
    .eq('order_state_id', stateId)

  if (clearError) {
    console.error('Error clearing stage assignments:', clearError)
    return { error: 'Error al actualizar asignaciones' }
  }

  // Set order_state_id for all stages in stageIds
  if (stageIds.length > 0) {
    const { error: assignError } = await supabase
      .from('pipeline_stages')
      .update({ order_state_id: stateId })
      .in('id', stageIds)

    if (assignError) {
      console.error('Error assigning stages:', assignError)
      return { error: 'Error al asignar etapas' }
    }
  }

  revalidatePath('/crm/configuracion/estados-pedido')
  revalidatePath('/crm/configuracion/pipelines')
  return { success: true, data: undefined }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete an order state.
 * Stages will be automatically unassigned via ON DELETE SET NULL.
 */
export async function deleteOrderState(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('order_states')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting order state:', error)
    return { error: 'Error al eliminar el estado' }
  }

  revalidatePath('/crm/configuracion/estados-pedido')
  return { success: true, data: undefined }
}
