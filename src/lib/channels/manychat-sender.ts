// ============================================================================
// ManyChat Channel Senders
// Facebook Messenger: uses sendContent API directly
// Instagram: uses custom field + tag trigger (sendContent doesn't work for IG)
//
// Instagram flow:
//   1. Set custom field "respuesta" on subscriber with the reply text
//   2. Remove __api_reply__ tag (in case already applied)
//   3. Apply __api_reply__ tag → triggers ManyChat Flow
//   4. Flow sends {{respuesta}} to subscriber via Instagram
// ============================================================================

import type { ChannelSender, ChannelSendResult } from './types'
import {
  sendText as mcSendText,
  sendImage as mcSendImage,
  addTag as mcAddTag,
  removeTag as mcRemoveTag,
  setCustomField as mcSetCustomField,
} from '@/lib/manychat/api'

// ManyChat tag ID for triggering IG reply flow
const IG_REPLY_TAG_ID = Number(process.env.MANYCHAT_IG_REPLY_TAG_ID) || 84237825

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
 * Instagram sender — sets custom field then applies tag to trigger Flow.
 * The 'to' parameter may be "mc-{subscriberId}" or just "{subscriberId}".
 */
export const manychatInstagramSender: ChannelSender = {
  async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
    try {
      const subscriberId = to.replace('mc-', '')

      // 1. Set the reply text as custom field
      await mcSetCustomField(apiKey, subscriberId, 'respuesta', text)

      // 2. Remove tag first (must transition off→on to trigger flow)
      try { await mcRemoveTag(apiKey, subscriberId, IG_REPLY_TAG_ID) } catch { /* ignore */ }

      // 3. Apply tag → triggers the ManyChat Flow that sends {{respuesta}}
      await mcAddTag(apiKey, subscriberId, IG_REPLY_TAG_ID)

      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[manychat-sender:ig] sendText failed:', msg)
      return { success: false, error: msg }
    }
  },

  async sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult> {
    // Send image URL as text (IG Flow only supports text via custom field)
    const text = caption ? `${caption}\n${imageUrl}` : imageUrl
    return this.sendText(apiKey, to, text)
  },
}

// Backward compat
export const manychatSender = manychatFacebookSender
