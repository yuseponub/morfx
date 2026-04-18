// ============================================================================
// Domain Layer — Idempotent Message Send (mobile API wrapper)
//
// Thin wrapper around domain/messages.ts send functions that enforces
// idempotency on behalf of the mobile outbox drain. The mobile client
// generates a stable `idempotencyKey` per outbound message at enqueue
// time and resends it unchanged on every retry (network flip, app kill,
// 5xx on server, etc.). This module:
//
//   1. SELECTs messages WHERE content->>'idempotency_key' = $key
//      AND workspace_id = $ws — returns the existing row if found
//      (without re-sending to WhatsApp).
//   2. Otherwise resolves conversation + channel + API key, sends via the
//      existing domain.sendTextMessage / sendMediaMessage / sendTemplate,
//      then writes `idempotency_key` into the message's `content` JSONB so
//      future retries short-circuit.
//
// Why JSONB and not a new column: the messages table has no
// idempotency_key column today. A migration would force a Regla-5 pause
// (apply in prod before deploy). JSONB is zero-migration, no schema churn,
// and the read path (GET /api/mobile/.../messages) already surfaces
// content.idempotency_key to the mobile cache (see Plan 08 route handler).
//
// The lookup uses PostgREST JSONB containment (`content @> { key: value }`)
// which works against the existing GIN index on messages.content when one
// exists, and falls back to a sequential scan otherwise — cost is bounded
// because the workspace_id filter narrows to a single tenant.
// ============================================================================

import { differenceInHours } from 'date-fns'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  sendMediaMessage as domainSendMediaMessage,
  sendTemplateMessage as domainSendTemplateMessage,
  sendTextMessage as domainSendTextMessage,
} from './messages'
import type { DomainContext, DomainResult } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendIdempotentParams {
  conversationId: string
  idempotencyKey: string
  body: string | null
  mediaKey: string | null
  mediaType: 'image' | 'audio' | null
  templateName?: string
  templateVariables?: Record<string, string>
}

export interface SendIdempotentMessageRow {
  id: string
  conversation_id: string
  workspace_id: string
  direction: 'inbound' | 'outbound'
  type: string
  content: Record<string, unknown>
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null
  media_url: string | null
  media_mime_type: string | null
  created_at: string
}

export interface SendIdempotentResult {
  message: SendIdempotentMessageRow
  reused: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findExistingMessage(
  workspaceId: string,
  idempotencyKey: string
): Promise<SendIdempotentMessageRow | null> {
  const admin = createAdminClient()
  // JSONB containment lookup — matches rows whose `content` JSONB contains
  // `{ idempotency_key: <key> }`. Safe because the workspace filter narrows
  // to a single tenant and the outbox already uses UUIDs (low collision).
  const { data, error } = await admin
    .from('messages')
    .select(
      `
      id,
      conversation_id,
      workspace_id,
      direction,
      type,
      content,
      status,
      media_url,
      media_mime_type,
      created_at
    `
    )
    .eq('workspace_id', workspaceId)
    .contains('content', { idempotency_key: idempotencyKey })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(
      '[domain/send-idempotent] idempotency lookup failed:',
      error.message
    )
    return null
  }
  return (data as unknown as SendIdempotentMessageRow | null) ?? null
}

async function loadMessageById(
  workspaceId: string,
  messageId: string
): Promise<SendIdempotentMessageRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('messages')
    .select(
      `
      id,
      conversation_id,
      workspace_id,
      direction,
      type,
      content,
      status,
      media_url,
      media_mime_type,
      created_at
    `
    )
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .single()
  if (error) {
    console.error(
      '[domain/send-idempotent] loadMessageById failed:',
      error.message
    )
    return null
  }
  return data as unknown as SendIdempotentMessageRow
}

async function persistIdempotencyKey(
  workspaceId: string,
  messageId: string,
  idempotencyKey: string
): Promise<void> {
  const admin = createAdminClient()
  // Read-modify-write of the JSONB content field. We read first so we can
  // merge with whatever the domain send wrote (body, caption, etc.).
  const { data: existing } = await admin
    .from('messages')
    .select('content')
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)
    .single()

  const current =
    existing?.content && typeof existing.content === 'object'
      ? (existing.content as Record<string, unknown>)
      : {}

  const merged = { ...current, idempotency_key: idempotencyKey }

  const { error } = await admin
    .from('messages')
    .update({ content: merged })
    .eq('id', messageId)
    .eq('workspace_id', workspaceId)

  if (error) {
    // Non-fatal: the message was sent and stored; we just failed to persist
    // the idempotency key. A retry will cause a duplicate send — log loudly
    // so this can be monitored in production.
    console.error(
      '[domain/send-idempotent] persistIdempotencyKey failed:',
      error.message
    )
  }
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function sendMessageIdempotent(
  ctx: DomainContext,
  params: SendIdempotentParams
): Promise<DomainResult<SendIdempotentResult>> {
  // 1. Short-circuit on existing idempotent row.
  const existing = await findExistingMessage(ctx.workspaceId, params.idempotencyKey)
  if (existing) {
    return {
      success: true,
      data: { message: existing, reused: true },
    }
  }

  const admin = createAdminClient()

  // 2. Resolve conversation (workspace-scoped — prevents cross-workspace writes).
  const { data: conversation, error: convError } = await admin
    .from('conversations')
    .select(
      'id, phone, phone_number_id, last_customer_message_at, status, channel, external_subscriber_id'
    )
    .eq('id', params.conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (convError || !conversation) {
    return { success: false, error: 'Conversacion no encontrada' }
  }

  const channel = (conversation.channel || 'whatsapp') as
    | 'whatsapp'
    | 'facebook'
    | 'instagram'

  // 3. 24h-window check for WhatsApp (non-template). FB/IG skip this.
  //    Templates bypass the window (that's their whole purpose).
  const isTemplate =
    typeof params.templateName === 'string' && params.templateName.length > 0

  if (channel === 'whatsapp' && !isTemplate) {
    if (!conversation.last_customer_message_at) {
      return { success: false, error: 'Ventana de 24h cerrada. Usa un template.' }
    }
    const hours = differenceInHours(
      new Date(),
      new Date(conversation.last_customer_message_at)
    )
    if (hours >= 24) {
      return { success: false, error: 'Ventana de 24h cerrada. Usa un template.' }
    }
  }

  // 4. Resolve API key.
  const { data: workspaceSettings } = await admin
    .from('workspaces')
    .select('settings')
    .eq('id', ctx.workspaceId)
    .single()

  const settings =
    (workspaceSettings?.settings as Record<string, unknown> | undefined) ?? {}

  let apiKey: string | undefined
  if (channel === 'facebook' || channel === 'instagram') {
    apiKey = settings.manychat_api_key as string | undefined
    if (!apiKey) return { success: false, error: 'API key de ManyChat no configurada' }
  } else {
    apiKey =
      (settings.whatsapp_api_key as string | undefined) ||
      process.env.WHATSAPP_API_KEY
    if (!apiKey) return { success: false, error: 'API key de WhatsApp no configurada' }
  }

  const recipientId =
    channel !== 'whatsapp' && conversation.external_subscriber_id
      ? conversation.external_subscriber_id
      : conversation.phone

  // 5. Dispatch to the right domain send function.
  let messageId: string | null = null

  if (isTemplate) {
    // Templates: build components from the variables map ({"1":"Foo","2":"Bar"}).
    const components = params.templateVariables
      ? buildTemplateBodyComponents(params.templateVariables)
      : undefined
    const result = await domainSendTemplateMessage(ctx, {
      conversationId: params.conversationId,
      contactPhone: recipientId,
      templateName: params.templateName as string,
      templateLanguage: 'es',
      components,
      renderedText: params.body ?? undefined,
      apiKey,
    })
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Error al enviar template' }
    }
    messageId = result.data.messageId
  } else if (params.mediaKey && params.mediaType) {
    // Media send: derive the public URL from the mediaKey, then hand off to
    // the media domain function which dispatches to WhatsApp / ManyChat.
    const mediaUrl = resolveMediaPublicUrl(params.mediaKey)
    const mediaType = mapMobileMediaType(params.mediaType)
    const result = await domainSendMediaMessage(ctx, {
      conversationId: params.conversationId,
      contactPhone: recipientId,
      mediaUrl,
      mediaType,
      caption: params.body ?? undefined,
      apiKey,
      channel,
    })
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Error al enviar archivo' }
    }
    messageId = result.data.messageId
  } else if (params.body) {
    const result = await domainSendTextMessage(ctx, {
      conversationId: params.conversationId,
      contactPhone: recipientId,
      messageBody: params.body,
      apiKey,
      channel,
    })
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Error al enviar mensaje' }
    }
    messageId = result.data.messageId
  } else {
    return { success: false, error: 'Mensaje vacio — body o mediaKey requerido' }
  }

  if (!messageId) {
    return { success: false, error: 'Mensaje enviado pero sin id asignado' }
  }

  // 6. Persist the idempotency key into the message's content JSONB.
  await persistIdempotencyKey(ctx.workspaceId, messageId, params.idempotencyKey)

  // 7. Unarchive the conversation if needed (adapter concern preserved from
  //    the web server actions).
  if (conversation.status === 'archived') {
    await admin
      .from('conversations')
      .update({ status: 'active' })
      .eq('id', params.conversationId)
      .eq('workspace_id', ctx.workspaceId)
  }

  // 8. Return the fresh row so the API route can surface it to the mobile
  //    client (the mobile cache reconciles by server_id + idempotency_key).
  const row = await loadMessageById(ctx.workspaceId, messageId)
  if (!row) {
    return { success: false, error: 'Mensaje enviado pero no se pudo leer' }
  }

  return { success: true, data: { message: row, reused: false } }
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function mapMobileMediaType(
  t: 'image' | 'audio'
): 'image' | 'audio' | 'video' | 'document' {
  // Mobile send path only exposes image + audio in Plan 09. Video + document
  // remain for future plans; the domain function accepts the full union.
  return t
}

/**
 * Derive the public URL of a media object from its storage key. Plan 14 may
 * swap this for a signed read URL if the bucket goes private.
 */
function resolveMediaPublicUrl(mediaKey: string): string {
  const admin = createAdminClient()
  const { data } = admin.storage.from('whatsapp-media').getPublicUrl(mediaKey)
  return data.publicUrl
}

/**
 * Convert `{ "1": "foo", "2": "bar" }` into the 360dialog body components
 * shape. Kept here (instead of reusing the web server action's version) to
 * avoid importing from the 'use server' module.
 */
function buildTemplateBodyComponents(
  vars: Record<string, string>
): Array<{
  type: 'body'
  parameters: Array<{ type: 'text'; text: string }>
}> {
  const keys = Object.keys(vars).sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)
  )
  if (keys.length === 0) return []
  return [
    {
      type: 'body',
      parameters: keys.map((k) => ({ type: 'text' as const, text: vars[k] ?? '' })),
    },
  ]
}
