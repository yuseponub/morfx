// ============================================================================
// ManyChat Channel Senders
// Implements ChannelSender for Facebook Messenger and Instagram DMs.
// Uses ManyChat sendContent API. The 'to' parameter is the subscriber_id.
// Facebook uses /fb/ endpoint, Instagram uses /ig/ endpoint.
// ============================================================================

import type { ChannelSender, ChannelSendResult } from './types'
import { sendText as mcSendText, sendImage as mcSendImage } from '@/lib/manychat/api'
import type { ManyChatChannel } from '@/lib/manychat/api'

function createManyChatSender(mcChannel: ManyChatChannel): ChannelSender {
  return {
    async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
      try {
        await mcSendText(apiKey, to, text, mcChannel)
        return { success: true }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`[manychat-sender:${mcChannel}] sendText failed:`, msg)
        return { success: false, error: msg }
      }
    },

    async sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult> {
      try {
        await mcSendImage(apiKey, to, imageUrl, mcChannel)

        // ManyChat doesn't support image+caption in one message
        if (caption) {
          await mcSendText(apiKey, to, caption, mcChannel)
        }

        return { success: true }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`[manychat-sender:${mcChannel}] sendImage failed:`, msg, { imageUrl, to })
        return { success: false, error: msg }
      }
    },
  }
}

export const manychatFacebookSender = createManyChatSender('fb')
export const manychatInstagramSender = createManyChatSender('ig')

// Backward compat export
export const manychatSender = manychatFacebookSender
