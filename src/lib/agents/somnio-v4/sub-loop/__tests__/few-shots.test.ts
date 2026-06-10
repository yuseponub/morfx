// ============================================================================
// Tests for sub-loop/few-shots.ts + sub-loop/prompt.ts buildGenerationPrompt
// integration with FEW_SHOTS.
//
// Standalone: somnio-v4-rag-generative / Plan 04 (Wave 3).
//
// Coverage:
//   FEW_SHOTS structure:
//     1. has 8-10 few-shots total (M4 — Plan 04 ships 10).
//     2. covers all 5 confidence buckets (M2 + M4).
//     3. uses ONLY the 5 discrete confidence values (no fluid 0.42 / 0.67).
//     4. has at least 1 of each binary backstop value (M3).
//     5. all few-shots have non-empty rationale + pregunta + material.
//     6. FUERA_SCOPE cases have empty respuesta (handoff silente).
//     7. binary mapping sanity:
//        - 0.95 → RESPONDE_BIEN
//        - 0.20 → FUERA_SCOPE
//        - 0.40 → FALTA_INFO
//
//   buildGenerationPrompt with FEW_SHOTS:
//     8. prompt contains M1 probability framing ("PROBABILIDAD" + "compañero experto").
//     9. prompt lists the 5 discrete buckets (M2).
//    10. prompt instructs the binary backstop (M3 — 3 enum values).
//    11. prompt includes few-shots block when FEW_SHOTS not empty.
//    12. prompt includes material sections (Hechos/Posición/etc).
//    13. when fewShots: [] explicit → block shows fallback text (not example placeholder).
// ============================================================================

import { describe, it, expect } from 'vitest'
import { FEW_SHOTS } from '../few-shots'
import { buildGenerationPrompt } from '../prompt'

describe('FEW_SHOTS structure', () => {
  it('has 8-10 few-shots total (M4 — Plan 04 ships 10)', () => {
    expect(FEW_SHOTS.length).toBeGreaterThanOrEqual(8)
    expect(FEW_SHOTS.length).toBeLessThanOrEqual(10)
  })

  it('covers all 5 confidence buckets (M2 + M4)', () => {
    const buckets = new Set(FEW_SHOTS.map((f) => f.confidence))
    expect(buckets.has(0.2)).toBe(true)
    expect(buckets.has(0.4)).toBe(true)
    expect(buckets.has(0.6)).toBe(true)
    expect(buckets.has(0.8)).toBe(true)
    expect(buckets.has(0.95)).toBe(true)
  })

  it('uses ONLY the 5 discrete confidence values (no fluid values like 0.42/0.67)', () => {
    const allowed = new Set([0.2, 0.4, 0.6, 0.8, 0.95])
    for (const fs of FEW_SHOTS) {
      expect(allowed.has(fs.confidence)).toBe(true)
    }
  })

  it('has at least 2 few-shots per bucket (M4 cobertura del rango completo)', () => {
    const counts: Record<string, number> = {}
    for (const fs of FEW_SHOTS) {
      const key = fs.confidence.toString()
      counts[key] = (counts[key] ?? 0) + 1
    }
    for (const bucket of ['0.2', '0.4', '0.6', '0.8', '0.95']) {
      expect(counts[bucket]).toBeGreaterThanOrEqual(2)
    }
  })

  it('has at least 1 of each binary backstop value (M3)', () => {
    const binaries = new Set(FEW_SHOTS.map((f) => f.binary))
    expect(binaries.has('RESPONDE_BIEN')).toBe(true)
    expect(binaries.has('FALTA_INFO')).toBe(true)
    expect(binaries.has('FUERA_SCOPE')).toBe(true)
  })

  it('all few-shots have non-empty pregunta + material + rationale', () => {
    for (const fs of FEW_SHOTS) {
      expect(fs.pregunta.length).toBeGreaterThan(0)
      expect(fs.material.length).toBeGreaterThan(0)
      expect(fs.rationale.length).toBeGreaterThan(0)
    }
  })

  it('material field includes at least one KB section marker ([Hechos] / [Posición] / [Debe contener])', () => {
    for (const fs of FEW_SHOTS) {
      const hasMarker =
        fs.material.includes('[Hechos]') ||
        fs.material.includes('[Posición]') ||
        fs.material.includes('[Debe contener]')
      expect(hasMarker).toBe(true)
    }
  })

  it('FUERA_SCOPE cases have empty respuesta (handoff silente)', () => {
    const fueraScope = FEW_SHOTS.filter((f) => f.binary === 'FUERA_SCOPE')
    for (const fs of fueraScope) {
      expect(fs.respuesta).toBe('')
    }
  })

  it('binary mapping sanity: confidence 0.95 → RESPONDE_BIEN', () => {
    const high = FEW_SHOTS.filter((f) => f.confidence === 0.95)
    for (const fs of high) {
      expect(fs.binary).toBe('RESPONDE_BIEN')
    }
  })

  it('binary mapping sanity: confidence 0.20 → FUERA_SCOPE', () => {
    const low = FEW_SHOTS.filter((f) => f.confidence === 0.2)
    for (const fs of low) {
      expect(fs.binary).toBe('FUERA_SCOPE')
    }
  })

  it('binary mapping sanity: confidence 0.40 → FALTA_INFO', () => {
    const midLow = FEW_SHOTS.filter((f) => f.confidence === 0.4)
    for (const fs of midLow) {
      expect(fs.binary).toBe('FALTA_INFO')
    }
  })
})

describe('buildGenerationPrompt with FEW_SHOTS (default)', () => {
  const mockMaterial = {
    hechos: 'mock hechos del producto',
    posicion: 'mock posicion del negocio',
    debe_contener_aplicables: ['[SIEMPRE] mock item aplicable'],
    nunca_decir: ['mock NUNCA decir item'],
    cuando_escalar: ['mock cuando escalar item'],
  }

  it('prompt contains M1 probability framing', () => {
    const prompt = buildGenerationPrompt(mockMaterial)
    expect(prompt).toMatch(/PROBABILIDAD/)
    expect(prompt).toMatch(/cumpla FIELMENTE la Posición del negocio/)
  })

  it('prompt lists the 5 discrete buckets (M2)', () => {
    const prompt = buildGenerationPrompt(mockMaterial)
    expect(prompt).toContain('0.20')
    expect(prompt).toContain('0.40')
    expect(prompt).toContain('0.60')
    expect(prompt).toContain('0.80')
    expect(prompt).toContain('0.95')
  })

  it('prompt instructs the binary backstop (M3 — 3 enum values)', () => {
    const prompt = buildGenerationPrompt(mockMaterial)
    expect(prompt).toContain('RESPONDE_BIEN')
    expect(prompt).toContain('FALTA_INFO')
    expect(prompt).toContain('FUERA_SCOPE')
  })

  it('prompt includes few-shots block when default (FEW_SHOTS) is used', () => {
    const prompt = buildGenerationPrompt(mockMaterial)
    expect(prompt).toMatch(/EJEMPLOS DE CALIBRACIÓN/)
    expect(prompt).toMatch(/Few-shot 1/)
  })

  it('prompt renders all 10 few-shots when FEW_SHOTS default is used', () => {
    const prompt = buildGenerationPrompt(mockMaterial)
    for (let i = 1; i <= FEW_SHOTS.length; i += 1) {
      expect(prompt).toContain(`Few-shot ${i}`)
    }
  })

  it('prompt includes material sections (Hechos/Posición/NUNCA/etc)', () => {
    const prompt = buildGenerationPrompt(mockMaterial)
    expect(prompt).toContain('mock hechos del producto')
    expect(prompt).toContain('mock posicion del negocio')
    expect(prompt).toContain('mock NUNCA decir item')
    expect(prompt).toContain('mock cuando escalar item')
  })

  it('prompt includes anti-invention rules + tone base', () => {
    const prompt = buildGenerationPrompt(mockMaterial)
    expect(prompt).toMatch(/ANTI-INVENCIÓN/)
    expect(prompt).toMatch(/Tono Somnio/i)
  })
})

describe('buildGenerationPrompt with explicit empty fewShots', () => {
  const mockMaterial = {
    hechos: 'h',
    posicion: 'p',
    // Plan 09: discriminated union — arrays son required (pueden ser []), no null.
    debe_contener_aplicables: [],
    nunca_decir: [],
    cuando_escalar: [],
  }

  it('renders fallback text when fewShots: [] explicit (no broken placeholder)', () => {
    const prompt = buildGenerationPrompt(mockMaterial, undefined, [])
    expect(prompt).toMatch(/sin few-shots/)
    // No debe contener el placeholder antiguo de Plan 03 ni "EJEMPLOS DE CALIBRACIÓN"
    expect(prompt).not.toMatch(/EJEMPLOS DE CALIBRACIÓN/)
    expect(prompt).not.toMatch(/Plan 04 inyectará/)
  })
})
