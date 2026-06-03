/**
 * Tests for Meta inbound webhook HMAC verification (HOOK-02).
 * Phase 38 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contract under test: `verifyMetaHmac(body, signature, secret) => boolean`
 *   - Copy-verbatim of `verifyWhatsAppHmac` (src/app/api/webhooks/whatsapp/route.ts:24-38).
 *   - timing-safe; tolerates 'sha256=' prefix; returns false (NO throw) on length mismatch.
 *
 * RED STATE / Plan 03 dependency:
 *   Plan 03 ships `src/app/api/webhooks/meta/route.ts` and MUST export `verifyMetaHmac`
 *   for reuse. Until then, importing the real verifier is impossible, so this file
 *   inlines a REFERENCE COPY of the verifier to lock the assertions, plus an
 *   `it.todo('route exports verifyMetaHmac for reuse')` that Plan 03 turns GREEN by
 *   wiring the real import. The reference copy is byte-equivalent to the analog so the
 *   contract is pinned even before the route exists.
 *
 * Threat coverage:
 *   T-38-01 (Spoofing): valid sig → true, tampered sig → false.
 *   T-38-02 (Tampering/DoS): length-mismatch sig → false WITHOUT throwing (no 500 retry storm).
 */

import crypto from 'crypto'
import { describe, it, expect } from 'vitest'

// Plan 03 GREEN: import the REAL verifier exported from the route (no more reference copy).
import { verifyMetaHmac } from '../route'

const SECRET = 'test_app_secret'
const BODY = '{"object":"whatsapp_business_account","entry":[{"id":"WABA_1"}]}'

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyMetaHmac (HOOK-02)', () => {
  it('returns true for a valid signature with the sha256= prefix', () => {
    const sig = `sha256=${sign(BODY, SECRET)}`
    expect(verifyMetaHmac(BODY, sig, SECRET)).toBe(true)
  })

  it('returns true for a valid raw-hex signature (no prefix — prefix tolerant)', () => {
    const sig = sign(BODY, SECRET)
    expect(verifyMetaHmac(BODY, sig, SECRET)).toBe(true)
  })

  it('returns false for a tampered signature (one char flipped)', () => {
    const valid = sign(BODY, SECRET)
    // Flip the first hex char deterministically while keeping length identical.
    const flipped = (valid[0] === 'a' ? 'b' : 'a') + valid.slice(1)
    expect(verifyMetaHmac(BODY, `sha256=${flipped}`, SECRET)).toBe(false)
  })

  it('returns false (does NOT throw) for a length-mismatch signature (Pitfall 2)', () => {
    // 'abc' is far shorter than a 64-char sha256 hex digest → Buffer length mismatch.
    // timingSafeEqual throws on unequal lengths; the verifier must swallow it → false.
    expect(() => verifyMetaHmac(BODY, 'sha256=abc', SECRET)).not.toThrow()
    expect(verifyMetaHmac(BODY, 'sha256=abc', SECRET)).toBe(false)
  })

  it('returns false for a valid signature computed with the wrong secret', () => {
    const sig = `sha256=${sign(BODY, 'wrong_secret')}`
    expect(verifyMetaHmac(BODY, sig, SECRET)).toBe(false)
  })

  // GREEN (Plan 03): the route now exports verifyMetaHmac and this suite imports it.
  it('imports the real verifyMetaHmac exported by the route (wired by Plan 03)', () => {
    expect(typeof verifyMetaHmac).toBe('function')
  })
})
