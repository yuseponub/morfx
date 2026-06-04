/**
 * Provider-branch chokepoint contract for the domain interactive send (D-06 / D-03).
 * Phase 999.1 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * RED until 999.1-02 (domain sendInteractiveMessage) lands.
 *
 * Contract under test: `sendInteractiveMessage(ctx, params)` from `@/lib/domain/messages`.
 *   Mirrors messages-provider.test.ts EXACTLY (same chokepoint pattern). domain/messages.ts
 *   reads `workspaces.whatsapp_provider` ONCE and branches (Regla 3):
 *     - '360dialog' (DEFAULT):
 *         buttons → send360Buttons(apiKey, phone, body, buttons, header, footer) byte-identical.
 *                   resolveByWorkspace / metaWhatsappSender NEVER touched (Regla 6 parity).
 *         list    → result.success === false, error /lista no soportada/i (D-03 — no list in 360dialog).
 *     - 'meta_direct':
 *         buttons → resolveByWorkspace(ctx.workspaceId, 'whatsapp') ONCE (T-39-02) →
 *                   metaWhatsappSender.sendButtons(creds, ...).
 *         list    → metaWhatsappSender.sendList(creds, body, buttonLabel, sections, ...).
 *
 * This test is EXPECTED to be RED now (Plan 02 has not exported sendInteractiveMessage).
 * The 4 existing tests (meta-whatsapp-sender 3/3 + messages-provider) stay GREEN (Regla 6).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — copy the messages-provider.test.ts scaffold VERBATIM, with 3 deltas:
//   + sendButtonMessage on @/lib/whatsapp/api
//   + sendButtons / sendList on @/lib/channels/meta-whatsapp-sender
// ---------------------------------------------------------------------------

// 360dialog send edge (the byte-identical arm we must never disturb).
vi.mock('@/lib/whatsapp/api', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
  sendButtonMessage: vi.fn(), // ◄── delta: 360dialog buttons (D-03 reuse)
}))

// Meta credential resolver — keyed by workspaceId, never from input (T-39-02).
vi.mock('@/lib/meta/credentials', () => ({
  resolveByWorkspace: vi.fn(),
}))

// New Meta sender — add sendButtons/sendList alongside the existing methods.
vi.mock('@/lib/channels/meta-whatsapp-sender', () => ({
  metaWhatsappSender: {
    sendText: vi.fn(),
    sendImage: vi.fn(),
    sendButtons: vi.fn(), // ◄── delta
    sendList: vi.fn(), // ◄── delta
  },
}))

// FB/IG registry — must stay untouched on the whatsapp path.
vi.mock('@/lib/channels/registry', () => ({
  getChannelSender: vi.fn(),
}))

// Automation trigger emitter — irrelevant to send (outbound emits nothing) but imported by module.
vi.mock('@/lib/automations/trigger-emitter', () => ({
  emitWhatsAppMessageReceived: vi.fn(),
  emitWhatsAppKeywordMatch: vi.fn(),
}))

// Supabase admin client — controls `workspaces.whatsapp_provider` and stubs the insert/update tail.
let currentProvider: '360dialog' | 'meta_direct' = '360dialog'

vi.mock('@/lib/supabase/admin', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn(chain)
    builder.eq = vi.fn(chain)
    builder.update = vi.fn(chain)
    builder.insert = vi.fn(() => builder)
    builder.single = vi.fn(async () => {
      if (table === 'workspaces') {
        return { data: { whatsapp_provider: currentProvider }, error: null }
      }
      if (table === 'messages') {
        return { data: { id: 'msg_db_1' }, error: null }
      }
      return { data: null, error: null }
    })
    builder.then = undefined
    return builder
  }

  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => makeBuilder(table)),
    })),
  }
})

import { sendInteractiveMessage } from '@/lib/domain/messages'
import { sendButtonMessage as send360Buttons } from '@/lib/whatsapp/api'
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { metaWhatsappSender } from '@/lib/channels/meta-whatsapp-sender'

const mockSend360Buttons = send360Buttons as ReturnType<typeof vi.fn>
const mockResolveByWorkspace = resolveByWorkspace as ReturnType<typeof vi.fn>
const mockMetaSendButtons = metaWhatsappSender.sendButtons as ReturnType<typeof vi.fn>
const mockMetaSendList = metaWhatsappSender.sendList as ReturnType<typeof vi.fn>

const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const ctx = { workspaceId: WS_ID, source: 'webhook' } as const

const PHONE = '+573001234567'
const BODY = 'Elige una opción'
const HEADER = 'Encabezado'
const FOOTER = 'Pie'
const API_KEY = 'D360_API_KEY_360'
const BUTTONS = [
  { id: 'b1', title: 'Sí' },
  { id: 'b2', title: 'No' },
]
const BUTTON_LABEL = 'Ver opciones'
const SECTIONS = [
  { title: 'Sección 1', rows: [{ id: 'r1', title: 'Opción 1' }] },
]

const buttonsParams = {
  interactiveType: 'buttons' as const,
  apiKey: API_KEY,
  contactPhone: PHONE,
  body: BODY,
  buttons: BUTTONS,
  header: HEADER,
  footer: FOOTER,
  conversationId: 'conv_1',
}

const listParams = {
  interactiveType: 'list' as const,
  apiKey: API_KEY,
  contactPhone: PHONE,
  body: BODY,
  buttonLabel: BUTTON_LABEL,
  sections: SECTIONS,
  header: HEADER,
  footer: FOOTER,
  conversationId: 'conv_1',
}

beforeEach(() => {
  mockSend360Buttons.mockResolvedValue({ messages: [{ id: 'wamid.360' }] })
  mockMetaSendButtons.mockResolvedValue({ success: true, externalMessageId: 'wamid.meta' })
  mockMetaSendList.mockResolvedValue({ success: true, externalMessageId: 'wamid.meta.list' })
  mockResolveByWorkspace.mockResolvedValue({
    accessToken: 'BISUAT_decrypted',
    phoneNumberId: '1134593926408063',
  })
})

afterEach(() => {
  vi.clearAllMocks()
  currentProvider = '360dialog'
})

describe('sendInteractiveMessage — whatsapp_provider=360dialog (Regla 6 parity, DEFAULT)', () => {
  it('buttons → calls send360Buttons with the same args; Meta path NEVER touched', async () => {
    currentProvider = '360dialog'

    await sendInteractiveMessage(ctx, buttonsParams)

    expect(mockSend360Buttons).toHaveBeenCalledWith(API_KEY, PHONE, BODY, BUTTONS, HEADER, FOOTER)
    expect(mockResolveByWorkspace).not.toHaveBeenCalled()
    expect(mockMetaSendButtons).not.toHaveBeenCalled()
    expect(mockMetaSendList).not.toHaveBeenCalled()
  })

  it('list → returns a clear "lista no soportada" error; no sender called', async () => {
    currentProvider = '360dialog'

    const result = await sendInteractiveMessage(ctx, listParams)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/lista no soportada/i)
    expect(mockSend360Buttons).not.toHaveBeenCalled()
    expect(mockMetaSendButtons).not.toHaveBeenCalled()
    expect(mockMetaSendList).not.toHaveBeenCalled()
  })
})

describe('sendInteractiveMessage — whatsapp_provider=meta_direct', () => {
  it('buttons → resolves creds from ctx.workspaceId ONCE and routes through metaWhatsappSender.sendButtons', async () => {
    currentProvider = 'meta_direct'

    await sendInteractiveMessage(ctx, buttonsParams)

    expect(mockResolveByWorkspace).toHaveBeenCalledTimes(1)
    expect(mockResolveByWorkspace).toHaveBeenCalledWith(WS_ID, 'whatsapp')

    expect(mockMetaSendButtons).toHaveBeenCalledTimes(1)
    const credsArg = mockMetaSendButtons.mock.calls[0][0] as Record<string, unknown>
    expect(credsArg).toMatchObject({
      accessToken: 'BISUAT_decrypted',
      phoneNumberId: '1134593926408063',
    })
    expect(mockSend360Buttons).not.toHaveBeenCalled()
  })

  it('list → routes through metaWhatsappSender.sendList with creds + body + buttonLabel + sections', async () => {
    currentProvider = 'meta_direct'

    await sendInteractiveMessage(ctx, listParams)

    expect(mockMetaSendList).toHaveBeenCalledTimes(1)
    const args = mockMetaSendList.mock.calls[0]
    const credsArg = args[0] as Record<string, unknown>
    expect(credsArg).toMatchObject({
      accessToken: 'BISUAT_decrypted',
      phoneNumberId: '1134593926408063',
    })
    // body + buttonLabel + sections are present among the call args (positional or otherwise).
    expect(args).toContain(BODY)
    expect(args).toContain(BUTTON_LABEL)
    expect(args).toContainEqual(SECTIONS)
    expect(mockSend360Buttons).not.toHaveBeenCalled()
  })
})
