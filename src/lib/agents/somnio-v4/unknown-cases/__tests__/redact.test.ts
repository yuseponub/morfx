/**
 * Unit tests para `redactPii` — PII redaction wrapper para mensajes cliente
 * antes de embedding (Plan 09 Task 1, RESEARCH Security recommendation).
 */

import { describe, it, expect } from 'vitest'
import { redactPii } from '../redact'

describe('redactPii', () => {
  it('redacts colombian phone (10 digits)', () => {
    const out = redactPii('Mi telefono es 3001234567 gracias')
    expect(out).not.toContain('3001234567')
    expect(out).toContain('phone****')
    expect(out).toContain('4567') // last 4 digits preserved by phoneSuffix
  })

  it('redacts email', () => {
    const out = redactPii('Mi correo es jose@example.com')
    expect(out).not.toContain('jose@example.com')
    // emailRedact format: head…@domain
    expect(out).toContain('@example.com')
  })

  it('passes through PII-free text unchanged', () => {
    const input = 'Quiero comprar el producto'
    const out = redactPii(input)
    expect(out).toBe(input)
  })

  it('redacts both phone (with + prefix) and email simultaneously', () => {
    const out = redactPii('Llamen al +573001234567 o escriban a jose@x.com')
    expect(out).not.toContain('3001234567')
    expect(out).not.toContain('+573001234567')
    expect(out).not.toContain('jose@x.com')
    expect(out).toContain('phone****')
    expect(out).toContain('@x.com')
  })
})
