/**
 * Standalone v4-observability-completeness — Plan 04 (D-01 "una sola fuente").
 *
 * Verifica que el runner propaga el motivo REAL del error (output.errorMessage) — redactado,
 * truncado y SIN stack — al error.message del chat del operador, en formato
 * `V4_AGENT_ERROR @ {stage}: {motivo}`, manteniendo el code V4_AGENT_ERROR IDÉNTICO
 * (Pitfall 4 / Regla 6) y sin frames de stack (Pitfall 5).
 */
import { describe, it, expect } from 'vitest'
import { buildCleanErrorMessage } from '../v4-production-runner'
import type { V4AgentOutput } from '../../somnio-v4/types'

function makeOutput(partial: Partial<V4AgentOutput>): V4AgentOutput {
  return {
    success: false,
    messages: [],
    ...partial,
  } as V4AgentOutput
}

describe('buildCleanErrorMessage (D-01 — motivo limpio al chat)', () => {
  it('Test 1: incluye el stage y strippea el stack tras el `::`', () => {
    const output = makeOutput({
      success: false,
      errorStage: 'crm-gate',
      errorMessage: 'boom reason :: at foo (x.ts:1) | at bar (y.ts:2)',
    })
    expect(buildCleanErrorMessage(output)).toBe('V4_AGENT_ERROR @ crm-gate: boom reason')
  })

  it('Test 2: el mensaje NO contiene frames de stack (Pitfall 5)', () => {
    const output = makeOutput({
      success: false,
      errorStage: 'sub-loop-slot',
      errorMessage: 'algo falló :: at handler (file.ts:42) | at runSubLoop (idx.ts:7)',
    })
    const msg = buildCleanErrorMessage(output)
    expect(msg).not.toContain(' | ')
    expect(msg).not.toContain('at ')
    expect(msg).not.toContain('.ts:')
  })

  it('Test 3: el formato siempre arranca con V4_AGENT_ERROR (code intacto — Pitfall 4)', () => {
    const withStage = buildCleanErrorMessage(
      makeOutput({ success: false, errorStage: 'guards', errorMessage: 'x' })
    )
    const noStage = buildCleanErrorMessage(makeOutput({ success: false, errorMessage: 'y' }))
    expect(withStage.startsWith('V4_AGENT_ERROR')).toBe(true)
    expect(noStage.startsWith('V4_AGENT_ERROR')).toBe(true)
  })

  it('Test 5a: errorMessage ausente → fallback genérico sin reventar', () => {
    const output = makeOutput({ success: false, errorStage: 'comprehension' })
    expect(buildCleanErrorMessage(output)).toBe(
      'V4_AGENT_ERROR @ comprehension: V4 agent processing failed'
    )
  })

  it('Test 5b: errorStage ausente → formato sin ` @ undefined`', () => {
    const output = makeOutput({ success: false, errorMessage: 'reason sola' })
    const msg = buildCleanErrorMessage(output)
    expect(msg).toBe('V4_AGENT_ERROR: reason sola')
    expect(msg).not.toContain('undefined')
    expect(msg).not.toContain(' @ ')
  })

  it('Test 6: el motivo se trunca a ~150 chars (bodyTruncate)', () => {
    const longReason = 'a'.repeat(400)
    const output = makeOutput({
      success: false,
      errorStage: 'response-track',
      errorMessage: `${longReason} :: at foo (x.ts:1)`,
    })
    const msg = buildCleanErrorMessage(output)
    // 150 chars truncados + '…' (el prefijo `V4_AGENT_ERROR @ response-track: ` se suma aparte).
    expect(msg).toContain('…')
    // el motivo no puede contener los 400 chars completos.
    expect(msg.length).toBeLessThan(400)
    // el stack NUNCA aparece aunque el reason sea largo.
    expect(msg).not.toContain('at ')
  })
})
