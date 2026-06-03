/**
 * Tests for Meta inbound webhook GET handshake (HOOK-01).
 * Phase 38 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contract under test: GET /api/webhooks/meta
 *   - Analog: src/app/api/webhooks/whatsapp/route.ts:76-100.
 *   - With hub.mode=subscribe AND hub.verify_token === process.env.META_WEBHOOK_VERIFY_TOKEN
 *     → 200 with the hub.challenge value echoed as a plain-text body.
 *   - Otherwise → 403.
 *
 * RED STATE / Plan 03 dependency:
 *   This file imports `GET` from `src/app/api/webhooks/meta/route.ts`, which Plan 03
 *   creates. The import fails (module not found) until then — that is the intended
 *   Wave 0 RED state, NOT a failure of this scaffold. The assertions below pin the
 *   exact handshake contract Plan 03 must satisfy.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// RED: this import throws until Plan 03 ships the route. Intended.
import { GET } from '../route'

beforeAll(() => {
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify_tok_38'
})

function makeRequest(qs: string): NextRequest {
  return new NextRequest(`https://x/api/webhooks/meta?${qs}`)
}

describe('GET /api/webhooks/meta — handshake (HOOK-01)', () => {
  it('echoes hub.challenge as plain text with 200 on a correct verify_token', async () => {
    const res = await GET(
      makeRequest(
        'hub.mode=subscribe&hub.verify_token=verify_tok_38&hub.challenge=CHALLENGE_123'
      )
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('CHALLENGE_123')
  })

  it('returns 403 when the verify_token is wrong', async () => {
    const res = await GET(
      makeRequest(
        'hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=CHALLENGE_123'
      )
    )
    expect(res.status).toBe(403)
  })

  it('returns 403 when hub.mode is not subscribe', async () => {
    const res = await GET(
      makeRequest(
        'hub.mode=unsubscribe&hub.verify_token=verify_tok_38&hub.challenge=CHALLENGE_123'
      )
    )
    expect(res.status).toBe(403)
  })
})
