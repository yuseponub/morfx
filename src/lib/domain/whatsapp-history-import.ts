// ============================================================================
// Domain — WhatsApp History Import (standalone whatsapp-history-importer, Plan 01)
//
// Función domain NUEVA y única vía de escritura del importador de historiales
// (Etapa 2 de 2). Inserta contacto + conversación + mensajes históricos de un
// chat respaldado por Etapa 1, de forma:
//   - Idempotente (D-01): wamid sintético 'import:<chatId>:<idx>' + upsert
//     onConflict:'wamid' ignoreDuplicates → re-correr NO duplica.
//   - Sin triggers (Regla 6 / D-07): NO se reusa receiveMessage porque ese
//     camino dispara el emisor de mensaje-recibido + el match por palabra clave
//     y marca la conversación como no-leída. Aquí: insert directo + update
//     CONDICIONAL, sin ningún disparo de eventos.
//   - Merge archival silencioso (D-05): conversación creada-por-import →
//     is_read=true / unread_count=0 / last_*; conversación YA existente (viva) →
//     NO se toca su estado (solo se agregan los mensajes viejos al hilo).
//
// Regla 3: toda escritura pasa por createAdminClient dentro del domain y filtra
// por workspace_id. El CLI (Plan 02) hace TODA la transformación pura (clasificar,
// mapear, sintetizar wamid, parsear timestamp) y pasa filas listas; esta función
// solo hace get-or-create + write idempotente + update condicional.
//
// PROHIBIDO en este archivo (Regla 6): emisores de eventos de mensaje, match por
// palabra clave, colas de jobs, motores de agente, LLM, o envío de mensajes.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/utils/phone'
import { resolveOrCreateContact } from './contacts'
import type { DomainContext, DomainResult } from './types'

/** Fila de mensaje ya mapeada + clasificada por el CLI (pura, V1 siempre type='text'). */
export interface ImportHistoricalMessageRow {
  /** 'import:<chatId>:<idx>' — marcador de origen + llave de idempotencia (D-01). */
  wamid: string
  direction: 'inbound' | 'outbound'
  /** V1: siempre 'text' (los 11 tipos canónicos; media → placeholder en body). */
  type: 'text'
  body: string
  /** ISO (UTC). El CLI parsea el offset -05:00 del backup a instante UTC. */
  timestamp: string
  /** outbound histórico → 'read'; inbound → null (D-11). */
  status: 'read' | null
}

export interface ImportHistoricalChatParams {
  /** "+57..." sin normalizar; el domain normaliza una vez. */
  phone: string
  /** input del CLI — solo se usa en el INSERT de la conversación (D-10). */
  phoneNumberId: string
  /** pushname/nombre guardado; solo se usa en create del contacto (D-09, no pisa CRM). */
  contactName: string | null
  /** filas ya transformadas por el CLI. */
  messages: ImportHistoricalMessageRow[]
}

export interface ImportHistoricalChatResult {
  contactId: string
  /** true si el contacto se creó en esta corrida; false si ya existía (D-09). */
  contactCreated: boolean
  conversationId: string
  conversationCreated: boolean
  /** filas realmente nuevas (ignoreDuplicates retorna solo insertadas). */
  messagesInserted: number
  /** ya existían (re-corrida idempotente). */
  messagesDuplicated: number
}

/**
 * Inserta el historial de un chat (contacto + conversación + mensajes) de forma
 * idempotente y SIN disparar ningún trigger/agente/automatización (Regla 6).
 *
 * No lanza: cualquier error se devuelve como { success:false, error } para que el
 * CLT pueda contar por chat y continuar el batch (Pitfall 5 RESEARCH).
 */
export async function importHistoricalChat(
  ctx: DomainContext,
  params: ImportHistoricalChatParams
): Promise<DomainResult<ImportHistoricalChatResult>> {
  try {
    const supabase = createAdminClient()

    // 1. Contacto — name SOLO en create (D-09, no pisa datos CRM de un existente).
    const contact = await resolveOrCreateContact(ctx, {
      phone: params.phone,
      name: params.contactName ?? undefined,
    })
    if (!contact.success || !contact.data) {
      return { success: false, error: contact.error ?? 'No se pudo resolver el contacto' }
    }
    const contactId = contact.data.contactId
    const contactCreated = contact.data.created

    // 2. Normalizar phone UNA vez — para llavear la conversación con el mismo
    //    valor E.164 que guarda el contacto.
    const normPhone = normalizePhone(params.phone)
    if (!normPhone) {
      return { success: false, error: 'Numero de telefono invalido' }
    }

    // 3. get-or-create conversación por (workspace_id, phone, channel='whatsapp').
    //    phone_number_id NO participa en la unicidad → solo en el INSERT (D-10).
    let conversationId: string
    let conversationCreated = false
    // Snapshot de los campos denormalizados de una conversación YA existente (viva).
    // El trigger `messages_update_conversation` (AFTER INSERT ON messages) los pisa
    // por cada fila insertada (sin guard de timestamp) → al importar mensajes viejos
    // a una convo viva, dejaría last_*/unread/is_read apuntando a un mensaje histórico.
    // D-05 exige NO alterar el estado de la convo viva → snapshot aquí, restore en paso 5.
    let liveSnapshot: {
      last_message_at: string | null
      last_message_preview: string | null
      last_customer_message_at: string | null
      unread_count: number
      is_read: boolean
    } | null = null
    const CONVO_DENORM_COLS =
      'id, last_message_at, last_message_preview, last_customer_message_at, unread_count, is_read'

    const existing = await supabase
      .from('conversations')
      .select(CONVO_DENORM_COLS)
      .eq('workspace_id', ctx.workspaceId)
      .eq('phone', normPhone)
      .eq('channel', 'whatsapp')
      .maybeSingle()

    if (existing.error) {
      return { success: false, error: existing.error.message }
    }

    if (existing.data) {
      conversationId = existing.data.id
      liveSnapshot = {
        last_message_at: existing.data.last_message_at,
        last_message_preview: existing.data.last_message_preview,
        last_customer_message_at: existing.data.last_customer_message_at,
        unread_count: existing.data.unread_count,
        is_read: existing.data.is_read,
      }
    } else {
      const inserted = await supabase
        .from('conversations')
        .insert({
          workspace_id: ctx.workspaceId,
          phone: normPhone,
          phone_number_id: params.phoneNumberId,
          channel: 'whatsapp',
          status: 'active',
          contact_id: contactId,
          is_read: true,
          unread_count: 0,
        })
        .select('id')
        .single()

      if (inserted.error) {
        // Carrera: otra inserción ganó la unicidad → re-SELECT (D-10).
        if (inserted.error.code === '23505') {
          const retry = await supabase
            .from('conversations')
            .select(CONVO_DENORM_COLS)
            .eq('workspace_id', ctx.workspaceId)
            .eq('phone', normPhone)
            .eq('channel', 'whatsapp')
            .single()
          if (retry.error || !retry.data) {
            return {
              success: false,
              error: retry.error?.message ?? 'No se pudo resolver la conversacion tras carrera',
            }
          }
          conversationId = retry.data.id
          // La convo la creó otro proceso concurrente → tratarla como viva (preservar su estado).
          liveSnapshot = {
            last_message_at: retry.data.last_message_at,
            last_message_preview: retry.data.last_message_preview,
            last_customer_message_at: retry.data.last_customer_message_at,
            unread_count: retry.data.unread_count,
            is_read: retry.data.is_read,
          }
        } else {
          return { success: false, error: inserted.error.message }
        }
      } else {
        conversationId = inserted.data.id
        conversationCreated = true
      }
    }

    // 4. Mensajes — upsert idempotente por wamid (D-01). ignoreDuplicates hace que
    //    supabase-js retorne SOLO las filas insertadas → conteo gratis.
    const rows = params.messages.map((m) => ({
      conversation_id: conversationId,
      workspace_id: ctx.workspaceId,
      wamid: m.wamid,
      direction: m.direction,
      type: m.type,
      content: { body: m.body },
      status: m.status,
      timestamp: m.timestamp,
    }))

    let messagesInserted = 0
    if (rows.length > 0) {
      const upserted = await supabase
        .from('messages')
        .upsert(rows, { onConflict: 'wamid', ignoreDuplicates: true })
        .select('id')
      if (upserted.error) {
        return { success: false, error: upserted.error.message }
      }
      messagesInserted = upserted.data?.length ?? 0
    }
    const messagesDuplicated = rows.length - messagesInserted

    // 5. Reconciliación del estado denormalizado de la conversación (D-05).
    //    El trigger `messages_update_conversation` ya pisó last_*/unread/is_read por
    //    cada fila insertada (sin guard de timestamp). Hay que dejar el estado correcto:
    //
    //    a) Convo NUEVA-por-import → estado archival: last_* = datos del historial,
    //       is_read=true / unread=0 (no finge no-leídos).
    //    b) Convo VIVA existente → RESTAURAR el snapshot pre-import (deshacer el trigger):
    //       archival silencioso, no altera posición/no-leídos/preview de la convo real.
    if (conversationCreated && rows.length > 0) {
      // Comparación lexicográfica válida: todos los timestamps son ISO UTC (…Z).
      const lastMsg = params.messages.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
      const lastTs = lastMsg.timestamp
      const preview = lastMsg.body.slice(0, 100)
      const inboundTs = params.messages
        .filter((m) => m.direction === 'inbound')
        .map((m) => m.timestamp)
      const lastCustomerTs =
        inboundTs.length > 0 ? inboundTs.reduce((a, b) => (a > b ? a : b)) : null

      const updated = await supabase
        .from('conversations')
        .update({
          last_message_at: lastTs,
          last_message_preview: preview,
          last_customer_message_at: lastCustomerTs,
          is_read: true,
          unread_count: 0,
        })
        .eq('id', conversationId)
      if (updated.error) {
        return { success: false, error: updated.error.message }
      }
    } else if (!conversationCreated && messagesInserted > 0 && liveSnapshot) {
      // Convo viva: deshacer la mutación del trigger restaurando el snapshot exacto.
      const restored = await supabase
        .from('conversations')
        .update({
          last_message_at: liveSnapshot.last_message_at,
          last_message_preview: liveSnapshot.last_message_preview,
          last_customer_message_at: liveSnapshot.last_customer_message_at,
          unread_count: liveSnapshot.unread_count,
          is_read: liveSnapshot.is_read,
        })
        .eq('id', conversationId)
      if (restored.error) {
        return { success: false, error: restored.error.message }
      }
    }

    return {
      success: true,
      data: {
        contactId,
        contactCreated,
        conversationId,
        conversationCreated,
        messagesInserted,
        messagesDuplicated,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[domain/whatsapp-history-import] importHistoricalChat failed:', msg)
    return { success: false, error: msg }
  }
}
