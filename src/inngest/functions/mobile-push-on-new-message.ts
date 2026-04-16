// ============================================================================
// Mobile Push on New Inbound WhatsApp Message — Inngest Function
// Phase 43 Plan 13: Push Notifications
//
// ADDITIVE (Regla 6): this is a NEW function file. It does NOT modify any
// existing agent runner. It is registered alongside the whatsapp agent
// processor and subscribes to the SAME event (`agent/whatsapp.message_received`)
// — Inngest dispatches the event to both functions independently, so the
// existing agent behavior is untouched.
//
// Flow:
//   1. Event fires from webhook-handler after an inbound WhatsApp message
//      is stored in DB (only inbound — outbound messages do not fire this
//      event).
//   2. Load conversation + contact for display name.
//   3. Compute title = profile_name || contact name || phone.
//   4. Compute body = first 100 chars of messageContent, OR media placeholder.
//   5. sendPushToWorkspace best-effort (never throws).
//
// Best-effort: push failures are logged and swallowed so they never disrupt
// the triggering flow or Inngest retry counters.
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToWorkspace } from '@/lib/domain/push/send-push'

const MEDIA_BODY: Record<string, string> = {
  audio: '[Audio]',
  image: '[Imagen]',
  video: '[Video]',
  sticker: '[Sticker]',
  document: '[Documento]',
  location: '[Ubicacion]',
}

function truncateBody(text: string | null | undefined, max = 100): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1).trimEnd() + '…'
}

export const mobilePushOnNewMessage = inngest.createFunction(
  {
    id: 'mobile-push-on-new-message',
    name: 'Mobile Push — New Inbound Message',
    retries: 1,
    // Low concurrency guardrail — push fan-out is cheap but we don't need
    // to burst thousands at once.
    concurrency: [{ key: 'event.data.workspaceId', limit: 10 }],
  },
  { event: 'agent/whatsapp.message_received' },
  async ({ event, step }) => {
    const {
      conversationId,
      workspaceId,
      messageContent,
      messageType,
      phone,
    } = event.data

    await step.run('send-push', async () => {
      try {
        const supabase = createAdminClient()

        // Load conversation for display name (profile_name comes from WA
        // and is the best human-readable label we have for the sender).
        const { data: conv } = await supabase
          .from('conversations')
          .select('profile_name, phone')
          .eq('id', conversationId)
          .eq('workspace_id', workspaceId)
          .single()

        const title =
          conv?.profile_name ||
          conv?.phone ||
          phone ||
          'Nuevo mensaje'

        const type = (messageType ?? 'text').toLowerCase()
        const body =
          type === 'text'
            ? truncateBody(messageContent) || '[Mensaje]'
            : MEDIA_BODY[type] ?? '[Mensaje]'

        await sendPushToWorkspace({
          workspaceId,
          title,
          body,
          data: {
            conversationId,
            type: 'new_message',
          },
        })

        return { pushed: true }
      } catch (err) {
        // Best-effort: never let push errors escape. Log and swallow so
        // Inngest does not retry and we don't impact the agent flow.
        console.error(
          '[mobile-push-on-new-message] push send failed',
          { conversationId, workspaceId, err }
        )
        return { pushed: false, error: String(err) }
      }
    })
  }
)

export const mobilePushFunctions = [mobilePushOnNewMessage]
