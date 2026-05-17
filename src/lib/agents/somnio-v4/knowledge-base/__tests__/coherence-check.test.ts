import { describe, it, expect } from 'vitest'
import { coherenceCheck } from '../coherence-check'
import type { ParsedKbDoc } from '../parser'

/**
 * Helper para construir un `sections` válido por defecto. Cada test puede
 * sobreescribir el campo que quiere probar pasando un partial.
 */
function buildSections(overrides: Partial<ParsedKbDoc['sections']> = {}): ParsedKbDoc['sections'] {
  return {
    hechosDelProducto: 'Hechos válidos del producto.',
    posicionDelNegocio: 'Posición editorial del negocio.',
    debeContener: ['[SIEMPRE] mencionar X', '[SI APLICA] ofrecer Y'],
    nuncaDecir: [],
    cuandoEscalar: [],
    ...overrides,
  }
}

describe('coherenceCheck — folder vs frontmatter category (D-48)', () => {
  it('passes when folder matches category and sections are populated', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections(),
      ),
    ).not.toThrow()
  })

  it('throws when folder does not match category', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/policies/x.md',
        'product',
        buildSections(),
      ),
    ).toThrow(/Coherence fail/)
  })

  it('handles backslash paths (Windows) same as forward-slash', () => {
    expect(() =>
      coherenceCheck(
        'src\\lib\\agents\\somnio-v4\\knowledge\\product\\x.md',
        'product',
        buildSections(),
      ),
    ).not.toThrow()
  })
})

describe('coherenceCheck — secciones requeridas pobladas (D-01 RAG-generative)', () => {
  it('throws when hechosDelProducto is empty string', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ hechosDelProducto: '' }),
      ),
    ).toThrow(/Hechos del producto/)
  })

  it('throws when hechosDelProducto is only whitespace', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ hechosDelProducto: '   \n\t  ' }),
      ),
    ).toThrow(/Hechos del producto/)
  })

  it('throws when posicionDelNegocio is empty string', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ posicionDelNegocio: '' }),
      ),
    ).toThrow(/Posición del negocio/)
  })

  it('throws when posicionDelNegocio is only whitespace', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ posicionDelNegocio: '   ' }),
      ),
    ).toThrow(/Posición del negocio/)
  })

  it('throws when debeContener is empty array', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ debeContener: [] }),
      ),
    ).toThrow(/Debe contener/)
  })
})

describe('coherenceCheck — prefijos [SIEMPRE] / [SI APLICA] (D-03)', () => {
  it('throws when a debeContener item is missing the prefix', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({
          debeContener: [
            '[SIEMPRE] item válido',
            'item sin prefijo', // <- viola D-03
          ],
        }),
      ),
    ).toThrow(/SIEMPRE.*SI APLICA|SI APLICA.*SIEMPRE/)
  })

  it('throws when a debeContener item has wrong prefix style ([ALWAYS] en vez de [SIEMPRE])', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({
          debeContener: ['[ALWAYS] should fail because regex requires Spanish prefix'],
        }),
      ),
    ).toThrow(/Debe contener/)
  })

  it('passes when ALL items have valid prefixes', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({
          debeContener: [
            '[SIEMPRE] item 1',
            '[SI APLICA] item 2',
            '[SIEMPRE] item 3',
          ],
        }),
      ),
    ).not.toThrow()
  })
})

describe('coherenceCheck — nuncaDecir + cuandoEscalar pueden ser vacíos (topics no-edge-case)', () => {
  it('passes when nuncaDecir is empty array', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ nuncaDecir: [] }),
      ),
    ).not.toThrow()
  })

  it('passes when cuandoEscalar is empty array', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ cuandoEscalar: [] }),
      ),
    ).not.toThrow()
  })

  it('passes when both nuncaDecir and cuandoEscalar are empty', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ nuncaDecir: [], cuandoEscalar: [] }),
      ),
    ).not.toThrow()
  })

  it('passes when all sections are fully populated (happy path edge-case topic)', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/edge-cases/interaccion_alcohol.md',
        'edge-cases',
        buildSections({
          hechosDelProducto: 'Elixir no contiene alcohol pero contiene melatonina.',
          posicionDelNegocio: 'No recomendamos mezclar.',
          debeContener: [
            '[SIEMPRE] desaconsejar mezclar con alcohol',
            '[SI APLICA] sugerir esperar 4h tras consumo de alcohol',
          ],
          nuncaDecir: ['decir que no hay riesgo'],
          cuandoEscalar: ['cliente reporta intoxicación'],
        }),
      ),
    ).not.toThrow()
  })

  it('throws when nuncaDecir is NOT an array (defensive)', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        // Simulamos un payload mal formado bypassing TS para probar defensive.
        buildSections({ nuncaDecir: 'not-an-array' as unknown as string[] }),
      ),
    ).toThrow(/NUNCA decir.*array/)
  })

  it('throws when cuandoEscalar is NOT an array (defensive)', () => {
    expect(() =>
      coherenceCheck(
        'src/lib/agents/somnio-v4/knowledge/product/x.md',
        'product',
        buildSections({ cuandoEscalar: 'not-an-array' as unknown as string[] }),
      ),
    ).toThrow(/Cuándo escalar.*array/)
  })
})
