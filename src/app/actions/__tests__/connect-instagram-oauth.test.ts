/**
 * connectInstagramAccount({ accessToken }) token-refresh contract (IG-03 / IG-04).
 * Phase 41 Plan 41-08 (Wave 5) — TDD RED scaffold.
 *
 * Contract under test: the NEW `connectInstagramAccount({ accessToken })` shape (Plan 41-08
 * adapts it from the current no-arg, stored-token version). Per 41-08-RESEARCH the dedicated
 * IG FB.login captures a short-lived USER token in the browser; this action runs the Phase 40
 * token chain VERBATIM (exchangeForLongLivedUserToken → getPageToken), REFRESHES the canonical
 * facebook-row `access_token_encrypted` with the fresh superset Page token (D-IG-12 — additive,
 * Messenger keeps working), THEN resolveInstagramAccount + IG-row upsert + per-Page subscribe,
 * all with the FRESH token (which now carries the IG scopes — the previously-broken step).
 *
 * Behaviors pinned (RED until Plan 41-08 Task 2):
 *   - requires owner role (non-owner → { success:false }); workspaceId session-derived via
 *     getRequestAuth(), NEVER from input (V4 / T-41-08-02).
 *   - token-flow: feeds the captured user token straight into exchangeForLongLivedUserToken
 *     (NOT a code exchange — Q6 Pitfall 1).
 *   - facebook-row refresh (D-IG-12): upsertMetaAccount({ channel:'facebook', pageId,
 *     accessTokenEncrypted: enc(PAGE_TOKEN) }) refreshes the canonical token with the superset.
 *   - IG resolve + upsert with the FRESH page token: resolveInstagramAccount(PAGE_TOKEN, PAGE_ID)
 *     then upsertMetaAccount({ channel:'instagram', igAccountId, igUsername }). BOTH upserts run.
 *   - subscribe: subscribeMessengerPage(PAGE_TOKEN, PAGE_ID) once.
 *   - graceful no-IG: the Spanish "vincula una cuenta de Instagram Profesional" error surfaces
 *     verbatim; any other failure → generic Spanish message.
 *   - Regla 6 (D-IG-11): connect NEVER flips instagram_provider (no workspaces.update).
 *   - Info disclosure (T-41-08-01): the plaintext Page token is NEVER in the result envelope.
 *
 * RED STATE: the CURRENT connectInstagramAccount() takes NO args and reads resolveByWorkspace
 * instead of refreshing the token — so the token-flow / facebook-refresh / 2x-upsert /
 * fresh-token-resolve assertions fail until Task 2 adds the chain. Assertions are RED, not a
 * collection/syntax error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (cloned verbatim from connect-facebook.test.ts + the IG resolve mock)
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/request-auth', () => ({
  getRequestAuth: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Phase 40 token chain reused verbatim (D-IG-12).
vi.mock('@/lib/meta/messenger-connect', () => ({
  exchangeForLongLivedUserToken: vi.fn(),
  getPageToken: vi.fn(),
  subscribeMessengerPage: vi.fn(),
}))

// IG account resolve — the previously-broken step (now runs with the fresh superset token).
vi.mock('@/lib/meta/instagram-connect', () => ({
  resolveInstagramAccount: vi.fn(),
}))

// Token encryption at rest (existing).
vi.mock('@/lib/meta/token', () => ({
  encryptToken: vi.fn((plain: string) => `enc(${plain})`),
}))

// Domain write path (Regla 3 — sole write site; called TWICE: facebook refresh + instagram upsert).
vi.mock('@/lib/domain/meta-accounts', () => ({
  upsertMetaAccount: vi.fn(),
}))

// Supabase server client — controls the workspace_members role lookup (auth gate) and lets us
// observe that NO workspaces.update touching instagram_provider runs (Regla 6).
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
import { resolveInstagramAccount } from '@/lib/meta/instagram-connect'
import { upsertMetaAccount } from '@/lib/domain/meta-accounts'
// FUTURE shape — connectInstagramAccount currently takes NO args (RED until Task 2).
import { connectInstagramAccount } from '@/app/actions/meta-onboarding'

const mockGetRequestAuth = getRequestAuth as ReturnType<typeof vi.fn>
const mockExchange = exchangeForLongLivedUserToken as ReturnType<typeof vi.fn>
const mockGetPageToken = getPageToken as ReturnType<typeof vi.fn>
const mockSubscribe = subscribeMessengerPage as ReturnType<typeof vi.fn>
const mockResolveIg = resolveInstagramAccount as ReturnType<typeof vi.fn>
const mockUpsert = upsertMetaAccount as ReturnType<typeof vi.fn>

const WS_ID = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
const USER_ID = 'user-123'
const PAGE_ID = '102938475610293'
const PAGE_TOKEN = 'PAGE_TOKEN_plaintext'
const IG_ID = '17841400000000000000'

beforeEach(() => {
  memberRole = 'owner'
  mockGetRequestAuth.mockResolvedValue({ workspaceId: WS_ID, userId: USER_ID })
  mockExchange.mockResolvedValue('LONG_LIVED_USER_TOKEN')
  mockGetPageToken.mockResolvedValue({
    pageId: PAGE_ID,
    pageName: 'Pg',
    accessToken: PAGE_TOKEN,
  })
  mockSubscribe.mockResolvedValue({ success: true })
  mockResolveIg.mockResolvedValue({ id: IG_ID, username: 'varixcenter' })
  mockUpsert.mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('connectInstagramAccount — auth gate (V4 / T-41-08-02)', () => {
  it('rejects a non-owner with { success:false } (workspaceId session-derived, never from input)', async () => {
    memberRole = 'member'

    const result = await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(result).toMatchObject({ success: false })
    // Never reached the token chain / resolve / write on a denied connect.
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockResolveIg).not.toHaveBeenCalled()
    expect(mockSubscribe).not.toHaveBeenCalled()
  })

  it('rejects when unauthenticated', async () => {
    mockGetRequestAuth.mockResolvedValueOnce(null)

    const result = await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(result).toMatchObject({ success: false })
  })
})

describe('connectInstagramAccount — token-refresh chain (D-IG-12)', () => {
  it('feeds the captured FB.login user token straight into the long-lived exchange (token-flow — Q6 Pitfall 1)', async () => {
    await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    // Token-flow: the short-lived USER token is exchanged long-lived directly
    // (NOT a code→token exchange).
    expect(mockExchange).toHaveBeenCalledWith('USER_ACCESS_TOKEN')
  })

  it('refreshes the canonical facebook-row token with the fresh superset Page token (D-IG-12)', async () => {
    const result = await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    // BOTH upserts run: facebook refresh (first) + instagram upsert (second).
    expect(mockUpsert).toHaveBeenCalledTimes(2)

    const fbArgs = mockUpsert.mock.calls[0][0] as Record<string, unknown>
    expect(fbArgs).toMatchObject({
      workspaceId: WS_ID,
      channel: 'facebook',
      pageId: PAGE_ID,
    })
    // Refreshed with the FRESH superset Page token (encrypted, never plaintext).
    expect(fbArgs.accessTokenEncrypted).toBe(`enc(${PAGE_TOKEN})`)

    expect(result).toMatchObject({ success: true })
  })

  it('resolves the IG account with the FRESH page token, then upserts the instagram row', async () => {
    await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    // resolveInstagramAccount runs with the FRESH page token (was the broken step).
    expect(mockResolveIg).toHaveBeenCalledWith(PAGE_TOKEN, PAGE_ID)

    const igArgs = mockUpsert.mock.calls[1][0] as Record<string, unknown>
    expect(igArgs).toMatchObject({
      workspaceId: WS_ID,
      channel: 'instagram',
      pageId: PAGE_ID,
      igAccountId: IG_ID,
      igUsername: 'varixcenter',
    })
    expect(igArgs.accessTokenEncrypted).toBe(`enc(${PAGE_TOKEN})`)
  })

  it('subscribes the Page with the FRESH page token (messages field = IG delivery, Q5)', async () => {
    await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)
    expect(mockSubscribe).toHaveBeenCalledWith(PAGE_TOKEN, PAGE_ID)
  })
})

describe('connectInstagramAccount — graceful no-IG (T-41-08-04)', () => {
  it('surfaces the clear Spanish IG-not-linked error verbatim', async () => {
    mockResolveIg.mockRejectedValueOnce(
      new Error(
        'Por favor vincula una cuenta de Instagram Profesional a tu pagina de Facebook'
      )
    )

    const result = await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(result).toMatchObject({
      success: false,
      error:
        'Por favor vincula una cuenta de Instagram Profesional a tu pagina de Facebook',
    })
  })

  it('maps a non-IG failure to the generic Spanish message (no detail leak)', async () => {
    mockResolveIg.mockRejectedValueOnce(new Error('network boom'))

    const result = await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(result).toMatchObject({
      success: false,
      error: 'No se pudo conectar la cuenta de Instagram. Intenta de nuevo.',
    })
  })
})

describe('connectInstagramAccount — Regla 6 + Info Disclosure (D-IG-11 / T-41-08-01)', () => {
  it('does NOT flip instagram_provider (no workspaces.update on connect — Regla 6)', async () => {
    await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    // Connecting must NOT change the active provider — manual SQL flip only.
    expect(workspacesUpdate).not.toHaveBeenCalled()
  })

  it('NEVER returns the plaintext Page token in the result envelope (T-41-08-01)', async () => {
    const result = await connectInstagramAccount({ accessToken: 'USER_ACCESS_TOKEN' })

    expect(JSON.stringify(result)).not.toContain(PAGE_TOKEN)
  })
})
