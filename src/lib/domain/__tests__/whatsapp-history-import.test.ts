// ============================================================================
// Standalone whatsapp-history-importer — Plan 01 (T3)
// Tests unitarios para importHistoricalChat (inserción histórica idempotente
// SIN triggers — Regla 6 / D-07).
//
// Cubre:
//   1. Idempotencia (D-01): re-correr (upsert retorna []) → inserted=0,
//      duplicated=N.
//   2. Regla 6 (no-triggers): el módulo NO importa emisores/inngest/runner
//      (gate documental por lectura del fuente + reforzado por grep en T4).
//   3. Merge D-05 — convo NUEVA: conversationCreated=true → UPDATE con
//      is_read=true / unread_count=0 / last_*.
//   4. Merge D-05 — convo EXISTENTE: maybeSingle retorna id →
//      conversationCreated=false → CERO update sobre conversations (archival
//      silencioso, no finge actividad nueva).
//   5. Mapeo de filas: type='text', content.body presente, status verbatim,
//      wamid verbatim, onConflict:'wamid' ignoreDuplicates.
//   6. Contacto no pisa: resolveOrCreateContact recibe {phone, name}; su id se usa.
//
// Mock pattern: createAdminClient → from(table) builders + resolveOrCreateContact
// stub. El test NO toca DB. normalizePhone corre real (puro, determinista).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// --- Mutable result slots (reset por test) ---------------------------------
let convoMaybeSingleResult: { data: unknown; error: unknown } = { data: null, error: null }
let convoInsertSingleResult: { data: unknown; error: unknown } = { data: { id: 'convo-new' }, error: null }
let messagesUpsertResult: { data: unknown; error: unknown } = { data: [{ id: 'm1' }, { id: 'm2' }], error: null }

// --- conversations.select() builder: .eq().eq().eq().maybeSingle()/.single() ---
const convoSelectMaybeSingle = vi.fn(() => Promise.resolve(convoMaybeSingleResult))
const convoSelectSingle = vi.fn(() => Promise.resolve(convoMaybeSingleResult))
function makeConvoSelectBuilder() {
  const b: Record<string, unknown> = {}
  b.eq = vi.fn(() => b)
  b.maybeSingle = convoSelectMaybeSingle
  b.single = convoSelectSingle
  return b
}
const convoSelect = vi.fn(() => makeConvoSelectBuilder())

// --- conversations.insert({...}).select('id').single() ---------------------
const convoInsertSingle = vi.fn(() => Promise.resolve(convoInsertSingleResult))
const convoInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: convoInsertSingle })) }))

// --- conversations.update({...}).eq('id', x) -------------------------------
const convoUpdateEq = vi.fn(() => Promise.resolve({ error: null }))
const convoUpdate = vi.fn(() => ({ eq: convoUpdateEq }))

// --- messages.upsert(rows, opts).select('id') ------------------------------
const messagesUpsertSelect = vi.fn(() => Promise.resolve(messagesUpsertResult))
const messagesUpsert = vi.fn(() => ({ select: messagesUpsertSelect }))

const fromMock = vi.fn((table: string) => {
  if (table === 'conversations') return { select: convoSelect, insert: convoInsert, update: convoUpdate }
  if (table === 'messages') return { upsert: messagesUpsert }
  throw new Error(`unexpected table ${table}`)
})

const createAdminClientMock = vi.fn(() => ({ from: fromMock }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

// resolveOrCreateContact stub — devuelve un contacto fijo; spy para assert args.
const resolveOrCreateContactMock = vi.fn(async () => ({
  success: true,
  data: { contactId: 'contact-1', created: true },
}))
vi.mock('@/lib/domain/contacts', () => ({
  resolveOrCreateContact: (...args: unknown[]) => resolveOrCreateContactMock(...(args as [])),
}))

// Importar DESPUES de los vi.mock (hoisting de vitest).
import { importHistoricalChat } from '@/lib/domain/whatsapp-history-import'
import type { ImportHistoricalChatParams } from '@/lib/domain/whatsapp-history-import'
import type { DomainContext } from '@/lib/domain/types'

const ctx: DomainContext = { workspaceId: 'ws-1', source: 'history_import' }

function baseParams(): ImportHistoricalChatParams {
  return {
    phone: '+573001234567',
    phoneNumberId: 'pnid-123',
    contactName: 'Cliente Test',
    messages: [
      { wamid: 'import:chatA:0', direction: 'inbound', type: 'text', body: 'Hola', timestamp: '2026-05-28T20:18:19.000Z', status: null },
      { wamid: 'import:chatA:1', direction: 'outbound', type: 'text', body: 'Buenas, en que le ayudo', timestamp: '2026-05-28T20:19:00.000Z', status: 'read' },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  convoMaybeSingleResult = { data: null, error: null }
  convoInsertSingleResult = { data: { id: 'convo-new' }, error: null }
  messagesUpsertResult = { data: [{ id: 'm1' }, { id: 'm2' }], error: null }
})

describe('importHistoricalChat (Plan 01)', () => {
  it('idempotencia (D-01): re-corrida → inserted=0, duplicated=N (upsert retorna [])', async () => {
    // Convo ya existe + upsert retorna [] (todas las filas ya estaban).
    convoMaybeSingleResult = { data: { id: 'convo-existing' }, error: null }
    messagesUpsertResult = { data: [], error: null }

    const res = await importHistoricalChat(ctx, baseParams())

    expect(res.success).toBe(true)
    expect(res.data?.messagesInserted).toBe(0)
    expect(res.data?.messagesDuplicated).toBe(2)
    expect(res.data?.conversationCreated).toBe(false)
  })

  it('Regla 6 (no-triggers): el fuente NO importa emisores/inngest/runner', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/domain/whatsapp-history-import.ts'),
      'utf8',
    )
    // Ignorar la línea de comentario "PROHIBIDO ..." que menciona los nombres.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).not.toMatch(/emitWhatsApp|checkKeyword|inngest|runner|streamText|generateText/)
  })

  it('merge D-05 — convo NUEVA: conversationCreated=true → UPDATE is_read/unread/last_*', async () => {
    convoMaybeSingleResult = { data: null, error: null } // no existe → insert
    convoInsertSingleResult = { data: { id: 'convo-new' }, error: null }

    const res = await importHistoricalChat(ctx, baseParams())

    expect(res.success).toBe(true)
    expect(res.data?.conversationCreated).toBe(true)
    // Se ejecutó el UPDATE condicional sobre conversations.
    expect(convoUpdate).toHaveBeenCalledTimes(1)
    const payload = convoUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(payload.is_read).toBe(true)
    expect(payload.unread_count).toBe(0)
    expect(payload.last_message_at).toBe('2026-05-28T20:19:00.000Z') // max ts
    expect(payload.last_customer_message_at).toBe('2026-05-28T20:18:19.000Z') // max inbound ts
    expect(payload.last_message_preview).toBe('Buenas, en que le ayudo')
  })

  it('merge D-05 — convo EXISTENTE: conversationCreated=false → CERO update (archival silencioso)', async () => {
    convoMaybeSingleResult = { data: { id: 'convo-existing' }, error: null }

    const res = await importHistoricalChat(ctx, baseParams())

    expect(res.success).toBe(true)
    expect(res.data?.conversationCreated).toBe(false)
    // NUNCA se toca la conversación viva (Pitfall 4).
    expect(convoUpdate).not.toHaveBeenCalled()
    expect(convoInsert).not.toHaveBeenCalled()
  })

  it('mapeo de filas: type=text, content.body, status verbatim, wamid verbatim, onConflict wamid', async () => {
    await importHistoricalChat(ctx, baseParams())

    expect(messagesUpsert).toHaveBeenCalledTimes(1)
    const [rows, opts] = messagesUpsert.mock.calls[0] as [Array<Record<string, unknown>>, Record<string, unknown>]
    expect(opts).toEqual({ onConflict: 'wamid', ignoreDuplicates: true })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      conversation_id: 'convo-new',
      workspace_id: 'ws-1',
      wamid: 'import:chatA:0',
      direction: 'inbound',
      type: 'text',
      content: { body: 'Hola' },
      status: null,
      timestamp: '2026-05-28T20:18:19.000Z',
    })
    expect(rows[1]).toMatchObject({ wamid: 'import:chatA:1', direction: 'outbound', status: 'read', content: { body: 'Buenas, en que le ayudo' } })
  })

  it('contacto no pisa: resolveOrCreateContact recibe {phone, name}; su id se usa', async () => {
    const res = await importHistoricalChat(ctx, baseParams())

    expect(resolveOrCreateContactMock).toHaveBeenCalledTimes(1)
    const [, params] = resolveOrCreateContactMock.mock.calls[0] as [unknown, { phone: string; name?: string }]
    expect(params.phone).toBe('+573001234567')
    expect(params.name).toBe('Cliente Test')
    expect(res.data?.contactId).toBe('contact-1')
    expect(res.data?.contactCreated).toBe(true) // stub devuelve created:true → propagado
  })

  it('contacto inválido: resolveOrCreateContact falla → {success:false} sin escribir mensajes', async () => {
    resolveOrCreateContactMock.mockResolvedValueOnce({ success: false, data: undefined as never })

    const res = await importHistoricalChat(ctx, baseParams())

    expect(res.success).toBe(false)
    expect(messagesUpsert).not.toHaveBeenCalled()
  })
})
