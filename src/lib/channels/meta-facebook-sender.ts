// ============================================================================
// Meta Facebook Messenger Sender (Graph Send API — meta_direct provider)
// Thin module the DOMAIN branch (Plan 04) calls directly to send over the Meta
// Messenger Send API when workspace.messenger_provider === 'meta_direct'.
//
// Mirrors the structure of meta-whatsapp-sender.ts — same creds-object shape +
// ChannelSendResult unwrap — but adapted for Messenger:
//   - creds: { accessToken, pageId } (a Page token + Page ID, NOT an apiKey string).
//   - unwrap reads response.message_id (Messenger returns { message_id, recipient_id },
//     NOT { messages: [{ id }] }).
//   - image has no native caption: send the image, then a FOLLOW-UP text when a
//     caption is present (image-as-followup parity).
//   - PSID is a STRING, forwarded verbatim (never Number-coerced — Pitfall 5).
//   - the only emittable message tag is HUMAN_AGENT (out-of-window sends).
//
// IMPORTANT (Regla 6 + 40-PATTERNS.md):
//   - This module is NOT registered in the channel-keyed `senders` map in registry.ts
//     (only WhatsApp is mapped there). The domain branch imports it directly, exactly
//     like metaWhatsappSender. Facebook is meta_direct-only (legacy transport removed).
// ============================================================================

import type { ChannelSendResult } from './types'
import {
  sendMessengerText,
  sendMessengerImage,
  sendMessengerAttachment,
  type MessengerTag,
} from '@/lib/meta/messenger-api'

/** Meta Page credentials resolved from workspace context — NEVER from input (T-40-02-02). */
export interface MetaPageCreds {
  accessToken: string
  pageId: string
}

interface SendResponse {
  message_id?: string
}

function unwrap(response: SendResponse): ChannelSendResult {
  return { success: true, externalMessageId: response.message_id }
}

export const metaFacebookSender = {
  /**
   * Send a Messenger text. Forwards the PSID string verbatim + optional HUMAN_AGENT
   * tag to sendMessengerText, then unwraps message_id → externalMessageId.
   */
  async sendText(
    creds: MetaPageCreds,
    psid: string,
    text: string,
    tag?: MessengerTag
  ): Promise<ChannelSendResult> {
    const response = await sendMessengerText(creds.accessToken, creds.pageId, psid, text, tag)
    return unwrap(response)
  },

  /**
   * Send a Messenger image, then a FOLLOW-UP text when a caption is present
   * (Messenger image attachments have no caption field — image-as-followup parity).
   * The same tag is forwarded to both sends.
   */
  async sendImage(
    creds: MetaPageCreds,
    psid: string,
    imageUrl: string,
    caption?: string,
    tag?: MessengerTag
  ): Promise<ChannelSendResult> {
    const response = await sendMessengerImage(creds.accessToken, creds.pageId, psid, imageUrl, tag)
    if (caption) {
      await sendMessengerText(creds.accessToken, creds.pageId, psid, caption, tag)
    }
    return unwrap(response)
  },

  /**
   * Send any media type over Messenger (40-08 follow-up — was image-only). Dispatches
   * by our Message['type']: image → sendImage (with caption follow-up); audio/video/
   * document → sendMessengerAttachment (document maps to Meta's `file` attachment type),
   * then a caption follow-up text when present. The same tag is forwarded to all sends.
   */
  async sendMedia(
    creds: MetaPageCreds,
    psid: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    tag?: MessengerTag
  ): Promise<ChannelSendResult> {
    if (mediaType === 'image') {
      return this.sendImage(creds, psid, mediaUrl, caption, tag)
    }
    // 'document' → Meta's `file` attachment type; audio/video map 1:1.
    const attachmentType: 'audio' | 'video' | 'file' =
      mediaType === 'document' ? 'file' : mediaType
    const response = await sendMessengerAttachment(
      creds.accessToken,
      creds.pageId,
      psid,
      attachmentType,
      mediaUrl,
      tag
    )
    if (caption) {
      await sendMessengerText(creds.accessToken, creds.pageId, psid, caption, tag)
    }
    return unwrap(response)
  },
}
