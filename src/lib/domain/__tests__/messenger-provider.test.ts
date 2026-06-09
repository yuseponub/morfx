/**
 * Messenger provider-branch contract for the domain send chokepoint
 * (godentist-fbig-meta-direct-cutover Plan 05).
 *
 * Contract under test: `sendTextMessage(ctx, params)` from `@/lib/domain/messages` for
 * `channel === 'facebook'`. ManyChat was decommissioned (Plan 05): the facebook arm is now
 * meta_direct-ONLY. domain/messages.ts is the SINGLE provider-decision site (Regla 3 / D-10):
 * it reads `workspaces.messenger_provider` and resolves Meta creds via
 * `resolveByWorkspace(ctx.workspaceId, 'facebook')` → `metaFacebookSender.sendText(creds, ...)`.
 * Creds come from the resolver keyed by ctx.workspaceId, NEVER from input (V4 access control —
 * T-40-02 analog). getChannelSender is NEVER called for facebook anymore.
 *
 * A non-meta_direct messenger_provider (legacy/null) now returns a clear
 * "Credenciales Meta no configuradas" error — no workspace remains on manychat (Plan 04).
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

// Meta credential resolver — keyed by workspaceId, never from input (T-40-02 analog).
vi.mock('@/lib/meta/credentials', () => ({
  resolveByWorkspace: vi.fn(),
}))

// Meta Messenger sender — the ONLY facebook send path post-decommission.
vi.mock('@/lib/channels/meta-facebook-sender', () => ({
  metaFacebookSender: {
    sendText: vi.fn(),
    sendImage: vi.fn(),
    sendMedia: vi.fn(),
  },
}))

// Automation trigger emitter — irrelevant to send (outbound emits nothing) but imported by module.
vi.mock('@/lib/automations/trigger-emitter', () => ({
  emitWhatsAppMessageReceived: vi.fn(),
  emitWhatsAppKeywordMatch: vi.fn(),
}))

// Supabase admin client — controls `workspaces.messenger_provider` and stubs the insert/update tail.
let currentProvider: 'manychat' | 'meta_direct' = 'meta_direct'

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

const mockResolveByWorkspace = resolveByWorkspace as ReturnType<typeof vi.fn>
const mockMetaSendText = metaFacebookSender.sendText as ReturnType<typeof vi.fn>

const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const ctx = { workspaceId: WS_ID, source: 'webhook' } as const

// PSID > Number.MAX_SAFE_INTEGER — the facebook recipient is the PSID string.
const PSID = '24178263901234567'

const baseParams = {
  conversationId: 'conv_fb_1',
  contactPhone: PSID, // for facebook this is the PSID string (external_subscriber_id)
  messageBody: 'hola',
  apiKey: 'unused-post-decommission',
  channel: 'facebook' as const,
}

beforeEach(() => {
  mockMetaSendText.mockResolvedValue({ success: true, externalMessageId: 'm_AG.meta' })
  mockResolveByWorkspace.mockResolvedValue({
    accessToken: 'PAGE_TOKEN_decrypted',
    pageId: '102938475610293',
  })
})

afterEach(() => {
  vi.clearAllMocks()
  currentProvider = 'meta_direct'
})

describe('sendTextMessage facebook branch — meta_direct only (ManyChat decommissioned, Plan 05)', () => {
  it('resolves Meta creds from ctx.workspaceId keyed "facebook" (never from input — T-40-02)', async () => {
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

  it('returns a clear error when meta_direct creds are missing (not configured)', async () => {
    currentProvider = 'meta_direct'
    mockResolveByWorkspace.mockResolvedValueOnce(null)

    const result = await sendTextMessage(ctx, baseParams)

    expect(result).toMatchObject({ success: false, error: 'Credenciales Meta no configuradas' })
    expect(mockMetaSendText).not.toHaveBeenCalled()
  })

  it('returns a clear error for a legacy/non-meta_direct messenger_provider (no manychat workspace remains)', async () => {
    ;(currentProvider as unknown) = 'manychat'

    const result = await sendTextMessage(ctx, baseParams)

    expect(result).toMatchObject({ success: false, error: 'Credenciales Meta no configuradas' })
    expect(mockMetaSendText).not.toHaveBeenCalled()
  })
})
