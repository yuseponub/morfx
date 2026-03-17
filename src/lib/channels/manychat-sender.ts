// ============================================================================
// ManyChat Channel Sender
// Implements ChannelSender for Facebook Messenger and Instagram DMs.
// Uses ManyChat sendContent API. The 'to' parameter is the subscriber_id.
// ============================================================================

import type { ChannelSender, ChannelSendResult } from './types'
import { sendText as mcSendText, sendImage as mcSendImage } from '@/lib/manychat/api'

export const manychatSender: ChannelSender = {
  async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
    try {
      await mcSendText(apiKey, to, text)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[manychat-sender] sendText failed:', msg)
      return { success: false, error: msg }
    }
  },

  async sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult> {
    try {
      // Send image first
      await mcSendImage(apiKey, to, imageUrl)

      // ManyChat doesn't support image+caption in one message
      // Send caption as a separate text message if provided
      if (caption) {
        await mcSendText(apiKey, to, caption)
      }

      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[manychat-sender] sendImage failed:', msg, { imageUrl, to })
      return { success: false, error: msg }
    }
  },
}
