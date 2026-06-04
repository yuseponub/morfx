/**
 * Messenger provider-branch + Regla 6 parity contract for the domain send chokepoint
 * (MIG-02 / D-10 / D-11). Phase 40 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `sendTextMessage(ctx, params)` from `@/lib/domain/messages` for
 * `channel === 'facebook'`. Per 40-RESEARCH.md Pattern 1 + 40-PATTERNS.md "THE CHOKEPOINT",
 * domain/messages.ts is the SINGLE provider-decision site (Regla 3 / D-10). It must read
 * `workspaces.messenger_provider` ONCE and branch:
 *
 *   - 'manychat' (DEFAULT / null) → the EXISTING `getChannelSender('facebook')` (ManyChat)
 *     path, BYTE-IDENTICAL (Regla 6 / D-11 — first-class parity assertion). `resolveByWorkspace`
 *     and `metaFacebookSender` are NEVER touched. This guards the godentist-fb-ig production
 *     agent and every current ManyChat workspace.
 *   - 'meta_direct' → `resolveByWorkspace(ctx.workspaceId, 'facebook')` → creds →
 *     `metaFacebookSender.sendText(creds, ...)`. The ManyChat `getChannelSender` path is NEVER
 *     touched. Creds come from the resolver keyed by ctx.workspaceId, NEVER from input (V4
 *     access control — T-39-02 analog).
 *
 * RED STATE / Plan 04 dependency:
 *   - The 'manychat' parity tests pass TODAY (the existing facebook arm already calls
 *     getChannelSender('facebook') and never resolves Meta creds) — they are the byte-identical
 *     guard that Plan 04 must NOT break (Regla 6).
 *   - The 'meta_direct' tests are RED until Plan 04 adds `readMessengerProvider` + the branch
 *     (today domain/messages.ts has NO messenger_provider read, so even a meta_direct workspace
 *     falls through to the ManyChat getChannelSender path → resolveByWorkspace/metaFacebookSender
 *     stay un-called → the meta_direct assertions fail RED).
 *   metaFacebookSender + resolveByWorkspace are MOCKED so the suite runs RED on assertion, not on
 *   a module-load crash (mirrors messages-provider.test.ts).
 *
 * Threat coverage: T-40-01-01 (Tampering) — the default-arm Regla 6 non-call assertions turn RED
 * if a future impl quietly breaks the byte-identical ManyChat path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — every external dependency of the domain send path is observable.
// ---------------------------------------------------------------------------

// 360dialog send edge (the whatsapp arm) — mocked but irrelevant on the facebook path.
vi.mock('@/lib/whatsapp/api', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
}))

// Meta credential resolver — keyed by workspaceId, never from input (T-39-02 analog).
vi.mock('@/lib/meta/credentials', () => ({
  resolveByWorkspace: vi.fn(),
}))

// New Meta Messenger sender (built in Plan 02) — mocked so import never crashes the suite.
vi.mock('@/lib/channels/meta-facebook-sender', () => ({
  metaFacebookSender: {
    sendText: vi.fn(),
    sendImage: vi.fn(),
  },
}))

// FB/IG registry — the byte-identical ManyChat path the manychat arm MUST keep using (Regla 6).
vi.mock('@/lib/channels/registry', () => ({
  getChannelSender: vi.fn(),
}))

// Automation trigger emitter — irrelevant to send (outbound emits nothing) but imported by module.
vi.mock('@/lib/automations/trigger-emitter', () => ({
  emitWhatsAppMessageReceived: vi.fn(),
  emitWhatsAppKeywordMatch: vi.fn(),
}))

// Supabase admin client — controls `workspaces.messenger_provider` and stubs the insert/update tail.
let currentProvider: 'manychat' | 'meta_direct' = 'manychat'

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
        // The chokepoint reads messenger_provider for the facebook path (Plan 04 swaps this in).
        return { data: { messenger_provider: currentProvider }, error: null }
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

import { sendTextMessage } from '@/lib/domain/messages'
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { metaFacebookSender } from '@/lib/channels/meta-facebook-sender'
import { getChannelSender } from '@/lib/channels/registry'

const mockResolveByWorkspace = resolveByWorkspace as ReturnType<typeof vi.fn>
const mockMetaSendText = metaFacebookSender.sendText as ReturnType<typeof vi.fn>
const mockGetChannelSender = getChannelSender as ReturnType<typeof vi.fn>

const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const ctx = { workspaceId: WS_ID, source: 'webhook' } as const

// PSID > Number.MAX_SAFE_INTEGER — the facebook recipient is the PSID string.
const PSID = '24178263901234567'

const baseParams = {
  conversationId: 'conv_fb_1',
  contactPhone: PSID, // for facebook this is the PSID string (external_subscriber_id)
  messageBody: 'hola',
  apiKey: 'MANYCHAT_API_KEY',
  channel: 'facebook' as const,
}

// The ManyChat sender returned by getChannelSender('facebook') — observable.
let manychatSendText: ReturnType<typeof vi.fn>

beforeEach(() => {
  manychatSendText = vi.fn().mockResolvedValue({ success: true, externalMessageId: 'mc.fb.1' })
  mockGetChannelSender.mockReturnValue({ sendText: manychatSendText, sendImage: vi.fn() })
  mockMetaSendText.mockResolvedValue({ success: true, externalMessageId: 'm_AG.meta' })
  mockResolveByWorkspace.mockResolvedValue({
    accessToken: 'PAGE_TOKEN_decrypted',
    pageId: '102938475610293',
  })
})

afterEach(() => {
  vi.clearAllMocks()
  currentProvider = 'manychat'
})

describe('sendTextMessage facebook branch — messenger_provider=manychat (Regla 6 parity, DEFAULT)', () => {
  it('uses the existing getChannelSender("facebook") ManyChat path', async () => {
    currentProvider = 'manychat'

    await sendTextMessage(ctx, baseParams)

    expect(mockGetChannelSender).toHaveBeenCalledWith('facebook')
    expect(manychatSendText).toHaveBeenCalledTimes(1)
  })

  it('NEVER touches the Meta path when provider is manychat (byte-identical — Regla 6 / D-11)', async () => {
    currentProvider = 'manychat'

    await sendTextMessage(ctx, baseParams)

    // First-class Regla 6 parity assertion: the meta_direct surface stays completely inert.
    expect(mockResolveByWorkspace).not.toHaveBeenCalled()
    expect(mockMetaSendText).not.toHaveBeenCalled()
  })
})

describe('sendTextMessage facebook branch — messenger_provider=meta_direct (MIG-02)', () => {
  it('resolves Meta creds from ctx.workspaceId keyed "facebook" (never from input — T-39-02)', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(mockResolveByWorkspace).toHaveBeenCalledTimes(1)
    expect(mockResolveByWorkspace).toHaveBeenCalledWith(WS_ID, 'facebook')
  })

  it('routes the send through metaFacebookSender with the resolved { accessToken, pageId } creds (NOT params.apiKey)', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(mockMetaSendText).toHaveBeenCalledTimes(1)
    const credsArg = mockMetaSendText.mock.calls[0][0] as Record<string, unknown>
    expect(credsArg).toMatchObject({
      accessToken: 'PAGE_TOKEN_decrypted',
      pageId: '102938475610293',
    })
    // The creds object is NOT the apiKey string.
    expect(credsArg).not.toHaveProperty('length')
    // The PSID recipient is forwarded as a string verbatim (never Number-coerced).
    const psidArg = mockMetaSendText.mock.calls[0][1]
    expect(typeof psidArg).toBe('string')
    expect(psidArg).toBe(PSID)
  })

  it('does NOT touch the ManyChat getChannelSender path when provider is meta_direct', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(manychatSendText).not.toHaveBeenCalled()
  })
})
