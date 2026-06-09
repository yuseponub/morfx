// ============================================================================
// Meta Instagram Direct Sender (Graph Send API — meta_direct provider)
// Thin module the DOMAIN branch (Plan 41-04) calls directly to send over the Meta
// Instagram Send API when workspace.instagram_provider === 'meta_direct'.
//
// Mirrors meta-facebook-sender.ts file-for-file (IG rides the SAME Page token +
// Page ID as FB Messenger) — same creds-object shape + ChannelSendResult unwrap:
//   - creds: { accessToken, pageId } (a Page token + Page ID, NOT an apiKey string).
//   - unwrap reads response.message_id (IG returns { message_id, recipient_id },
//     NOT { messages: [{ id }] }).
//   - image has no native caption: send the image, then a FOLLOW-UP text when a
//     caption is present (image-as-followup parity with metaFacebookSender).
//   - IGSID is a STRING, forwarded verbatim (never Number-coerced — Pitfall 3).
//   - the only emittable message tag is HUMAN_AGENT (out-of-window sends).
//
// IMPORTANT (Regla 6 + 41-PATTERNS.md):
//   - This module is NOT registered in the channel-keyed `senders` map in registry.ts
//     (only WhatsApp is mapped there). The domain branch imports it directly, exactly
//     like metaFacebookSender / metaWhatsappSender. Instagram is meta_direct-only
//     (legacy transport removed).
// ============================================================================

import type { ChannelSendResult } from './types'
import {
  sendInstagramText,
  sendInstagramImage,
  sendInstagramAttachment,
  type InstagramTag,
} from '@/lib/meta/instagram-api'

/** Meta Page credentials resolved from workspace context — NEVER from input (T-41-02-02). */
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

export const metaInstagramSender = {
  /**
   * Send an Instagram Direct text. Forwards the IGSID string verbatim + optional
   * HUMAN_AGENT tag to sendInstagramText, then unwraps message_id → externalMessageId.
   */
  async sendText(
    creds: MetaPageCreds,
    igsid: string,
    text: string,
    tag?: InstagramTag
  ): Promise<ChannelSendResult> {
    const response = await sendInstagramText(creds.accessToken, creds.pageId, igsid, text, tag)
    return unwrap(response)
  },

  /**
   * Send an Instagram Direct image, then a FOLLOW-UP text when a caption is present
   * (IG image attachments have no caption field — image-as-followup parity with
   * metaFacebookSender). The same tag is forwarded to both sends.
   */
  async sendImage(
    creds: MetaPageCreds,
    igsid: string,
    imageUrl: string,
    caption?: string,
    tag?: InstagramTag
  ): Promise<ChannelSendResult> {
    const response = await sendInstagramImage(creds.accessToken, creds.pageId, igsid, imageUrl, tag)
    if (caption) {
      await sendInstagramText(creds.accessToken, creds.pageId, igsid, caption, tag)
    }
    return unwrap(response)
  },

  /**
   * Send any media type over Instagram Direct. Dispatches by our Message['type']:
   * image → sendImage (with caption follow-up); audio/video/document →
   * sendInstagramAttachment (document maps to Meta's `file` attachment type),
   * then a caption follow-up text when present. The same tag is forwarded to all sends.
   */
  async sendMedia(
    creds: MetaPageCreds,
    igsid: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    tag?: InstagramTag
  ): Promise<ChannelSendResult> {
    if (mediaType === 'image') {
      return this.sendImage(creds, igsid, mediaUrl, caption, tag)
    }
    // 'document' → Meta's `file` attachment type; audio/video map 1:1.
    const attachmentType: 'image' | 'video' | 'audio' | 'file' =
      mediaType === 'document' ? 'file' : mediaType
    const response = await sendInstagramAttachment(
      creds.accessToken,
      creds.pageId,
      igsid,
      attachmentType,
      mediaUrl,
      tag
    )
    if (caption) {
      await sendInstagramText(creds.accessToken, creds.pageId, igsid, caption, tag)
    }
    return unwrap(response)
  },
}
