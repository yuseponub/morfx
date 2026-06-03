// ============================================================================
// Meta WhatsApp Sender (Cloud API)
// Thin module the DOMAIN provider branch (Plan 04) calls directly to send over
// the Meta Cloud API. Mirrors the structure of whatsapp-sender.ts (the 360dialog
// ChannelSender) — same `.messages?.[0]?.id` → ChannelSendResult unwrap — but takes
// a `{ accessToken, phoneNumberId }` creds object instead of an `apiKey` string
// (D-02b / 39-PATTERNS.md KEY DESIGN NOTE).
//
// IMPORTANT (Regla 6 + 39-PATTERNS.md KEY DESIGN NOTE):
//   - This module is NOT registered in the channel-keyed `senders` map in registry.ts
//     (that map is keyed by ChannelType, not by provider). The domain branch imports it
//     directly when workspace.whatsapp_provider === 'meta_direct'.
//   - whatsapp-sender.ts (the 360dialog path) is left byte-identical.
//
// Interactive clamps mirror the proven 360dialog `sendButtonMessage` guards
// (whatsapp/api.ts:192-232) per RESEARCH §4-5:
//   - reply buttons: ≤3 buttons, title ≤20 chars
//   - list: ≤10 sections, row title ≤24 chars
// ============================================================================

import type { ChannelSendResult } from './types'
import {
  sendWhatsAppText,
  sendWhatsAppMedia,
  sendWhatsAppTemplate,
  sendWhatsAppInteractive,
  markWhatsAppRead,
} from '@/lib/meta/api'

/** Meta credentials resolved from workspace context — NEVER from input (T-39-02). */
export interface MetaCreds {
  accessToken: string
  phoneNumberId: string
}

interface SendResponse {
  messages?: Array<{ id: string }>
}

function unwrap(response: SendResponse): ChannelSendResult {
  const externalMessageId = response.messages?.[0]?.id
  return { success: true, externalMessageId }
}

export const metaWhatsappSender = {
  async sendText(creds: MetaCreds, to: string, text: string): Promise<ChannelSendResult> {
    const response = await sendWhatsAppText(creds.accessToken, creds.phoneNumberId, to, text)
    return unwrap(response)
  },

  async sendImage(
    creds: MetaCreds,
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<ChannelSendResult> {
    const response = await sendWhatsAppMedia(
      creds.accessToken,
      creds.phoneNumberId,
      to,
      'image',
      imageUrl,
      caption
    )
    return unwrap(response)
  },

  async sendMedia(
    creds: MetaCreds,
    to: string,
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
    link: string,
    caption?: string,
    filename?: string
  ): Promise<ChannelSendResult> {
    const response = await sendWhatsAppMedia(
      creds.accessToken,
      creds.phoneNumberId,
      to,
      type,
      link,
      caption,
      filename
    )
    return unwrap(response)
  },

  async sendTemplate(
    creds: MetaCreds,
    to: string,
    templateName: string,
    languageCode: string = 'es',
    components?: unknown[]
  ): Promise<ChannelSendResult> {
    const response = (await sendWhatsAppTemplate(
      creds.accessToken,
      creds.phoneNumberId,
      to,
      templateName,
      languageCode,
      components
    )) as SendResponse
    return unwrap(response)
  },

  /**
   * Send interactive reply buttons. Clamps to Meta limits BEFORE send (T-39-05):
   * ≤3 buttons (`.slice(0,3)`), title ≤20 chars (`.slice(0,20)`).
   */
  async sendButtons(
    creds: MetaCreds,
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: string,
    footer?: string
  ): Promise<ChannelSendResult> {
    const interactive: Record<string, unknown> = {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((btn) => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title.slice(0, 20),
          },
        })),
      },
    }

    if (header) interactive.header = { type: 'text', text: header }
    if (footer) interactive.footer = { text: footer }

    const response = (await sendWhatsAppInteractive(
      creds.accessToken,
      creds.phoneNumberId,
      to,
      interactive
    )) as SendResponse
    return unwrap(response)
  },

  /**
   * Send an interactive list. Clamps to Meta limits BEFORE send (T-39-05):
   * ≤10 sections (`.slice(0,10)`), row title ≤24 chars (`.slice(0,24)`),
   * menu button label ≤20 chars.
   */
  async sendList(
    creds: MetaCreds,
    to: string,
    body: string,
    buttonLabel: string,
    sections: Array<{
      title: string
      rows: Array<{ id: string; title: string; description?: string }>
    }>,
    header?: string,
    footer?: string
  ): Promise<ChannelSendResult> {
    const interactive: Record<string, unknown> = {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: sections.slice(0, 10).map((section) => ({
          title: section.title,
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title.slice(0, 24),
            ...(row.description ? { description: row.description } : {}),
          })),
        })),
      },
    }

    if (header) interactive.header = { type: 'text', text: header }
    if (footer) interactive.footer = { text: footer }

    const response = (await sendWhatsAppInteractive(
      creds.accessToken,
      creds.phoneNumberId,
      to,
      interactive
    )) as SendResponse
    return unwrap(response)
  },

  /** Send a read receipt for an inbound message (WA-07). */
  async sendRead(creds: MetaCreds, wamid: string): Promise<ChannelSendResult> {
    await markWhatsAppRead(creds.accessToken, creds.phoneNumberId, wamid)
    return { success: true }
  },
}
