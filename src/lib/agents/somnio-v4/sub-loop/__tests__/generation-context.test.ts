// ============================================================================
// Tests for #2 v4-subloop-context-pass — stateContext inyectado en
// buildGenerationPrompt (C-01/C-02/C-03/C-04).
//
// Standalone: v4-subloop-context-pass / Plan 01 Task 3.
//
// Casos:
//   A. stateContext poblado → sección "CONTEXTO DE LA CONVERSACIÓN" presente
//      con datos del cliente, atendidoPrevio labels, y últimas respuestas del bot.
//   B. sin stateContext (llamada sin 4º arg) → sección ausente (anti-regresión).
//   C. stateContext con arrays vacíos y datosCapturados vacío → sección omitida.
//   D. solo un campo poblado (recentBotMessages) → sección presente solo con ese campo.
//   E. instrucción ligera incluida cuando sección presente.
//   F. SubLoopContext acepta stateContext? optional — crm-gate sin el campo compila.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { buildGenerationPrompt } from '../prompt'
import type { GenerationStateContext } from '../prompt'
import type { SubLoopContext } from '../index'

// Material mínimo para construir un prompt válido
const MATERIAL_MINIMAL: Parameters<typeof buildGenerationPrompt>[0] = {
  hechos: 'Elixir del Sueño contiene melatonina y pasiflora.',
  posicion: 'Recomendar toma 30 min antes de dormir.',
  debe_contener_aplicables: ['mencionar dosis'],
  nunca_decir: [],
  cuando_escalar: [],
}

const TONE_OVERRIDE = 'Tono de prueba.'

// ============================================================================
// Caso A: stateContext poblado → sección presente con todas las señales
// ============================================================================
describe('buildGenerationPrompt — Caso A: stateContext poblado', () => {
  const ctx: GenerationStateContext = {
    datosCapturados: { pack: 'x3', nombre: 'Ana', ciudad: 'Bogotá' },
    atendidoPrevio: [
      { kind: 'template_intent', intent: 'precio', templateIds: ['precio-core'] },
      { kind: 'kb_topic', topic: 'contraindicaciones', confidence: 0.85, texto: 'texto', turno: 2 },
    ],
    recentBotMessages: ['Hola Ana, ¿en qué te puedo ayudar?', 'El precio del pack x3 es $180.000.'],
  }

  const prompt = buildGenerationPrompt(MATERIAL_MINIMAL, TONE_OVERRIDE, [], ctx)

  it('contiene la cabecera CONTEXTO DE LA CONVERSACIÓN', () => {
    expect(prompt).toContain('## CONTEXTO DE LA CONVERSACIÓN (no lo repitas)')
  })

  it('incluye datos del cliente serializados legiblemente', () => {
    expect(prompt).toContain('pack: x3')
    expect(prompt).toContain('nombre: Ana')
    expect(prompt).toContain('ciudad: Bogotá')
  })

  it('incluye labels semánticos de atendidoPrevio', () => {
    expect(prompt).toContain('template_intent:precio')
    expect(prompt).toContain('kb_topic:contraindicaciones')
  })

  it('incluye las últimas respuestas del bot (slice -2)', () => {
    expect(prompt).toContain('El precio del pack x3 es $180.000.')
  })

  it('incluye la instrucción de no repetir', () => {
    expect(prompt).toContain('Instrucción: responde SOLO lo nuevo que pregunta el cliente.')
  })

  it('la sección aparece ANTES del material del topic (pre-REGLAS)', () => {
    const ctxIdx = prompt.indexOf('CONTEXTO DE LA CONVERSACIÓN')
    const reglaIdx = prompt.indexOf('REGLAS DURAS DE ANTI-INVENCIÓN')
    expect(ctxIdx).toBeGreaterThan(-1)
    expect(reglaIdx).toBeGreaterThan(-1)
    expect(ctxIdx).toBeLessThan(reglaIdx)
  })
})

// ============================================================================
// Caso B: sin stateContext → sección ausente (anti-regresión)
// ============================================================================
describe('buildGenerationPrompt — Caso B: sin stateContext (anti-regresión)', () => {
  // Llamada con 3 args igual que hoy (sin stateContext)
  const promptSin = buildGenerationPrompt(MATERIAL_MINIMAL, TONE_OVERRIDE, [])

  it('NO contiene la cabecera CONTEXTO DE LA CONVERSACIÓN cuando stateContext es undefined', () => {
    expect(promptSin).not.toContain('CONTEXTO DE LA CONVERSACIÓN')
  })

  it('NO contiene la instrucción de no repetir cuando stateContext es undefined', () => {
    expect(promptSin).not.toContain('Instrucción: responde SOLO lo nuevo')
  })

  it('sigue conteniendo el material del topic (sin regresión funcional)', () => {
    expect(promptSin).toContain('MATERIAL DEL TOPIC SELECCIONADO')
    expect(promptSin).toContain('Elixir del Sueño contiene melatonina')
  })

  it('sigue conteniendo las REGLAS DURAS (sin regresión funcional)', () => {
    expect(promptSin).toContain('REGLAS DURAS DE ANTI-INVENCIÓN')
  })

  // stateContext explícitamente null → mismo resultado
  const promptNull = buildGenerationPrompt(MATERIAL_MINIMAL, TONE_OVERRIDE, [], null)

  it('NO contiene la sección cuando stateContext es null explícito', () => {
    expect(promptNull).not.toContain('CONTEXTO DE LA CONVERSACIÓN')
  })

  it('prompt sin stateContext y prompt con null son idénticos', () => {
    expect(promptSin).toBe(promptNull)
  })
})

// ============================================================================
// Caso C: stateContext con arrays vacíos y datosCapturados vacío → sección omitida
// ============================================================================
describe('buildGenerationPrompt — Caso C: stateContext con campos vacíos', () => {
  const ctxVacio: GenerationStateContext = {
    datosCapturados: {},
    atendidoPrevio: [],
    recentBotMessages: [],
  }

  const prompt = buildGenerationPrompt(MATERIAL_MINIMAL, TONE_OVERRIDE, [], ctxVacio)

  it('NO contiene la cabecera cuando todos los arrays están vacíos', () => {
    expect(prompt).not.toContain('CONTEXTO DE LA CONVERSACIÓN')
  })

  it('NO imprime líneas vacías tipo "Ya se atendió: " cuando atendidoPrevio es []', () => {
    expect(prompt).not.toContain('Ya se atendió')
  })

  it('NO imprime datos vacíos cuando datosCapturados es {}', () => {
    expect(prompt).not.toContain('Datos del cliente:')
  })
})

// ============================================================================
// Caso D: solo recentBotMessages poblado → sección presente solo con ese campo
// ============================================================================
describe('buildGenerationPrompt — Caso D: solo recentBotMessages', () => {
  const ctxParcial: GenerationStateContext = {
    datosCapturados: {},
    atendidoPrevio: [],
    recentBotMessages: ['Recuerda que puedes pagar por transferencia.'],
  }

  const prompt = buildGenerationPrompt(MATERIAL_MINIMAL, TONE_OVERRIDE, [], ctxParcial)

  it('contiene la sección cuando solo recentBotMessages tiene contenido', () => {
    expect(prompt).toContain('CONTEXTO DE LA CONVERSACIÓN')
  })

  it('incluye el último mensaje del bot', () => {
    expect(prompt).toContain('Recuerda que puedes pagar por transferencia.')
  })

  it('NO imprime "Datos del cliente:" cuando datosCapturados es vacío', () => {
    expect(prompt).not.toContain('Datos del cliente:')
  })

  it('NO imprime "Ya se atendió" cuando atendidoPrevio es vacío', () => {
    expect(prompt).not.toContain('Ya se atendió')
  })
})

// ============================================================================
// Caso E: instrucción ligera siempre incluida cuando sección presente
// ============================================================================
describe('buildGenerationPrompt — Caso E: instrucción ligera', () => {
  const ctx: GenerationStateContext = {
    datosCapturados: { nombre: 'Luis' },
  }

  const prompt = buildGenerationPrompt(MATERIAL_MINIMAL, TONE_OVERRIDE, [], ctx)

  it('incluye NO repitas instrucción cuando la sección está presente', () => {
    expect(prompt).toContain('NO repitas lo ya dicho arriba ni vuelvas a saludar')
  })
})

// ============================================================================
// Caso F: SubLoopContext tipado — stateContext? es opcional
// ============================================================================
describe('SubLoopContext — stateContext es campo opcional', () => {
  it('acepta SubLoopContext sin stateContext (crm-gate path)', () => {
    // Este test verifica que el tipo compile con stateContext ausente.
    // Si TypeScript fallara, tsc --noEmit lo detectaría; este test
    // documenta la intención para lectores humanos.
    const ctxSinStateContext: SubLoopContext = {
      workspaceId: 'ws-123',
      conversationId: 'conv-456',
      sessionId: 'sess-789',
      userMessage: 'hola',
      recentMessages: [],
      // Sin stateContext → path CRM, campo ausente OK
    }
    expect(ctxSinStateContext.stateContext).toBeUndefined()
  })

  it('acepta SubLoopContext con stateContext poblado (RAG path)', () => {
    const ctxConStateContext: SubLoopContext = {
      workspaceId: 'ws-123',
      conversationId: 'conv-456',
      sessionId: 'sess-789',
      userMessage: 'quiero saber el precio',
      recentMessages: [],
      stateContext: {
        datosCapturados: { pack: 'x1' },
        atendidoPrevio: [],
        recentBotMessages: ['Hola, ¿en qué te ayudo?'],
      },
    }
    expect(ctxConStateContext.stateContext?.datosCapturados?.pack).toBe('x1')
  })
})
