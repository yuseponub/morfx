// ============================================================================
// ManyChat Channel Senders
// Facebook Messenger: uses sendContent API directly
// Instagram: uses sendFlow + Dynamic Content (sendContent doesn't work for IG)
//
// Instagram flow:
//   1. Save reply to manychat_pending_replies table
//   2. Call sendFlow API to trigger a ManyChat Flow
//   3. The Flow's Dynamic Content block calls /api/manychat/dynamic-reply
//   4. Endpoint returns the pending reply in Dynamic Block v2 format
//   5. ManyChat sends it to the IG subscriber
// ============================================================================

import type { ChannelSender, ChannelSendResult } from './types'
import { sendText as mcSendText, sendImage as mcSendImage, sendFlow as mcSendFlow } from '@/lib/manychat/api'
import { createAdminClient } from '@/lib/supabase/admin'

// Flow namespace for Instagram reply flow in ManyChat
const IG_REPLY_FLOW_NS = process.env.MANYCHAT_IG_REPLY_FLOW_NS || 'content20260327155049_297156'

/**
 * Facebook Messenger sender — uses sendContent directly.
 */
export const manychatFacebookSender: ChannelSender = {
  async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
    try {
      await mcSendText(apiKey, to, text)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[manychat-sender:fb] sendText failed:', msg)
      return { success: false, error: msg }
    }
  },

  async sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult> {
    try {
      await mcSendImage(apiKey, to, imageUrl)
      if (caption) {
        await mcSendText(apiKey, to, caption)
      }
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[manychat-sender:fb] sendImage failed:', msg, { imageUrl, to })
      return { success: false, error: msg }
    }
  },
}

/**
 * Find workspace_id for a ManyChat subscriber phone identifier.
 */
async function findWorkspaceForSubscriber(phone: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('conversations')
    .select('workspace_id')
    .eq('phone', phone)
    .in('channel', ['instagram', 'facebook'])
    .limit(1)
    .maybeSingle()
  return data?.workspace_id || null
}

/**
 * Instagram sender — saves reply to DB then triggers Flow via sendFlow.
 * The 'to' parameter is the subscriber phone identifier (mc-{subscriberId}).
 */
export const manychatInstagramSender: ChannelSender = {
  async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
    try {
      const subscriberId = to.replace('mc-', '')

      const workspaceId = await findWorkspaceForSubscriber(to)
      if (!workspaceId) {
        console.error('[manychat-sender:ig] No conversation found for:', to)
        return { success: false, error: 'Conversation not found for IG subscriber' }
      }

      const supabase = createAdminClient()

      // Save pending reply
      const { error: insertError } = await supabase
        .from('manychat_pending_replies')
        .insert({
          workspace_id: workspaceId,
          subscriber_id: subscriberId,
          reply_text: text,
          status: 'pending',
        })

      if (insertError) {
        console.error('[manychat-sender:ig] Failed to save pending reply:', insertError.message)
        return { success: false, error: insertError.message }
      }

      // Trigger the IG reply flow
      await mcSendFlow(apiKey, subscriberId, IG_REPLY_FLOW_NS)

      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[manychat-sender:ig] sendText failed:', msg)
      return { success: false, error: msg }
    }
  },

  async sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult> {
    // Send image URL as text (ManyChat Dynamic Content doesn't support images easily)
    const text = caption ? `${caption}\n${imageUrl}` : imageUrl
    return this.sendText(apiKey, to, text)
  },
}

// Backward compat
export const manychatSender = manychatFacebookSender
