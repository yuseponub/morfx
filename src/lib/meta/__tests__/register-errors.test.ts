import { describe, it, expect } from 'vitest'
import { mapRegisterError } from '../register-errors'
import { MetaGraphApiError } from '../types'

describe('mapRegisterError (Phase 38 Plan 06 — activation chain)', () => {
  it('maps leftover two-step verification (subcode 2388001) → needs_2sv', () => {
    const err = new MetaGraphApiError(
      'Cannot Create Certificate. Please ensure two-factor authentication is disabled.',
      100,
      2388001,
      400,
      'trace1'
    )
    const m = mapRegisterError(err)
    expect(m.status).toBe('needs_2sv')
    expect(m.message).toMatch(/verificaci[óo]n en dos pasos/i)
    expect(m.detail).toContain('two-factor')
  })

  it('maps missing payment method ("Cannot Migrate Phone Number") → needs_payment', () => {
    const err = new MetaGraphApiError(
      "Cannot Migrate Phone Number: Your WhatsApp Business Account doesn't have a payment method set up.",
      100,
      undefined,
      400
    )
    const m = mapRegisterError(err)
    expect(m.status).toBe('needs_payment')
    expect(m.message).toMatch(/m[ée]todo de pago/i)
  })

  it('maps payment-method phrasing without the migrate prefix → needs_payment', () => {
    const err = new MetaGraphApiError('Add a payment method to continue.', 100, undefined, 400)
    expect(mapRegisterError(err).status).toBe('needs_payment')
  })

  it('maps generic "(#100) Invalid parameter" with payment reason in error_data.details → needs_payment (Somnio migration 2026-06-11)', () => {
    // Live case: top-level message is generic, the REAL reason is in error_data.details.
    const err = new MetaGraphApiError(
      '(#100) Invalid parameter',
      100,
      undefined,
      400,
      'traceX',
      "Cannot Migrate Phone Number: Your WhatsApp Business Account doesn't have a payment method set up."
    )
    const m = mapRegisterError(err)
    expect(m.status).toBe('needs_payment')
    expect(m.message).toMatch(/m[ée]todo de pago/i)
    // detail now carries the real reason (message — details), not just the generic top line.
    expect(m.detail).toContain('payment method')
  })

  it('maps generic (#100) with two-step reason in error_data.details → needs_2sv', () => {
    const err = new MetaGraphApiError(
      '(#100) Invalid parameter',
      100,
      undefined,
      400,
      'traceY',
      'Please disable two-step verification before migrating this number.'
    )
    expect(mapRegisterError(err).status).toBe('needs_2sv')
  })

  it('maps an unknown Meta error → register_failed (generic msg, detail preserved)', () => {
    const err = new MetaGraphApiError('Some other Graph error', 100, 999999, 400)
    const m = mapRegisterError(err)
    expect(m.status).toBe('register_failed')
    expect(m.message).toMatch(/no se pudo activar/i)
    expect(m.detail).toBe('Some other Graph error')
  })

  it('maps a non-Meta error (plain Error) → register_failed', () => {
    const m = mapRegisterError(new Error('network down'))
    expect(m.status).toBe('register_failed')
    expect(m.detail).toBe('network down')
  })

  it('maps a non-Error throwable → register_failed with stringified detail', () => {
    const m = mapRegisterError('boom')
    expect(m.status).toBe('register_failed')
    expect(m.detail).toBe('boom')
  })
})
