/**
 * Provider-branch + Regla 6 parity contract for the domain send chokepoint (MIG-03 / D-02).
 * Phase 39 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contract under test: `sendTextMessage(ctx, params)` from `@/lib/domain/messages`.
 *   Per RESEARCH Pattern 1 + 39-PATTERNS.md "THE CHOKEPOINT", domain/messages.ts is the
 *   SINGLE provider-decision site. It must read `workspaces.whatsapp_provider` and branch:
 *     - '360dialog' (DEFAULT) → send360Text(apiKey, ...) byte-identical (Regla 6, first-class
 *       parity assertion). resolveByWorkspace / metaWhatsappSender are NEVER touched.
 *     - 'meta_direct'         → resolveByWorkspace(ctx.workspaceId, 'whatsapp') → creds →
 *       metaWhatsappSender.sendText(creds, ...). send360Text is NEVER touched. Creds come from
 *       the resolver keyed by ctx.workspaceId, NEVER from input (V4 access control, T-39-02).
 *
 * RED STATE / Plan 04 dependency:
 *   - The '360dialog' parity test passes TODAY (the existing arm already calls send360Text and
 *     never resolves Meta creds) — it is the byte-identical guard that Plan 04 must NOT break.
 *   - The 'meta_direct' tests are RED until Plan 04 adds the branch (today domain/messages.ts has
 *     no `whatsapp_provider` read, so even a meta_direct workspace falls through to send360Text).
 *   metaWhatsappSender (channels/meta-whatsapp-sender.ts) and resolveByWorkspace are MOCKED so the
 *   suite runs RED on assertion, not on a module-load crash (mirrors the Phase 38 hmac.test.ts
 *   reference approach — assert the contract, not the import error).
 *
 * Threat coverage:
 *   T-39-02 (Tampering): meta_direct arm resolves creds from ctx.workspaceId via resolveByWorkspace,
 *   never from any input field — encodes the 131047 fix + V4 access control for Plan 04.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — every external dependency of the domain send path is observable.
// ---------------------------------------------------------------------------

// 360dialog send edge (the byte-identical arm we must never disturb).
vi.mock('@/lib/whatsapp/api', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
}))

// Meta credential resolver — keyed by workspaceId, never from input (T-39-02).
vi.mock('@/lib/meta/credentials', () => ({
  resolveByWorkspace: vi.fn(),
}))

// New Meta sender (built in a later wave) — mocked so import never crashes the suite.
vi.mock('@/lib/channels/meta-whatsapp-sender', () => ({
  metaWhatsappSender: {
    sendText: vi.fn(),
    sendImage: vi.fn(),
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
  // A chainable query-builder stub. `.single()` returns the provider row for workspaces,
  // and an inserted message row for messages; updates resolve to no-op.
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
    // conversations update returns a thenable that resolves
    builder.then = undefined
    return builder
  }

  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => makeBuilder(table)),
    })),
  }
})

import { sendTextMessage } from '@/lib/domain/messages'
import { sendTextMessage as send360Text } from '@/lib/whatsapp/api'
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { metaWhatsappSender } from '@/lib/channels/meta-whatsapp-sender'

const mockSend360 = send360Text as ReturnType<typeof vi.fn>
const mockResolveByWorkspace = resolveByWorkspace as ReturnType<typeof vi.fn>
const mockMetaSendText = metaWhatsappSender.sendText as ReturnType<typeof vi.fn>

const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const ctx = { workspaceId: WS_ID } as { workspaceId: string }

const baseParams = {
  conversationId: 'conv_1',
  contactPhone: '+573001234567',
  messageBody: 'hola',
  apiKey: 'D360_API_KEY_360',
  channel: 'whatsapp' as const,
}

beforeEach(() => {
  mockSend360.mockResolvedValue({ messages: [{ id: 'wamid.360' }] })
  mockMetaSendText.mockResolvedValue({ success: true, externalMessageId: 'wamid.meta' })
  mockResolveByWorkspace.mockResolvedValue({
    accessToken: 'BISUAT_decrypted',
    phoneNumberId: '1134593926408063',
    wabaId: 'WABA_1',
  })
})

afterEach(() => {
  vi.clearAllMocks()
  currentProvider = '360dialog'
})

describe('sendTextMessage provider branch — whatsapp_provider=360dialog (Regla 6 parity, DEFAULT)', () => {
  it('calls the 360dialog send360Text arm with the same args it receives today', async () => {
    currentProvider = '360dialog'

    await sendTextMessage(ctx, baseParams)

    expect(mockSend360).toHaveBeenCalledTimes(1)
    expect(mockSend360).toHaveBeenCalledWith(
      baseParams.apiKey,
      baseParams.contactPhone,
      baseParams.messageBody
    )
  })

  it('NEVER touches the Meta path when provider is 360dialog (byte-identical)', async () => {
    currentProvider = '360dialog'

    await sendTextMessage(ctx, baseParams)

    expect(mockResolveByWorkspace).not.toHaveBeenCalled()
    expect(mockMetaSendText).not.toHaveBeenCalled()
  })
})

describe('sendTextMessage provider branch — whatsapp_provider=meta_direct (MIG-03)', () => {
  it('resolves Meta credentials from ctx.workspaceId (never from input — T-39-02)', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(mockResolveByWorkspace).toHaveBeenCalledTimes(1)
    expect(mockResolveByWorkspace).toHaveBeenCalledWith(WS_ID, 'whatsapp')
  })

  it('routes the send through the Meta sender with the resolved creds', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(mockMetaSendText).toHaveBeenCalledTimes(1)
    // First arg is the resolved creds object ({ accessToken, phoneNumberId, ... }) — NOT params.apiKey.
    const credsArg = mockMetaSendText.mock.calls[0][0] as Record<string, unknown>
    expect(credsArg).toMatchObject({
      accessToken: 'BISUAT_decrypted',
      phoneNumberId: '1134593926408063',
    })
    expect(credsArg).not.toHaveProperty('length') // not the apiKey string
  })

  it('does NOT touch the 360dialog arm when provider is meta_direct', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(mockSend360).not.toHaveBeenCalled()
  })
})
