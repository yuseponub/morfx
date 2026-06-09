// ============================================================================
// Standalone whatsapp-history-importer — Plan 02 (T2)
// Tests de los helpers puros de mapeo contra los tipos REALES del backup.
// Correr: npx vitest run scripts/lib/whatsapp-history/map.test.ts
// ============================================================================

import { describe, it, expect } from 'vitest'
import {
  classifyMessage,
  synthWamid,
  parseBackupTimestamp,
  mapMessage,
  buildChatPayload,
} from './map'
import type { BackupMessage, ChatBackup } from '../../../robot-whatsapp-reader/src/types'

function msg(partial: Partial<BackupMessage>): BackupMessage {
  return {
    fromMe: false,
    timestamp: '2026-05-28 15:18:19 -05:00',
    text: null,
    type: 'chat',
    ...partial,
  }
}

describe('classifyMessage (RESEARCH §3.2)', () => {
  it('chat con texto → text', () => {
    expect(classifyMessage(msg({ type: 'chat', text: 'Hola' }))).toBe('text')
  })

  it('interactive sin texto (note placeholder) → skip (skippedNoText)', () => {
    expect(classifyMessage(msg({ type: 'interactive', text: null, note: '<interactive omitido>' }))).toBe('skip')
  })

  it('interactive con texto → text', () => {
    expect(classifyMessage(msg({ type: 'interactive', text: 'Opción 1' }))).toBe('text')
  })

  it('automated_greeting_message sin texto → skip', () => {
    expect(classifyMessage(msg({ type: 'automated_greeting_message', text: null }))).toBe('skip')
  })

  it('image / ptt / document (text null, note) → media', () => {
    expect(classifyMessage(msg({ type: 'image', text: null, note: '<imagen omitida>' }))).toBe('media')
    expect(classifyMessage(msg({ type: 'ptt', text: null, note: '<nota de voz omitida>' }))).toBe('media')
    expect(classifyMessage(msg({ type: 'document', text: null, note: '<documento omitido>' }))).toBe('media')
  })

  it('tipos system → skip', () => {
    for (const t of ['e2e_notification', 'notification_template', 'protocol', 'revoked', 'gp2', 'unknown', 'ciphertext']) {
      expect(classifyMessage(msg({ type: t, text: null }))).toBe('skip')
    }
  })

  it('texto sólo-espacios → skip (no es texto legible)', () => {
    expect(classifyMessage(msg({ type: 'chat', text: '   ' }))).toBe('skip')
  })
})

describe('synthWamid (D-01)', () => {
  it('determinista import:<chatId>:<idx>', () => {
    expect(synthWamid('573162814531@c.us', 0)).toBe('import:573162814531@c.us:0')
    expect(synthWamid('abc', 7)).toBe('import:abc:7')
  })
})

describe('parseBackupTimestamp (§3.5)', () => {
  it('"2026-05-28 15:18:19 -05:00" → instante 20:18:19Z', () => {
    expect(parseBackupTimestamp('2026-05-28 15:18:19 -05:00')).toBe('2026-05-28T20:18:19.000Z')
  })

  it('cadena inválida → null', () => {
    expect(parseBackupTimestamp('no-es-fecha')).toBeNull()
    expect(parseBackupTimestamp('')).toBeNull()
  })
})

describe('mapMessage', () => {
  it('text → fila con body=text, direction según fromMe, status outbound=read', () => {
    const r = mapMessage(msg({ type: 'chat', text: 'Buenas', fromMe: true }), 'chatA', 3)
    expect(r).toEqual({
      wamid: 'import:chatA:3',
      direction: 'outbound',
      type: 'text',
      body: 'Buenas',
      timestamp: '2026-05-28T20:18:19.000Z',
      status: 'read',
    })
  })

  it('inbound text → status null', () => {
    const r = mapMessage(msg({ type: 'chat', text: 'Hola', fromMe: false }), 'chatA', 0)
    expect(r?.direction).toBe('inbound')
    expect(r?.status).toBeNull()
  })

  it('media → body=note', () => {
    const r = mapMessage(msg({ type: 'image', text: null, note: '<imagen omitida>', fromMe: false }), 'chatA', 1)
    expect(r?.type).toBe('text')
    expect(r?.body).toBe('<imagen omitida>')
  })

  it('skip → null', () => {
    expect(mapMessage(msg({ type: 'e2e_notification', text: null }), 'chatA', 2)).toBeNull()
  })
})

describe('buildChatPayload', () => {
  it('counts cuadran y rows.length = text+media; phone = +number', () => {
    const chat: ChatBackup = {
      schemaVersion: 1,
      chatId: 'chatA@c.us',
      number: '573001234567',
      numberMissing: false,
      contactName: 'Juan',
      archived: false,
      business: { number: '573202067077', name: 'Varix' },
      messageCount: 6,
      scrapedAt: '2026-06-09T00:00:00.000Z',
      messages: [
        msg({ type: 'chat', text: 'Hola', fromMe: false }),                                  // text
        msg({ type: 'chat', text: 'Buenas', fromMe: true }),                                  // text
        msg({ type: 'image', text: null, note: '<imagen omitida>', fromMe: true }),           // media
        msg({ type: 'interactive', text: null, note: '<interactive omitido>', fromMe: false }), // skippedNoText
        msg({ type: 'e2e_notification', text: null, fromMe: false }),                          // skippedSystem
        msg({ type: 'revoked', text: null, fromMe: false }),                                   // skippedSystem
      ],
    }

    const p = buildChatPayload(chat)
    expect(p.phone).toBe('+573001234567')
    expect(p.contactName).toBe('Juan')
    expect(p.counts).toEqual({ text: 2, media: 1, skippedSystem: 2, skippedNoText: 1 })
    expect(p.rows).toHaveLength(3)
    // reconciliación: text+media+skippedSystem+skippedNoText = messages.length
    const total = p.counts.text + p.counts.media + p.counts.skippedSystem + p.counts.skippedNoText
    expect(total).toBe(chat.messages.length)
    // wamids deterministas con índice original del array
    expect(p.rows[0].wamid).toBe('import:chatA@c.us:0')
    expect(p.rows[2].wamid).toBe('import:chatA@c.us:2') // la imagen está en idx 2
  })
})
