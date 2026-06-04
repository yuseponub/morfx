/**
 * Template status webhook handler contract (WA-09) — message_template_status_update + HMAC gate.
 * Phase 39 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contract under test: the POST handler of `src/app/api/webhooks/meta/route.ts` (extended in Plan 06).
 *   On a `changes[].field === 'message_template_status_update'` (RESEARCH §13):
 *     · event=APPROVED → UPDATE the matching local whatsapp_templates row's `status` to 'APPROVED'.
 *     · event=REJECTED with a reason → also write `rejected_reason`.
 *   HMAC verification (verifyMetaHmac over the raw body, Phase 38) STILL gates the request — a
 *   forged/unsigned template-status payload is rejected 401 (threat T-39-04).
 *
 * RED STATE: the route handles inbound MESSAGES today (via processWebhook) but does NOT yet branch on
 * the `message_template_status_update` field to UPDATE whatsapp_templates (Plan 06 adds it). So the
 * "updates the row" assertions are RED. The HMAC-gate assertion passes TODAY (the existing route
 * rejects bad signatures) — it is the byte-identical security guard Plan 06 must preserve.
 *
 * processWebhook + Supabase admin are mocked so the handler runs without a live DB and the
 * whatsapp_templates UPDATE is observable.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import crypto from 'crypto'

const APP_SECRET = 'meta_app_secret_test'
const WABA_ID = 'WABA_1'

// --- mocks -----------------------------------------------------------------

// processWebhook is the inbound-message path; irrelevant to template-status but imported by the route.
vi.mock('@/lib/whatsapp/webhook-handler', () => ({
  processWebhook: vi.fn().mockResolvedValue({ stored: 0 }),
}))

// Credential resolver — return a workspace for the WABA so the handler can scope the UPDATE.
// resolveByWabaId MUST be mocked (WR-02): the template-status branch resolves workspaceId from
// the WABA id, not the phone_number_id. Without this mock workspaceId stays null and the CR-01
// guard turns the UPDATE into a no-op, giving a false-green pass.
vi.mock('@/lib/meta/credentials', () => ({
  resolveByPhoneNumberId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1' }),
  resolveByWabaId: vi.fn().mockResolvedValue({ workspaceId: 'WS_1' }),
}))

// Supabase admin — capture the whatsapp_templates UPDATE + the chained .eq() filters.
// The domain applyTemplateStatusUpdate chains .update().eq('workspace_id').eq('name').eq('language')
// and awaits the final builder. The builder must be thenable AND keep returning itself on each
// .eq() so the whole chain resolves (WR-02 — exercise the real workspace-scoped UPDATE).
const templatesUpdate = vi.fn()
const templatesEq = vi.fn()

// Chainable thenable: every .eq() returns the same builder; awaiting it resolves { error: null }.
const templatesBuilder = {
  update: templatesUpdate,
  eq: templatesEq,
  then: (resolve: (v: { data: null; error: null }) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve),
}
templatesUpdate.mockReturnValue(templatesBuilder)
templatesEq.mockReturnValue(templatesBuilder)

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'whatsapp_templates') {
        return templatesBuilder
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
    }),
  })),
}))

import { POST } from '../route'
import { resolveByWabaId } from '@/lib/meta/credentials'

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

function templateStatusPayload(event: string, reason?: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'message_template_status_update',
            value: {
              event,
              message_template_id: 12345,
              message_template_name: 'confirmacion_orden',
              message_template_language: 'es',
              reason: reason ?? 'NONE',
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
  templatesUpdate.mockClear()
  templatesEq.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('WA-09 HMAC gate (threat T-39-04) — preserve existing security', () => {
  it('rejects a forged/unsigned template-status payload with 401', async () => {
    const body = templateStatusPayload('APPROVED')
    const res = await POST(makeRequest(body, null))
    expect(res.status).toBe(401)
  })

  it('rejects a template-status payload signed with the wrong secret', async () => {
    const body = templateStatusPayload('APPROVED')
    const res = await POST(makeRequest(body, sign(body, 'wrong_secret')))
    expect(res.status).toBe(401)
  })
})

describe('WA-09 message_template_status_update handler', () => {
  it('UPDATEs the local whatsapp_templates row status on an APPROVED event (workspace-scoped)', async () => {
    const body = templateStatusPayload('APPROVED')
    const res = await POST(makeRequest(body, sign(body, APP_SECRET)))

    expect(res.status).toBe(200)
    expect(templatesUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = templatesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updatePayload).toMatchObject({ status: 'APPROVED' })
    // CR-01: the UPDATE MUST be scoped by workspace_id (resolved from the WABA id).
    expect(templatesEq).toHaveBeenCalledWith('workspace_id', 'WS_1')
  })

  it('writes rejected_reason on a REJECTED event (workspace-scoped)', async () => {
    const body = templateStatusPayload('REJECTED', 'INVALID_FORMAT')
    const res = await POST(makeRequest(body, sign(body, APP_SECRET)))

    expect(res.status).toBe(200)
    expect(templatesUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = templatesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updatePayload).toMatchObject({ status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' })
    expect(templatesEq).toHaveBeenCalledWith('workspace_id', 'WS_1')
  })

  it('does NOT issue an unscoped UPDATE when the WABA is unknown (CR-01 ack-and-drop)', async () => {
    // Unresolved WABA → workspaceId stays null. The route must ack 200 WITHOUT calling
    // the domain UPDATE (a null-workspace UPDATE would flip status across every tenant).
    vi.mocked(resolveByWabaId).mockResolvedValueOnce(null)

    const body = templateStatusPayload('APPROVED')
    const res = await POST(makeRequest(body, sign(body, APP_SECRET)))

    expect(res.status).toBe(200)
    expect(templatesUpdate).not.toHaveBeenCalled()
  })
})
