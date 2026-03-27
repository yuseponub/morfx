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
 * Instagram sender — saves reply to DB then triggers Flow via sendFlow.
 * The 'to' parameter is the subscriber phone identifier (mc-{subscriberId}).
 * We extract the raw subscriberId from it.
 */
export const manychatInstagramSender: ChannelSender = {
  async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
    try {
      const subscriberId = to.replace('mc-', '')
      const supabase = createAdminClient()

      // Get workspace_id from conversation
      const { data: conv } = await supabase
        .from('conversations')
        .select('workspace_id')
        .eq('phone', to)
        .eq('channel', 'instagram')
        .limit(1)
        .single()

      if (!conv) {
        return { success: false, error: 'Conversation not found for IG subscriber' }
      }

      // Save pending reply
      const { error: insertError } = await supabase
        .from('manychat_pending_replies')
        .insert({
          workspace_id: conv.workspace_id,
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
    // For now, send image URL as text (ManyChat Dynamic Content doesn't support images easily)
    const text = caption ? `${caption}\n${imageUrl}` : imageUrl
    return this.sendText(apiKey, to, text)
  },
}

// Backward compat — default to Facebook sender
export const manychatSender = manychatFacebookSender
