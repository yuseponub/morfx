// ============================================================================
// WhatsApp Channel Sender
// Wraps existing 360dialog API calls into the ChannelSender interface.
// Zero behavior change — same code path as before, just behind an interface.
// ============================================================================

import type { ChannelSender, ChannelSendResult } from './types'
import {
  sendTextMessage as send360Text,
  sendMediaMessage as send360Media,
} from '@/lib/whatsapp/api'

export const whatsappSender: ChannelSender = {
  async sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult> {
    const response = await send360Text(apiKey, to, text)
    const externalMessageId = response.messages?.[0]?.id
    return { success: true, externalMessageId }
  },

  async sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult> {
    const response = await send360Media(apiKey, to, 'image', imageUrl, caption)
    const externalMessageId = response.messages?.[0]?.id
    return { success: true, externalMessageId }
  },
}
