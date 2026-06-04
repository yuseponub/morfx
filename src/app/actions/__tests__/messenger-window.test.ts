/**
 * Messenger 24h window / HUMAN_AGENT tag gate (D-09).
 * Phase 40 Plan 01 (Wave 1) — TDD RED scaffold.
 *
 * Contract under test: the window-gate helper `resolveMessengerWindowSend(...)` from
 *   `@/lib/messenger/window-gate` (FUTURE — Plan 06 creates it). This is the single decision the
 *   facebook meta_direct send path consults before sending (40-PATTERNS.md §messages.ts D-09 gate):
 *
 *     resolveMessengerWindowSend({ hoursSinceCustomerMessage, featureGranted })
 *       → { messaging_type: 'RESPONSE' }                       when hoursSince < 24
 *       → { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' } when 24 ≤ hoursSince < 168 AND featureGranted
 *       → { blocked: true, error: <spanish> }                  when 24 ≤ hoursSince < 168 AND !featureGranted
 *       → { blocked: true, error: <spanish> }                  when hoursSince ≥ 168 (> 7 days)
 *
 * Notes:
 *   - 24h–7d sends require the Meta "Human Agent" App-Review feature (RESEARCH Open Q1 / Pitfall 2),
 *     surfaced via a config/feature flag (`featureGranted`). Until granted → BLOCK with a clear
 *     Spanish message (T-40-01-03 Repudiation mitigation).
 *   - The DEAD tags (CONFIRMED_EVENT_UPDATE/ACCOUNT_UPDATE/POST_PURCHASE_UPDATE) are never produced;
 *     the only tag this gate can yield is HUMAN_AGENT.
 *   - This gate ONLY governs meta_direct; the ManyChat facebook path is unaffected (no window
 *     restriction — Regla 6). The provider decision itself lives in the domain layer (D-10); this
 *     helper is the pure window/tag policy the meta_direct arm applies.
 *
 * RED STATE: `@/lib/messenger/window-gate` does not exist until Plan 06 — the static import throws
 * module-not-found → the whole file fails RED, the intended Wave-1 RED.
 */

import { describe, it, expect } from 'vitest'
import { resolveMessengerWindowSend } from '@/lib/messenger/window-gate'

// hoursSince / featureGranted → expected outcome (D-09 boundaries: 24h and 168h = 7 days).
const cases = [
  { hoursSince: 1, featureGranted: false, label: 'inside 24h, no feature' },
  { hoursSince: 1, featureGranted: true, label: 'inside 24h, feature' },
  { hoursSince: 30, featureGranted: true, label: '24h-7d, feature granted' },
  { hoursSince: 30, featureGranted: false, label: '24h-7d, feature NOT granted' },
  { hoursSince: 100, featureGranted: true, label: 'mid 24h-7d, feature granted' },
  { hoursSince: 200, featureGranted: true, label: '> 7 days, feature granted' },
] as const

describe('resolveMessengerWindowSend (D-09) — inside the 24h window → RESPONSE', () => {
  it.each(cases.filter((c) => c.hoursSince < 24))(
    'resolves messaging_type RESPONSE with NO tag ($label)',
    ({ hoursSince, featureGranted }) => {
      const out = resolveMessengerWindowSend({ hoursSinceCustomerMessage: hoursSince, featureGranted })
      expect(out).toMatchObject({ messaging_type: 'RESPONSE' })
      expect(out).not.toHaveProperty('tag')
      expect(out).not.toHaveProperty('blocked')
    }
  )
})

describe('resolveMessengerWindowSend (D-09) — 24h–7d window', () => {
  it('resolves tag HUMAN_AGENT when the Human Agent feature is granted', () => {
    const out = resolveMessengerWindowSend({ hoursSinceCustomerMessage: 30, featureGranted: true })
    expect(out).toMatchObject({ messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' })
    // The only tag this gate can yield is HUMAN_AGENT — dead tags never produced.
    expect((out as { tag?: string }).tag).toBe('HUMAN_AGENT')
  })

  it('BLOCKs with a clear Spanish message when the Human Agent feature is NOT granted', () => {
    const out = resolveMessengerWindowSend({ hoursSinceCustomerMessage: 100, featureGranted: false })
    expect(out).toMatchObject({ blocked: true })
    expect((out as { error?: string }).error).toBeTruthy()
    // Clear Spanish explanation — never a silent drop (T-40-01-03).
    expect((out as { error: string }).error.toLowerCase()).toMatch(/ventana|24|human agent|permiso/)
  })
})

describe('resolveMessengerWindowSend (D-09) — beyond 7 days → BLOCK', () => {
  it('BLOCKs even when the feature is granted (HUMAN_AGENT is a 7-day window)', () => {
    const out = resolveMessengerWindowSend({ hoursSinceCustomerMessage: 200, featureGranted: true })
    expect(out).toMatchObject({ blocked: true })
    expect(out).not.toHaveProperty('tag')
  })
})

describe('resolveMessengerWindowSend (D-09) — table coverage', () => {
  it.each(cases)('produces a defined outcome for $label', ({ hoursSince, featureGranted }) => {
    const out = resolveMessengerWindowSend({ hoursSinceCustomerMessage: hoursSince, featureGranted })
    expect(out).toBeDefined()
    // Every outcome is exactly one of: a RESPONSE/MESSAGE_TAG send, or a block.
    const isSend = 'messaging_type' in (out as object)
    const isBlock = (out as { blocked?: boolean }).blocked === true
    expect(isSend || isBlock).toBe(true)
  })
})
