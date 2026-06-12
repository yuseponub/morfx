import { describe, it, expect } from 'vitest'
import { buildTemplatesSystemPrompt } from '../system-prompt'

// Guard de regresion: el builder NO debe proponer/incluir footers por su cuenta.
// Origen: template de prueba "Pruebas Morfx" llego con footer "MorfX" que el robot
// agrego sin que el usuario lo pidiera (el prompt listaba footer como parte del
// borrador inicial y no tenia candado). El footer solo debe existir si el usuario
// lo pide EXPLICITAMENTE.
describe('buildTemplatesSystemPrompt — candado de footer', () => {
  const prompt = buildTemplatesSystemPrompt('ws-test')

  it('declara que el footer NO se incluye por defecto', () => {
    expect(prompt).toContain('El footer NO se incluye por defecto')
  })

  it('exige que el footer solo se agregue si el usuario lo pide explicitamente', () => {
    expect(prompt).toMatch(/footer[\s\S]{0,200}usuario lo pida EXPLICITAMENTE/i)
  })

  it('prohibe inventar una firma de marca por su cuenta', () => {
    expect(prompt).toContain('NUNCA inventes una firma de marca')
  })

  it('incluye la prohibicion final de agregar footer por cuenta propia', () => {
    expect(prompt).toContain('NUNCA** agregues un footer por tu cuenta')
  })
})

// Origen: Standalone template-builder-suggested-actions — Plan 01.
// La tool 8 (suggestActions) se instruye SIN debilitar la REGLA CERO
// (Pitfall 1) y prohibiendo AI-chips de confirmacion (Pitfall 2 capa 2).
describe('buildTemplatesSystemPrompt — suggestActions', () => {
  const prompt = buildTemplatesSystemPrompt('ws-test')

  it('menciona la tool suggestActions', () => {
    expect(prompt).toContain('suggestActions')
  })

  it('actualiza el conteo de tools a 8', () => {
    expect(prompt).toContain('estas 8 tools')
  })

  it('prohibe llamarla como primera tool del turno (Pitfall 1)', () => {
    expect(prompt).toContain('NUNCA la llames como primera tool del turno')
  })

  it('prohibe sugerir acciones de confirmacion/creacion en suggestActions (Pitfall 2)', () => {
    expect(prompt).toContain(
      'NUNCA sugieras acciones de confirmacion o creacion del template',
    )
  })

  it('mantiene la REGLA CERO intacta (no se debilita por la tool nueva)', () => {
    expect(prompt).toContain(
      'REGLA CERO (la mas importante de todas, no la rompas nunca)',
    )
    expect(prompt).toContain(
      '**ANTES** de escribir cualquier texto al usuario, **DEBES** llamar la tool',
    )
  })
})
