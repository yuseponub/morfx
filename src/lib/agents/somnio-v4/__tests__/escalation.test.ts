/**
 * Tests for decideSubLoopReason — pure function del PATH DEL AGENTE (slot resolver).
 *
 * Standalone: somnio-sales-v4 / Plan 07 Task 6. Limpieza: somnio-v4-consolidation / Plan 02.
 *
 * Verifica:
 * - Happy path (todas condiciones false) → null
 * - low_confidence cuando confidence < threshold
 * - razonamiento_libre cuando intent === 'razonamiento_libre' (gana sobre confidence alto)
 * - razonamiento_libre cuando intent === 'otro' (D-69 sumidero — gana sobre confidence alto)
 *
 * NOTA (somnio-v4-consolidation D-12 / Pitfall 13): los 2 tests de las ramas
 * `crm_mutation` y `cas_reject` se BORRARON junto con el plumbing que probaban —
 * esos reasons NO son decisión de este path (los maneja el CRM gate vía
 * runCrmSubLoop con el SubLoopReason completo del sub-loop/output-schema.ts, que
 * NO se tocó). Carve-out sancionado del gate D-09.
 */
import { describe, it, expect } from 'vitest'
import { decideSubLoopReason, type EscalationInput } from '../escalation'

describe('decideSubLoopReason — D-02 sub-loop escalation triggers', () => {
  const base: EscalationInput = {
    confidence: 0.8,
    threshold: 0.7,
    intent: 'precio',
  }

  it('returns null on happy path (todas condiciones false)', () => {
    expect(decideSubLoopReason(base)).toBeNull()
  })

  it('returns "low_confidence" when intent_confidence < threshold', () => {
    expect(decideSubLoopReason({ ...base, confidence: 0.5 })).toBe('low_confidence')
  })

  it('returns "razonamiento_libre" when intent is "razonamiento_libre" (gana sobre confidence alto)', () => {
    expect(decideSubLoopReason({ ...base, intent: 'razonamiento_libre', confidence: 0.95 })).toBe(
      'razonamiento_libre',
    )
  })

  it('returns "razonamiento_libre" when intent is "otro" (D-69 sumidero, gana sobre confidence alto)', () => {
    expect(decideSubLoopReason({ ...base, intent: 'otro', confidence: 0.95 })).toBe(
      'razonamiento_libre',
    )
  })
})
