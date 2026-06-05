/**
 * Instagram provider-branch + Regla 6 parity contract for the domain send chokepoint
 * (MIG-02 / D-IG-02 / D-IG-03). Phase 41 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `sendTextMessage(ctx, params)` + `sendMediaMessage(ctx, params)` from
 * `@/lib/domain/messages` for `channel === 'instagram'`. Per 41-RESEARCH.md Pattern 1 +
 * 41-PATTERNS.md "THE CHOKEPOINT", domain/messages.ts is the SINGLE provider-decision site
 * (Regla 3 / D-IG-02). It must read `workspaces.instagram_provider` ONCE and branch:
 *
 *   - 'manychat' (DEFAULT / null) → the EXISTING `getChannelSender('instagram')` (ManyChat)
 *     path, BYTE-IDENTICAL (Regla 6 / D-IG-03 — first-class parity assertion). `resolveByWorkspace`
 *     and `metaInstagramSender` are NEVER touched. This guards the godentist-fb-ig production
 *     agent (which serves IG via ManyChat) and every current ManyChat workspace.
 *   - 'meta_direct' → `resolveByWorkspace(ctx.workspaceId, 'instagram')` → creds →
 *     `metaInstagramSender.sendText(creds, ...)`. The ManyChat `getChannelSender` path is NEVER
 *     touched. Creds come from the resolver keyed by ctx.workspaceId, NEVER from input
 *     (V4 access control — T-39-02 analog).
 *
 * RED STATE / Plan 41-04 dependency:
 *   - The 'manychat' parity tests pass TODAY (the existing instagram arm already calls
 *     getChannelSender('instagram') and never resolves Meta creds) — they are the byte-identical
 *     guard that Plan 41-04 must NOT break (Regla 6).
 *   - The 'meta_direct' tests are RED until Plan 41-04 adds `readInstagramProvider` + the branch
 *     (today domain/messages.ts has NO instagram_provider read, so even a meta_direct workspace
 *     falls through to the ManyChat getChannelSender path → resolveByWorkspace/metaInstagramSender
 *     stay un-called → the meta_direct assertions fail RED).
 *   metaInstagramSender + resolveByWorkspace are MOCKED so the suite runs RED on assertion, not on
 *   a module-load crash (mirrors messenger-provider.test.ts).
 *
 * Threat coverage: T-41-01-02 (Elevation / Regla 6) — the default-arm parity non-call assertions
 * turn RED if a future impl quietly breaks the byte-identical ManyChat path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — every external dependency of the domain send path is observable.
// ---------------------------------------------------------------------------

// 360dialog send edge (the whatsapp arm) — mocked but irrelevant on the instagram path.
vi.mock('@/lib/whatsapp/api', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
}))

// Meta credential resolver — keyed by workspaceId, never from input (T-39-02 analog).
vi.mock('@/lib/meta/credentials', () => ({
  resolveByWorkspace: vi.fn(),
}))

// New Meta Instagram sender (built in Plan 41-02) — mocked so import never crashes the suite.
vi.mock('@/lib/channels/meta-instagram-sender', () => ({
  metaInstagramSender: {
    sendText: vi.fn(),
    sendImage: vi.fn(),
    sendMedia: vi.fn(),
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

// Supabase admin client — controls `workspaces.instagram_provider` and stubs the insert/update tail.
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
        // The chokepoint reads instagram_provider for the instagram path (Plan 41-04 swaps this in).
        return { data: { instagram_provider: currentProvider }, error: null }
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

import { sendTextMessage, sendMediaMessage } from '@/lib/domain/messages'
import { resolveByWorkspace } from '@/lib/meta/credentials'
import { metaInstagramSender } from '@/lib/channels/meta-instagram-sender'
import { getChannelSender } from '@/lib/channels/registry'

const mockResolveByWorkspace = resolveByWorkspace as ReturnType<typeof vi.fn>
const mockMetaSendText = metaInstagramSender.sendText as ReturnType<typeof vi.fn>
const mockMetaSendMedia = metaInstagramSender.sendMedia as ReturnType<typeof vi.fn>
const mockGetChannelSender = getChannelSender as ReturnType<typeof vi.fn>

const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const ctx = { workspaceId: WS_ID, source: 'webhook' } as const

// IGSID > Number.MAX_SAFE_INTEGER — the instagram recipient is the IGSID string.
const IGSID = '17841400000000000000'

const baseParams = {
  conversationId: 'conv_ig_1',
  contactPhone: IGSID, // for instagram this is the IGSID string (external_subscriber_id)
  messageBody: 'hola',
  apiKey: 'MANYCHAT_API_KEY',
  channel: 'instagram' as const,
}

const baseMediaParams = {
  conversationId: 'conv_ig_1',
  contactPhone: IGSID,
  mediaUrl: 'https://cdn.example/x.jpg',
  mediaType: 'image' as const,
  apiKey: 'MANYCHAT_API_KEY',
  channel: 'instagram' as const,
}

// The ManyChat senders returned by getChannelSender('instagram') — observable.
// The ChannelSender interface exposes sendText + sendImage (NO sendMedia); the
// byte-identical legacy IG media path calls sender.sendImage for images (Regla 6).
let manychatSendText: ReturnType<typeof vi.fn>
let manychatSendImage: ReturnType<typeof vi.fn>

beforeEach(() => {
  manychatSendText = vi.fn().mockResolvedValue({ success: true, externalMessageId: 'mc.ig.1' })
  manychatSendImage = vi.fn().mockResolvedValue({ success: true, externalMessageId: 'mc.ig.media' })
  mockGetChannelSender.mockReturnValue({ sendText: manychatSendText, sendImage: manychatSendImage })
  mockMetaSendText.mockResolvedValue({ success: true, externalMessageId: 'm_IG.meta' })
  mockMetaSendMedia.mockResolvedValue({ success: true, externalMessageId: 'm_IG.meta.media' })
  mockResolveByWorkspace.mockResolvedValue({
    accessToken: 'PAGE_TOKEN_decrypted',
    pageId: '102938475610293',
  })
})

afterEach(() => {
  vi.clearAllMocks()
  currentProvider = 'manychat'
})

describe('sendTextMessage instagram branch — instagram_provider=manychat (Regla 6 parity, DEFAULT)', () => {
  it('uses the existing getChannelSender("instagram") ManyChat path', async () => {
    currentProvider = 'manychat'

    await sendTextMessage(ctx, baseParams)

    expect(mockGetChannelSender).toHaveBeenCalledWith('instagram')
    expect(manychatSendText).toHaveBeenCalledTimes(1)
  })

  it('NEVER touches the Meta path when provider is manychat (byte-identical — Regla 6 / D-IG-03)', async () => {
    currentProvider = 'manychat'

    await sendTextMessage(ctx, baseParams)

    // First-class Regla 6 parity assertion: the meta_direct surface stays completely inert.
    expect(mockResolveByWorkspace).not.toHaveBeenCalled()
    expect(mockMetaSendText).not.toHaveBeenCalled()
  })

  it('treats a null/unknown instagram_provider as manychat (DEFAULT)', async () => {
    // The migration default is 'manychat'; an unset/unknown value must NOT silently flip to Meta.
    ;(currentProvider as unknown) = null

    await sendTextMessage(ctx, baseParams)

    expect(mockGetChannelSender).toHaveBeenCalledWith('instagram')
    expect(mockResolveByWorkspace).not.toHaveBeenCalled()
    expect(mockMetaSendText).not.toHaveBeenCalled()
  })
})

describe('sendTextMessage instagram branch — instagram_provider=meta_direct (MIG-02)', () => {
  it('resolves Meta creds from ctx.workspaceId keyed "instagram" (never from input — T-39-02)', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(mockResolveByWorkspace).toHaveBeenCalledTimes(1)
    expect(mockResolveByWorkspace).toHaveBeenCalledWith(WS_ID, 'instagram')
  })

  it('routes the send through metaInstagramSender with the resolved { accessToken, pageId } creds (NOT params.apiKey)', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(mockMetaSendText).toHaveBeenCalledTimes(1)
    const credsArg = mockMetaSendText.mock.calls[0][0] as Record<string, unknown>
    expect(credsArg).toMatchObject({
      accessToken: 'PAGE_TOKEN_decrypted',
      pageId: '102938475610293',
    })
    // The creds object is NOT the plain key string.
    expect(credsArg).not.toHaveProperty('length')
    // The IGSID recipient is forwarded as a string verbatim (never Number-coerced).
    const igsidArg = mockMetaSendText.mock.calls[0][1]
    expect(typeof igsidArg).toBe('string')
    expect(igsidArg).toBe(IGSID)
  })

  it('does NOT touch the ManyChat getChannelSender path when provider is meta_direct', async () => {
    currentProvider = 'meta_direct'

    await sendTextMessage(ctx, baseParams)

    expect(manychatSendText).not.toHaveBeenCalled()
  })

  it('returns a clear error when meta_direct creds are missing (not configured)', async () => {
    currentProvider = 'meta_direct'
    mockResolveByWorkspace.mockResolvedValueOnce(null)

    const result = await sendTextMessage(ctx, baseParams)

    expect(result).toMatchObject({ success: false, error: 'Credenciales Meta no configuradas' })
    expect(mockMetaSendText).not.toHaveBeenCalled()
  })
})

describe('sendMediaMessage instagram branch — provider parity (MIG-02 / Regla 6)', () => {
  it('manychat → uses getChannelSender("instagram"), Meta path inert (Regla 6)', async () => {
    currentProvider = 'manychat'

    await sendMediaMessage(ctx, baseMediaParams)

    expect(mockGetChannelSender).toHaveBeenCalledWith('instagram')
    expect(manychatSendImage).toHaveBeenCalledTimes(1)
    expect(mockResolveByWorkspace).not.toHaveBeenCalled()
    expect(mockMetaSendMedia).not.toHaveBeenCalled()
  })

  it('meta_direct → resolves creds keyed "instagram" and routes through metaInstagramSender.sendMedia', async () => {
    currentProvider = 'meta_direct'

    await sendMediaMessage(ctx, baseMediaParams)

    expect(mockResolveByWorkspace).toHaveBeenCalledWith(WS_ID, 'instagram')
    expect(mockMetaSendMedia).toHaveBeenCalledTimes(1)
    const credsArg = mockMetaSendMedia.mock.calls[0][0] as Record<string, unknown>
    expect(credsArg).toMatchObject({ accessToken: 'PAGE_TOKEN_decrypted', pageId: '102938475610293' })
    expect(manychatSendImage).not.toHaveBeenCalled()
  })
})
