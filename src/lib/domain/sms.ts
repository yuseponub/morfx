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
//   5. Log to sms_messages
//   6. Deduct balance (atomic RPC)
//   7. Emit Inngest event for delivery verification
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
 * 5. Log message to sms_messages table
 * 6. Deduct balance via atomic RPC
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

    // Calculate actual cost from Onurix response (credits = actual segments used)
    const segmentsUsed = onurixResponse.data.credits
    const costCop = segmentsUsed * SMS_PRICE_COP

    // 5. Log message to sms_messages table
    const { data: smsRecord, error: insertError } = await supabase
      .from('sms_messages')
      .insert({
        workspace_id: ctx.workspaceId,
        provider_message_id: onurixResponse.id,
        provider: 'onurix',
        from_number: 'Onurix',
        to_number: formattedPhone,
        body: params.message,
        direction: 'outbound',
        status: 'sent',
        segments: segmentsUsed,
        cost_cop: costCop,
        source: params.source || 'domain-call',
        automation_execution_id: params.automationExecutionId || null,
        contact_name: params.contactName || null,
      })
      .select('id')
      .single()

    if (insertError || !smsRecord) {
      // SMS was already sent by Onurix, but we couldn't log it
      // Log the error but don't fail the operation
      console.error('[SMS] Failed to insert sms_messages record:', insertError?.message)
      return {
        success: true,
        data: {
          smsMessageId: 'unknown',
          dispatchId: onurixResponse.id,
          status: 'sent' as SmsStatus,
          segmentsUsed,
          costCop,
        },
      }
    }

    // 6. Deduct balance via atomic RPC
    const { data: deductResult, error: deductError } = await supabase.rpc(
      'deduct_sms_balance',
      {
        p_workspace_id: ctx.workspaceId,
        p_amount: costCop,
        p_sms_message_id: smsRecord.id,
        p_description: `SMS a ${formattedPhone} (${segmentsUsed} segmento${segmentsUsed > 1 ? 's' : ''})`,
      }
    )

    if (deductError) {
      console.error('[SMS] Balance deduction RPC error:', deductError.message)
      // SMS was already sent — we log the error but don't fail
    } else if (deductResult && deductResult.length > 0 && !deductResult[0].success) {
      console.warn('[SMS] Balance deduction warning:', deductResult[0].error_message)
      // SMS was already sent — balance might go negative, which is acceptable
    }

    // 7. Emit Inngest event for delivery verification
    try {
      await (inngest.send as any)({
        name: 'sms/delivery.check',
        data: {
          smsMessageId: smsRecord.id,
          dispatchId: onurixResponse.id,
          workspaceId: ctx.workspaceId,
        },
      })
    } catch (inngestError) {
      console.error('[SMS] Failed to emit delivery check event:', inngestError)
      // Non-fatal: SMS was sent, delivery check is best-effort
    }

    // 8. Return success
    return {
      success: true,
      data: {
        smsMessageId: smsRecord.id,
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
