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
      return { success: false, error: msg }
    }
  },

  async sendImage(apiKey: string, to: string, imageUrl: string, _caption?: string): Promise<ChannelSendResult> {
    try {
      // ManyChat image API doesn't support captions in the same message
      // If caption is needed, send image + text separately
      await mcSendImage(apiKey, to, imageUrl)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  },
}
