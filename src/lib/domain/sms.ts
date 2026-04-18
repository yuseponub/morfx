// ============================================================================
// Domain Layer — SMS
// Single source of truth for ALL SMS sending.
// Every caller (automation actions, scripts, domain-calls) goes through
// sendSMS() instead of calling Onurix directly.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Validate phone, check time window, check balance
//   4. Call Onurix API
//   5. Apply defensive fallback on credits (Number(raw) || 1 + warn)
//   6. Atomic RPC: INSERT sms_messages + UPDATE balance + INSERT transaction (one transaction)
//   7. Emit Inngest event for delivery verification (best-effort, outside transaction)
//   8. Return DomainResult<SendSMSResult>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { inngest } from '@/inngest/client'
import { sendOnurixSMS } from '@/lib/sms/client'
import { formatColombianPhone } from '@/lib/sms/utils'
import { isWithinSMSWindow } from '@/lib/sms/utils'
import { SMS_PRICE_COP } from '@/lib/sms/constants'
import type { DomainContext, DomainResult } from './types'
import type { SmsStatus } from '@/lib/sms/types'

// ============================================================================
// Param Types
// ============================================================================

export interface SendSMSParams {
  /** Phone number (any Colombian format — will be normalized) */
  phone: string
  /** SMS text content */
  message: string
  /** Origin: 'automation' | 'domain-call' | 'script' */
  source?: string
  /** Link to automation execution for tracking */
  automationExecutionId?: string
  /** Contact name for denormalized display in history */
  contactName?: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface SendSMSResult {
  smsMessageId: string
  dispatchId: string
  status: SmsStatus
  segmentsUsed: number
  costCop: number
}

// ============================================================================
// sendSMS
// ============================================================================

/**
 * Send an SMS via Onurix.
 *
 * Flow:
 * 1. Validate phone format
 * 2. Check time window (8 AM - 9 PM Colombia)
 * 3. Check workspace SMS config (is_active, balance)
 * 4. Call Onurix API to send
 * 5. Defensive fallback on credits (Number(raw) || 1 + warn on fallback)
 * 6. Atomic RPC: INSERT sms_messages + UPDATE balance + INSERT transaction
 * 7. Emit Inngest event for delivery verification
 */
export async function sendSMS(
  ctx: DomainContext,
  params: SendSMSParams
): Promise<DomainResult<SendSMSResult>> {
  const supabase = createAdminClient()

  try {
    // 1. Validate and format phone number
    let formattedPhone: string
    try {
      formattedPhone = formatColombianPhone(params.phone)
    } catch {
      return { success: false, error: `Numero invalido: ${params.phone}` }
    }

    // 2. Check time window
    if (!isWithinSMSWindow()) {
      return {
        success: false,
        error: 'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)',
      }
    }

    // 3. Check workspace SMS config (balance + is_active) BEFORE sending
    const { data: config, error: configError } = await supabase
      .from('sms_workspace_config')
      .select('is_active, balance_cop, allow_negative_balance')
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (configError || !config) {
      return {
        success: false,
        error: 'SMS no activado en este workspace. Configure el servicio SMS primero.',
      }
    }

    if (!config.is_active) {
      return { success: false, error: 'Servicio SMS desactivado para este workspace' }
    }

    // Estimate cost for pre-send balance check
    // We use 1 segment as minimum estimate; actual cost comes from Onurix response
    const estimatedCost = SMS_PRICE_COP

    if (!config.allow_negative_balance && config.balance_cop < estimatedCost) {
      return {
        success: false,
        error: `Saldo SMS insuficiente. Saldo actual: $${config.balance_cop} COP, costo estimado: $${estimatedCost} COP`,
      }
    }

    // 4. Call Onurix API to send the SMS
    const onurixResponse = await sendOnurixSMS(formattedPhone, params.message)

    // 5. Defensive fallback on credits (D-07, D-08)
    const rawCredits = onurixResponse.data.credits
    const segmentsUsed = Number(rawCredits) || 1
    if (!Number(rawCredits)) {
      console.warn('[SMS] Onurix returned invalid credits, falling back to 1', {
        raw: rawCredits,
        phone: formattedPhone,
      })
    }
    const costCop = segmentsUsed * SMS_PRICE_COP

    // 6. Atomic: INSERT sms_messages + UPDATE balance + INSERT transaction (D-01, D-03)
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('insert_and_deduct_sms_message', {
        p_workspace_id: ctx.workspaceId,
        p_provider_message_id: onurixResponse.id,
        p_from_number: 'Onurix',
        p_to_number: formattedPhone,
        p_body: params.message,
        p_segments: segmentsUsed,
        p_cost_cop: costCop,
        p_source: params.source || 'domain-call',
        p_automation_execution_id: params.automationExecutionId || null,
        p_contact_name: params.contactName || null,
        p_amount: costCop,
        p_description: `SMS a ${formattedPhone} (${segmentsUsed} segmento${segmentsUsed > 1 ? 's' : ''})`,
      })
      .single()

    const result = rpcResult as unknown as {
      success: boolean
      sms_message_id: string | null
      new_balance: string
      error_message: string | null
    } | null

    if (rpcError) {
      console.error('[SMS] Atomic RPC failed — SMS sent but not persisted:', {
        code: rpcError.code,
        message: rpcError.message,
        dispatchId: onurixResponse.id,
        phone: formattedPhone,
      })
      return {
        success: true,
        data: {
          smsMessageId: 'unpersisted',
          dispatchId: onurixResponse.id,
          status: 'sent' as SmsStatus,
          segmentsUsed,
          costCop,
        },
      }
    }

    if (!result || !result.success) {
      console.error('[SMS] Atomic RPC returned success=false — SMS sent but not persisted:', {
        reason: result?.error_message,
        dispatchId: onurixResponse.id,
        phone: formattedPhone,
      })
      return {
        success: true,
        data: {
          smsMessageId: 'unpersisted',
          dispatchId: onurixResponse.id,
          status: 'sent' as SmsStatus,
          segmentsUsed,
          costCop,
        },
      }
    }

    const smsMessageId = result.sms_message_id!

    // 7. Emit Inngest event for delivery verification (best-effort, outside transaction)
    try {
      await (inngest.send as any)({
        name: 'sms/delivery.check',
        data: {
          smsMessageId,
          dispatchId: onurixResponse.id,
          workspaceId: ctx.workspaceId,
        },
      })
    } catch (inngestError) {
      console.error('[SMS] Failed to emit delivery check event:', inngestError)
    }

    // 8. Return success
    return {
      success: true,
      data: {
        smsMessageId,
        dispatchId: onurixResponse.id,
        status: 'sent' as SmsStatus,
        segmentsUsed,
        costCop,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Error al enviar SMS: ${message}` }
  }
}
