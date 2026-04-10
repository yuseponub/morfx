'use server'

// ============================================================================
// BOLD Payment Link Server Actions
// Save/read credentials (integrations table, type='bold')
// Generate payment link via Railway robot
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getIntegrationAuthContext,
  canManageIntegrations,
} from '@/app/actions/integrations'
import { callBoldRobot } from '@/lib/bold/client'
import type { BoldConfig } from '@/lib/bold/types'

// ============================================================================
// 1. Save BOLD Integration (username + password)
// ============================================================================

export async function saveBoldIntegration(formData: {
  username: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) {
    return { success: false, error: 'No autenticado' }
  }

  if (!canManageIntegrations(ctx.role)) {
    return { success: false, error: 'Solo Owner o Admin pueden configurar integraciones' }
  }

  if (!formData.username || !formData.password) {
    return { success: false, error: 'Usuario y contrasena son requeridos' }
  }

  const adminSupabase = createAdminClient()

  const config: BoldConfig = {
    username: formData.username,
    password: formData.password,
  }

  // Check if integration exists
  const { data: existing } = await adminSupabase
    .from('integrations')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'bold')
    .single()

  if (existing) {
    const { error } = await adminSupabase
      .from('integrations')
      .update({
        config,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) {
      console.error('[saveBoldIntegration] Update error:', error)
      return { success: false, error: 'Error al actualizar integracion' }
    }
  } else {
    const { error } = await adminSupabase
      .from('integrations')
      .insert({
        workspace_id: ctx.workspaceId,
        type: 'bold',
        name: 'BOLD Pagos',
        config,
        is_active: true,
      })

    if (error) {
      console.error('[saveBoldIntegration] Insert error:', error)
      return { success: false, error: 'Error al crear integracion' }
    }
  }

  return { success: true }
}

// ============================================================================
// 2. Get BOLD Integration (masked password)
// ============================================================================

export async function getBoldIntegration(): Promise<{
  id: string
  username: string
  password: string // Masked: ****XXXX
  isActive: boolean
} | null> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) return null

  const adminSupabase = createAdminClient()
  const { data: integration } = await adminSupabase
    .from('integrations')
    .select('id, config, is_active')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'bold')
    .single()

  if (!integration) return null

  const config = integration.config as BoldConfig

  const maskedPassword = config.password
    ? '****' + config.password.slice(-4)
    : ''

  return {
    id: integration.id,
    username: config.username || '',
    password: maskedPassword,
    isActive: integration.is_active,
  }
}

// ============================================================================
// 3. Create Payment Link (calls Railway robot)
// ============================================================================

export async function createPaymentLinkAction(input: {
  amount: number
  description: string
}): Promise<{ success: boolean; url?: string; error?: string }> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) {
    return { success: false, error: 'No autenticado' }
  }

  if (input.amount <= 0) {
    return { success: false, error: 'El monto debe ser mayor a 0' }
  }

  if (!input.description.trim()) {
    return { success: false, error: 'La descripcion es requerida' }
  }

  // Load BOLD credentials
  const adminSupabase = createAdminClient()
  const { data: integration } = await adminSupabase
    .from('integrations')
    .select('config')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'bold')
    .eq('is_active', true)
    .single()

  if (!integration) {
    return {
      success: false,
      error: 'BOLD no esta configurado. Ve a Configuracion > Integraciones.',
    }
  }

  const config = integration.config as BoldConfig

  if (!config.username || !config.password) {
    return { success: false, error: 'Credenciales de BOLD incompletas' }
  }

  try {
    const result = await callBoldRobot({
      username: config.username,
      password: config.password,
      amount: input.amount,
      description: input.description.trim(),
    })

    return { success: true, url: result.url }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error desconocido al generar link de pago'
    console.error('[createPaymentLinkAction] Error:', message)
    return { success: false, error: message }
  }
}
