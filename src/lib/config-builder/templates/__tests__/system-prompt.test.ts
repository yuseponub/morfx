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
