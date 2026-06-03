/**
 * metaWhatsappSender interactive-builder limits (WA-04) + ChannelSender-shaped contract.
 * Phase 39 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contract under test: `metaWhatsappSender` from `@/lib/channels/meta-whatsapp-sender` (NEW, Plan 02).
 *   Per 39-PATTERNS.md it is a thin module the DOMAIN branch calls (NOT registered in the
 *   channel-keyed `senders` map) and it takes `{ accessToken, phoneNumberId }` — NOT `apiKey`.
 *   Interactive clamps mirror the proven 360dialog `sendButtonMessage` guards (RESEARCH §4-5):
 *     - reply buttons: max 3 (`.slice(0,3)`), button title max 20 chars (`.slice(0,20)`)
 *     - list: max 10 sections, row title max 24 chars
 *
 * RED STATE: the module does not exist until Plan 02 — `await import(...)` rejects with
 * module-not-found, which is the intended Wave 0 RED. Each test imports lazily so a missing
 * module produces a clear per-test failure rather than a whole-file collection crash.
 *
 * The underlying meta/api helper (sendWhatsAppInteractive) is mocked so the test inspects the
 * interactive object the sender builds, not a live Graph call.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/meta/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/meta/api')>()
  return {
    ...actual,
    metaRequest: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.x' }] }),
    // RED-tolerant: this helper is added in Plan 02; mocking it lets the sender be tested in isolation.
    sendWhatsAppInteractive: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.int' }] }),
    sendWhatsAppText: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.t' }] }),
    sendWhatsAppMedia: vi.fn().mockResolvedValue({ messages: [{ id: 'wamid.m' }] }),
  }
})

const CREDS = { accessToken: 'BISUAT_decrypted', phoneNumberId: '1134593926408063' }
const TO = '+573001234567'

afterEach(() => {
  vi.clearAllMocks()
})

describe('metaWhatsappSender shape (D-02b / RESEARCH Pattern 1 note)', () => {
  it('exposes a ChannelSender-shaped module that takes creds {accessToken, phoneNumberId} (NOT apiKey)', async () => {
    const { metaWhatsappSender } = await import('@/lib/channels/meta-whatsapp-sender')
    expect(typeof metaWhatsappSender.sendText).toBe('function')
    expect(typeof metaWhatsappSender.sendImage).toBe('function')

    // sendText takes the creds object as the first arg (not an apiKey string).
    await metaWhatsappSender.sendText(CREDS, TO, 'hola')
    const api = await import('@/lib/meta/api')
    expect(api.sendWhatsAppText).toHaveBeenCalledWith(
      CREDS.accessToken,
      CREDS.phoneNumberId,
      TO,
      'hola'
    )
  })
})

describe('interactive reply buttons (WA-04) — clamp to ≤3 buttons, title ≤20 chars (§4)', () => {
  it('slices to at most 3 buttons and truncates each title to 20 chars', async () => {
    const { metaWhatsappSender } = await import('@/lib/channels/meta-whatsapp-sender')
    const api = await import('@/lib/meta/api')

    await metaWhatsappSender.sendButtons(CREDS, TO, 'Elige:', [
      { id: 'b1', title: 'Sí' },
      { id: 'b2', title: 'No' },
      { id: 'b3', title: 'Tal vez más tarde por favor' }, // > 20 chars
      { id: 'b4', title: 'Cuarto (debe descartarse)' }, // 4th button — dropped
    ])

    const interactive = (api.sendWhatsAppInteractive as ReturnType<typeof vi.fn>).mock.calls.at(-1)![3] as {
      type: string
      action: { buttons: Array<{ reply: { id: string; title: string } }> }
    }
    expect(interactive.type).toBe('button')
    expect(interactive.action.buttons).toHaveLength(3)
    expect(interactive.action.buttons[2].reply.title.length).toBeLessThanOrEqual(20)
  })
})

describe('interactive list (WA-04) — ≤10 sections, row title ≤24 chars (§5)', () => {
  it('slices to at most 10 sections and truncates row titles to 24 chars', async () => {
    const { metaWhatsappSender } = await import('@/lib/channels/meta-whatsapp-sender')
    const api = await import('@/lib/meta/api')

    const sections = Array.from({ length: 12 }, (_, i) => ({
      title: `Sección ${i}`,
      rows: [{ id: `r${i}`, title: 'Un título de fila demasiado largo para Meta' }], // > 24 chars
    }))

    await metaWhatsappSender.sendList(CREDS, TO, 'Menú:', 'Ver opciones', sections)

    const interactive = (api.sendWhatsAppInteractive as ReturnType<typeof vi.fn>).mock.calls.at(-1)![3] as {
      type: string
      action: { sections: Array<{ rows: Array<{ title: string }> }> }
    }
    expect(interactive.type).toBe('list')
    expect(interactive.action.sections.length).toBeLessThanOrEqual(10)
    expect(interactive.action.sections[0].rows[0].title.length).toBeLessThanOrEqual(24)
  })
})
