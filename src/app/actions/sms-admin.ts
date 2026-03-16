'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================================
// Auth check — reuse same pattern as super-admin.ts
// ============================================================================

async function verifySuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const MORFX_OWNER_ID = process.env.MORFX_OWNER_USER_ID
  if (!user || user.id !== MORFX_OWNER_ID) {
    throw new Error('Unauthorized')
  }

  return user
}

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceSMSRow {
  workspaceId: string
  workspaceName: string
  isActive: boolean | null       // null = not configured
  balanceCop: number
  totalSmsSent: number
  totalCreditsUsed: number
  allowNegativeBalance: boolean
  updatedAt: string | null
}

export interface SMSTransaction {
  id: string
  type: string
  amountCop: number
  balanceAfter: number
  description: string | null
  createdBy: string | null
  createdAt: string
}

// ============================================================================
// getAllWorkspaceSMS — list all workspaces with SMS config
// ============================================================================

export async function getAllWorkspaceSMS(): Promise<WorkspaceSMSRow[]> {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  // Get all workspaces
  const { data: workspaces, error: wsError } = await adminClient
    .from('workspaces')
    .select('id, name')
    .order('name')

  if (wsError) throw wsError
  if (!workspaces || workspaces.length === 0) return []

  // Get all SMS configs
  const { data: configs, error: cfgError } = await adminClient
    .from('sms_workspace_config')
    .select('workspace_id, is_active, balance_cop, total_sms_sent, total_credits_used, allow_negative_balance, updated_at')

  if (cfgError) throw cfgError

  // Build lookup by workspace_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configMap = new Map<string, any>(
    (configs || []).map((c: any) => [c.workspace_id, c])
  )

  return workspaces.map(ws => {
    const cfg = configMap.get(ws.id)
    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      isActive: cfg ? (cfg.is_active as boolean) : null,
      balanceCop: cfg ? Number(cfg.balance_cop) : 0,
      totalSmsSent: cfg ? (cfg.total_sms_sent as number) : 0,
      totalCreditsUsed: cfg ? Number(cfg.total_credits_used) : 0,
      allowNegativeBalance: cfg ? (cfg.allow_negative_balance as boolean) : true,
      updatedAt: cfg ? (cfg.updated_at as string) : null,
    }
  })
}

// ============================================================================
// rechargeWorkspaceBalance — add balance via add_sms_balance RPC
// ============================================================================

export async function rechargeWorkspaceBalance(
  workspaceId: string,
  amount: number,
  description?: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const user = await verifySuperAdmin()
  const adminClient = createAdminClient()

  if (amount <= 0) {
    return { success: false, error: 'El monto debe ser mayor a 0' }
  }

  // Ensure sms_workspace_config exists for this workspace
  const { data: existing } = await adminClient
    .from('sms_workspace_config')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single()

  if (!existing) {
    // Create config with defaults
    const { error: insertError } = await adminClient
      .from('sms_workspace_config')
      .insert({
        workspace_id: workspaceId,
        is_active: true,
        balance_cop: 0,
        allow_negative_balance: true,
        total_sms_sent: 0,
        total_credits_used: 0,
      })
    if (insertError) {
      return { success: false, error: `Error creando config SMS: ${insertError.message}` }
    }
  }

  // Call add_sms_balance RPC
  const { data, error } = await adminClient.rpc('add_sms_balance', {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_created_by: user.id,
    p_description: description || 'Recarga manual',
  })

  if (error) {
    return { success: false, error: `Error en recarga: ${error.message}` }
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.success) {
    return { success: false, error: result?.error_message || 'Error desconocido' }
  }

  revalidatePath('/super-admin/sms')
  return { success: true, newBalance: Number(result.new_balance) }
}

// ============================================================================
// toggleWorkspaceSMS — activate/deactivate SMS for a workspace
// ============================================================================

export async function toggleWorkspaceSMS(
  workspaceId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  // Check if config exists
  const { data: existing } = await adminClient
    .from('sms_workspace_config')
    .select('id')
    .eq('workspace_id', workspaceId)
    .single()

  if (existing) {
    // Update only is_active (preserve balance and other fields)
    const { error } = await adminClient
      .from('sms_workspace_config')
      .update({ is_active: isActive })
      .eq('workspace_id', workspaceId)

    if (error) {
      return { success: false, error: `Error actualizando SMS: ${error.message}` }
    }
  } else {
    // Create with defaults
    const { error } = await adminClient
      .from('sms_workspace_config')
      .insert({
        workspace_id: workspaceId,
        is_active: isActive,
        balance_cop: 0,
        allow_negative_balance: true,
        total_sms_sent: 0,
        total_credits_used: 0,
      })

    if (error) {
      return { success: false, error: `Error creando config SMS: ${error.message}` }
    }
  }

  revalidatePath('/super-admin/sms')
  return { success: true }
}

// ============================================================================
// getWorkspaceTransactions — paginated transaction history
// ============================================================================

export async function getWorkspaceTransactions(
  workspaceId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ data: SMSTransaction[]; total: number; page: number; pageSize: number }> {
  await verifySuperAdmin()
  const adminClient = createAdminClient()

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Get total count
  const { count } = await adminClient
    .from('sms_balance_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  // Get page of transactions
  const { data, error } = await adminClient
    .from('sms_balance_transactions')
    .select('id, type, amount_cop, balance_after, description, created_by, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return {
    data: (data || []).map(t => ({
      id: t.id,
      type: t.type,
      amountCop: Number(t.amount_cop),
      balanceAfter: Number(t.balance_after),
      description: t.description,
      createdBy: t.created_by,
      createdAt: t.created_at,
    })),
    total: count || 0,
    page,
    pageSize,
  }
}
