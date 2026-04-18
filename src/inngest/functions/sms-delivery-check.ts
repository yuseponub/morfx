// ============================================================================
// SMS Delivery Check — Inngest Function
// Standalone: SMS Module — Plan 02
//
// Verifies SMS delivery status via Onurix API using 2-stage polling:
//   1. Wait 10s, check status
//   2. If not delivered, wait 50s more (total ~60s), check again
//   3. Update sms_messages with final status (delivered | failed)
//
// Maximum 2 Onurix API calls per SMS — no infinite polling.
// Uses step.sleep for durable delays (survives restarts).
// ============================================================================

import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkOnurixStatus } from '@/lib/sms/client'

export const smsDeliveryCheck = inngest.createFunction(
  { id: 'sms-delivery-check', retries: 1 },
  { event: 'sms/delivery.check' as any },
  async ({ event, step }) => {
    const { smsMessageId, dispatchId, workspaceId } = event.data as {
      smsMessageId: string
      dispatchId: string
      workspaceId: string
    }

    // --- Stage 1: Wait 10s, then check ---
    await step.sleep('wait-10s', '10s')

    const firstCheck = await step.run('check-1', async () => {
      const statusItems = await checkOnurixStatus(dispatchId)
      return statusItems.length > 0 ? statusItems[0] : null
    })

    if (firstCheck && firstCheck.state === 'Enviado') {
      // Delivered on first check
      await step.run('update-delivered', async () => {
        const supabase = createAdminClient()
        await supabase
          .from('sms_messages')
          .update({
            status: 'delivered',
            delivery_checked_at: new Date().toISOString(),
            provider_state_raw: firstCheck.state,
          })
          .eq('id', smsMessageId)
          .eq('workspace_id', workspaceId)
      })

      return { status: 'delivered', checks: 1 }
    }

    // --- Stage 2: Wait 50s more (total ~60s from send), then check again ---
    await step.sleep('wait-50s', '50s')

    const secondCheck = await step.run('check-2', async () => {
      const statusItems = await checkOnurixStatus(dispatchId)
      return statusItems.length > 0 ? statusItems[0] : null
    })

    const finalStatus = secondCheck && secondCheck.state === 'Enviado'
      ? 'delivered'
      : 'failed'

    await step.run('update-final', async () => {
      const supabase = createAdminClient()
      await supabase
        .from('sms_messages')
        .update({
          status: finalStatus,
          delivery_checked_at: new Date().toISOString(),
          provider_state_raw: secondCheck?.state ?? firstCheck?.state ?? null,
        })
        .eq('id', smsMessageId)
        .eq('workspace_id', workspaceId)
    })

    return { status: finalStatus, checks: 2 }
  }
)

// Export as array for consistent registration pattern
export const smsDeliveryFunctions = [smsDeliveryCheck]
