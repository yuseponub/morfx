/**
 * Meta Cloud API send-edge payload contracts (WA-01 text, WA-03 template, WA-07 read receipt).
 * Phase 39 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contracts under test (all in `@/lib/meta/api`, against Graph v22.0 `/{phoneNumberId}/messages`):
 *   sendWhatsAppText(token, pnid, to, body)          — EXISTS today (WA-01). Asserted GREEN to pin shape.
 *   sendWhatsAppTemplate(token, pnid, to, name, lang, components?) — EXISTS today (WA-03). GREEN to pin shape.
 *   markWhatsAppRead(token, pnid, wamid)             — NEW (WA-07, Plan 02/03). RED until shipped.
 *
 * All payloads verified in 39-RESEARCH.md Code Examples §1 (text), §3 (template), §8 (read receipt).
 * We stub global fetch (the real metaRequest uses fetch) and inspect the exact body/URL on the wire.
 *
 * RED STATE: markWhatsAppRead is not exported from meta/api.ts yet (Plan 02/03 adds it). Its
 * describe block is RED (import is undefined → call throws). The text/template blocks are GREEN —
 * they pin the existing contract so a later refactor cannot silently change the wire shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { META_BASE_URL } from '@/lib/meta/constants'
import {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  // RED: markWhatsAppRead is added to meta/api.ts in a later wave (WA-07, §8).
  // @ts-expect-error — not yet exported; import pins the contract for Plan 02/03.
  markWhatsAppRead,
} from '@/lib/meta/api'

const TOKEN = 'BISUAT_decrypted'
const PNID = '1134593926408063'
const TO = '+573001234567'

let fetchMock: ReturnType<typeof vi.fn>

function lastCall() {
  return fetchMock.mock.calls.at(-1)!
}
function lastUrl(): string {
  return String(lastCall()[0])
}
function lastBody(): Record<string, unknown> {
  const init = lastCall()[1] as RequestInit
  return JSON.parse(init.body as string)
}
function lastAuthHeader(): string {
  const init = lastCall()[1] as RequestInit
  const headers = (init.headers ?? {}) as Record<string, string>
  return headers['Authorization'] ?? ''
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [{ id: 'wamid.meta.1' }] }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('sendWhatsAppText (WA-01) — §1', () => {
  it('POSTs the canonical text body to /{phoneNumberId}/messages with Bearer auth', async () => {
    await sendWhatsAppText(TOKEN, PNID, TO, 'hola mundo')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PNID}/messages`)
    expect((lastCall()[1] as RequestInit).method).toBe('POST')
    expect(lastAuthHeader()).toBe(`Bearer ${TOKEN}`)
    expect(lastBody()).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: TO,
      type: 'text',
      text: { body: 'hola mundo' },
    })
  })
})

describe('sendWhatsAppTemplate (WA-03) — §3', () => {
  it('builds a template body with name + language.code + components', async () => {
    const components = [
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://x/y.jpg' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Jose' }] },
    ]

    await sendWhatsAppTemplate(TOKEN, PNID, TO, 'confirmacion_orden', 'es', components)

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PNID}/messages`)
    expect(lastBody()).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: TO,
      type: 'template',
      template: {
        name: 'confirmacion_orden',
        language: { code: 'es' },
        components,
      },
    })
  })
})

describe('markWhatsAppRead (WA-07) — §8 [RED until Plan 02/03]', () => {
  it('POSTs { status:read, message_id } to /{phoneNumberId}/messages', async () => {
    await markWhatsAppRead(TOKEN, PNID, 'wamid.inbound.42')

    expect(lastUrl()).toBe(`${META_BASE_URL}/${PNID}/messages`)
    expect(lastBody()).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.inbound.42',
    })
  })
})
