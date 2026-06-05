/**
 * Unified Meta webhook — `object==='instagram'` branch routing contract (IG-01).
 * Phase 41 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: the POST handler of `src/app/api/webhooks/meta/route.ts` (extended in
 * Plan 41-05). On an `object === 'instagram'` payload (41-RESEARCH §Code Examples):
 *   - parses `entry[].messaging[]` (Messenger-style — NOT `entry[].changes[]`, Pitfall 1).
 *   - routes by `entry.id` (= the IGID / recipient.id, YOUR account) via `resolveByIgAccountId`
 *     — NEVER by `sender.id` (the customer IGSID — Pitfall 2 cross-tenant leak).
 *   - unknown `entry.id` (resolveByIgAccountId → null) → ack 200 & drop (no throw, no store).
 *   - skips events where `ev.message.is_echo === true` (Pitfall 7 — IG integrates echoes into
 *     the messages field with is_echo).
 *   - calls `processInstagramWebhook(ev, creds.workspaceId, entry.id, creds.accessToken)` for
 *     valid events.
 * HMAC verification (verifyMetaHmac over the raw body, Phase 38) STILL gates the request — a
 * forged/unsigned instagram payload is rejected 401 (T-41-01-03 / threat parity with FB+WA).
 *
 * RED STATE: the route handles `object==='page'` (FB) + `whatsapp_business_account` today but does
 * NOT yet branch on `object==='instagram'` (Plan 41-05 adds it). So the routing/dispatch assertions
 * are RED. The HMAC-gate assertion passes TODAY (the existing route rejects bad signatures) — it is
 * the byte-identical security guard Plan 41-05 must preserve.
 *
 * processWebhook / processMessengerWebhook / processInstagramWebhook + the credential resolvers are
 * mocked so the handler runs without a live DB and the IG dispatch is observable.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import crypto from 'crypto'

const APP_SECRET = 'meta_app_secret_test'
const IG_ACCOUNT_ID = 'IGID_17841400000000123'
// IGSID > Number.MAX_SAFE_INTEGER — the customer; must NEVER be used for routing.
const IGSID = '17841400000000000000'

// --- mocks -----------------------------------------------------------------

// Inbound WhatsApp + FB paths — irrelevant to the instagram branch but imported by the route.
vi.mock('@/lib/whatsapp/webhook-handler', () => ({
  processWebhook: vi.fn().mockResolvedValue({ stored: 0 }),
}))
vi.mock('@/lib/messenger/webhook-handler', () => ({
  processMessengerWebhook: vi.fn().mockResolvedValue({ stored: false }),
}))
vi.mock('@/lib/domain/whatsapp-templates', () => ({
  applyTemplateStatusUpdate: vi.fn().mockResolvedValue(undefined),
}))

// The FUTURE Instagram inbound handler (Plan 41-05) — mocked so the dispatch is observable.
vi.mock('@/lib/instagram/webhook-handler', () => ({
  processInstagramWebhook: vi.fn().mockResolvedValue({ stored: true }),
}))

// Credential resolvers. resolveByIgAccountId routes the instagram branch by entry.id (= IGID).
vi.mock('@/lib/meta/credentials', () => ({
  resolveByPhoneNumberId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1' }),
  resolveByWabaId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1' }),
  resolveByPageId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1', accessToken: 'TKN' }),
  resolveByIgAccountId: vi
    .fn()
    .mockResolvedValue({ workspaceId: 'WS_IG', accessToken: 'PAGE_TOKEN_decrypted' }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}))

import { POST } from '../route'
import { resolveByIgAccountId } from '@/lib/meta/credentials'
import { processInstagramWebhook } from '@/lib/instagram/webhook-handler'

const mockResolveByIgAccountId = resolveByIgAccountId as ReturnType<typeof vi.fn>
const mockProcessInstagram = processInstagramWebhook as ReturnType<typeof vi.fn>

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

function makeRequest(rawBody: string, signature: string | null) {
  const headers = new Map<string, string>()
  if (signature !== null) headers.set('X-Hub-Signature-256', signature)
  return {
    text: async () => rawBody,
    headers: { get: (k: string) => headers.get(k) ?? null },
  } as unknown as import('next/server').NextRequest
}

function instagramPayload(opts?: { isEcho?: boolean; entryId?: string }) {
  return JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: opts?.entryId ?? IG_ACCOUNT_ID, // = IGID / recipient.id (YOUR account)
        time: 1748112000,
        messaging: [
          {
            sender: { id: IGSID }, // the CUSTOMER — never used for routing
            recipient: { id: opts?.entryId ?? IG_ACCOUNT_ID },
            timestamp: 1748112000000,
            message: {
              mid: 'm_ig_inbound_xyz',
              text: 'Hola, ¿precio?',
              ...(opts?.isEcho ? { is_echo: true } : {}),
            },
          },
        ],
      },
    ],
  })
}

beforeAll(() => {
  process.env.META_APP_SECRET = APP_SECRET
})

beforeEach(() => {
  mockResolveByIgAccountId.mockResolvedValue({
    workspaceId: 'WS_IG',
    accessToken: 'PAGE_TOKEN_decrypted',
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('IG-01 HMAC gate (T-41-01-03) — preserve existing security', () => {
  it('rejects a forged/unsigned instagram payload with 401', async () => {
    const body = instagramPayload()
    const res = await POST(makeRequest(body, null))
    expect(res.status).toBe(401)
  })

  it('rejects an instagram payload signed with the wrong secret', async () => {
    const body = instagramPayload()
    const res = await POST(makeRequest(body, sign(body, 'wrong_secret')))
    expect(res.status).toBe(401)
  })
})

describe('IG-01 object==="instagram" branch — routes by entry.id via resolveByIgAccountId', () => {
  it('parses entry[].messaging[] and routes by entry.id (IGID), NOT sender.id (IGSID)', async () => {
    const body = instagramPayload()
    const res = await POST(makeRequest(body, sign(body, APP_SECRET)))

    expect(res.status).toBe(200)
    // Routing keyed by the IGID (entry.id / recipient.id), never the customer IGSID (Pitfall 2).
    expect(mockResolveByIgAccountId).toHaveBeenCalledWith(IG_ACCOUNT_ID)
    expect(mockResolveByIgAccountId).not.toHaveBeenCalledWith(IGSID)
  })

  it('dispatches processInstagramWebhook(ev, workspaceId, entry.id, accessToken) for a valid event', async () => {
    const body = instagramPayload()
    await POST(makeRequest(body, sign(body, APP_SECRET)))

    expect(mockProcessInstagram).toHaveBeenCalledTimes(1)
    const call = mockProcessInstagram.mock.calls[0]
    // call = [ev, workspaceId, igAccountId, accessToken]
    expect(call[1]).toBe('WS_IG')
    expect(call[2]).toBe(IG_ACCOUNT_ID)
    expect(call[3]).toBe('PAGE_TOKEN_decrypted')
  })

  it('acks 200 & drops (no dispatch) when entry.id is unknown (resolveByIgAccountId → null)', async () => {
    mockResolveByIgAccountId.mockResolvedValueOnce(null)

    const body = instagramPayload()
    const res = await POST(makeRequest(body, sign(body, APP_SECRET)))

    expect(res.status).toBe(200)
    expect(mockProcessInstagram).not.toHaveBeenCalled()
  })

  it('skips events where message.is_echo === true (Pitfall 7 — our own outbound)', async () => {
    const body = instagramPayload({ isEcho: true })
    const res = await POST(makeRequest(body, sign(body, APP_SECRET)))

    expect(res.status).toBe(200)
    expect(mockProcessInstagram).not.toHaveBeenCalled()
  })
})
