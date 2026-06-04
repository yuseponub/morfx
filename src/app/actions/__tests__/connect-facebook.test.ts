/**
 * connectFacebookPage server action contract (SIGNUP-04).
 * Phase 40 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: `connectFacebookPage({ code })` from `@/app/actions/meta-onboarding`
 *   (FUTURE — Plan 03 adds it alongside the existing connectWhatsAppNumber). Per 40-PATTERNS.md
 *   it mirrors the connectWhatsAppNumber auth gate verbatim, then runs the DIVERGENT FB-Login
 *   token chain (short-lived user → long-lived user → /me/accounts Page token), encrypts the Page
 *   token, stores it via upsertMetaAccount(channel:'facebook'), and subscribes the Page.
 *
 * Behaviors pinned (RED until Plan 03):
 *   - requires owner role (non-owner → { success:false }); workspaceId is session-derived via
 *     getRequestAuth(), NEVER from input (V4 access control — T-38-13 analog).
 *   - on success: derives the Page token (mock the messenger-connect chain), encryptToken()s it,
 *     calls upsertMetaAccount({ channel:'facebook', pageId, accessTokenEncrypted }), then
 *     subscribeMessengerPage(pageToken, pageId) (per-Page subscribe — Pitfall 4).
 *   - does NOT flip messenger_provider (Regla 6 / D-11 — connecting a Page must not change the
 *     active provider; manual SQL flip only).
 *   - the plaintext Page token is NEVER returned in the result envelope (T-40-01-02 Info Disclosure).
 *
 * RED STATE: `connectFacebookPage` is not exported from meta-onboarding yet (Plan 03 adds it) →
 * the import binding is undefined → calling it throws → every test fails RED. The token chain,
 * encrypt, upsert and subscribe are all mocked so the eventual GREEN run asserts the contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/request-auth', () => ({
  getRequestAuth: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// FUTURE FB-Login token chain (Plan 03 creates messenger-connect.ts).
vi.mock('@/lib/meta/messenger-connect', () => ({
  exchangeForLongLivedUserToken: vi.fn(),
  getPageToken: vi.fn(),
  subscribeMessengerPage: vi.fn(),
}))

// Token encryption at rest (existing).
vi.mock('@/lib/meta/token', () => ({
  encryptToken: vi.fn((plain: string) => `enc(${plain})`),
}))

// Domain write path (Regla 3 — sole write site, extended for channel:'facebook').
vi.mock('@/lib/domain/meta-accounts', () => ({
  upsertMetaAccount: vi.fn(),
}))

// Supabase server client — controls the workspace_members role lookup (auth gate) and lets us
// observe that NO workspaces.update touching messenger_provider runs (Regla 6).
let memberRole: string | null = 'owner'
const workspacesUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn() })) }))

vi.mock('@/lib/supabase/server', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn(chain)
    builder.eq = vi.fn(chain)
    builder.update = table === 'workspaces' ? workspacesUpdate : vi.fn(chain)
    builder.single = vi.fn(async () => {
      if (table === 'workspace_members') {
        return { data: memberRole ? { role: memberRole } : null, error: null }
      }
      return { data: null, error: null }
    })
    return builder
  }
  return {
    createClient: vi.fn(async () => ({
      from: vi.fn((table: string) => makeBuilder(table)),
    })),
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => makeBuilder(table)),
    })),
  }
})

import { getRequestAuth } from '@/lib/auth/request-auth'
import {
  exchangeForLongLivedUserToken,
  getPageToken,
  subscribeMessengerPage,
} from '@/lib/meta/messenger-connect'
import { upsertMetaAccount } from '@/lib/domain/meta-accounts'
// FUTURE export — undefined until Plan 03 (RED).
import { connectFacebookPage } from '@/app/actions/meta-onboarding'

const mockGetRequestAuth = getRequestAuth as ReturnType<typeof vi.fn>
const mockExchange = exchangeForLongLivedUserToken as ReturnType<typeof vi.fn>
const mockGetPageToken = getPageToken as ReturnType<typeof vi.fn>
const mockSubscribe = subscribeMessengerPage as ReturnType<typeof vi.fn>
const mockUpsert = upsertMetaAccount as ReturnType<typeof vi.fn>

const WS_ID = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
const USER_ID = 'user-123'
const PAGE_ID = '102938475610293'
const PAGE_TOKEN = 'PAGE_TOKEN_plaintext'

beforeEach(() => {
  memberRole = 'owner'
  mockGetRequestAuth.mockResolvedValue({ workspaceId: WS_ID, userId: USER_ID })
  mockExchange.mockResolvedValue('LONG_LIVED_USER_TOKEN')
  mockGetPageToken.mockResolvedValue({ pageId: PAGE_ID, accessToken: PAGE_TOKEN })
  mockSubscribe.mockResolvedValue({ success: true })
  mockUpsert.mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('connectFacebookPage — auth gate (SIGNUP-04 / V4)', () => {
  it('rejects a non-owner with { success:false } (workspaceId session-derived, never from input)', async () => {
    memberRole = 'member'

    const result = await connectFacebookPage({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(result).toMatchObject({ success: false })
    // Never reached the token chain / write on a denied connect.
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('rejects when unauthenticated', async () => {
    mockGetRequestAuth.mockResolvedValueOnce(null)

    const result = await connectFacebookPage({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(result).toMatchObject({ success: false })
  })
})

describe('connectFacebookPage — success path stores Page token + subscribes (SIGNUP-04)', () => {
  it('stores the encrypted Page token via upsertMetaAccount({ channel:"facebook", pageId })', async () => {
    const result = await connectFacebookPage({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const upsertArgs = mockUpsert.mock.calls[0][0] as Record<string, unknown>
    expect(upsertArgs).toMatchObject({
      workspaceId: WS_ID,
      channel: 'facebook',
      pageId: PAGE_ID,
    })
    // Token persisted ENCRYPTED, never the plaintext.
    expect(upsertArgs.accessTokenEncrypted).toBe(`enc(${PAGE_TOKEN})`)
    expect(result).toMatchObject({ success: true })
  })

  it('feeds the FB.login user access token straight into the long-lived exchange (token-flow — 40-08 fix)', async () => {
    await connectFacebookPage({ accessToken: 'USER_ACCESS_TOKEN' })

    // Token-flow: FB.login returns a user token, exchanged long-lived directly
    // (no code→token step, no redirect_uri — the classic-code exchange broke live).
    expect(mockExchange).toHaveBeenCalledWith('USER_ACCESS_TOKEN')
  })

  it('subscribes the Page to the app with the Page token (per-Page subscribe — Pitfall 4)', async () => {
    await connectFacebookPage({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    expect(mockSubscribe).toHaveBeenCalledWith(PAGE_TOKEN, PAGE_ID)
  })
})

describe('connectFacebookPage — Regla 6 + Info Disclosure (D-11 / T-40-01-02)', () => {
  it('does NOT flip messenger_provider (no workspaces.update on connect — Regla 6)', async () => {
    await connectFacebookPage({ accessToken: 'USER_ACCESS_TOKEN' })

    // Connecting a Page must NOT change the active provider — manual SQL flip only.
    expect(workspacesUpdate).not.toHaveBeenCalled()
  })

  it('NEVER returns the plaintext Page token in the result envelope (T-40-01-02)', async () => {
    const result = await connectFacebookPage({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(JSON.stringify(result)).not.toContain(PAGE_TOKEN)
  })
})
