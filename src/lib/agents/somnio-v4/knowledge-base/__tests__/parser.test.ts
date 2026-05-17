import { describe, it, expect } from 'vitest'
import { parseKbDoc } from '../parser'

describe('parseKbDoc — somnio-v4-rag-generative shape (D-01 + D-05)', () => {
  it('parses valid frontmatter and all 5 RAG sections', () => {
    const raw = `---
topic: precio
keywords: [precio, costo]
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
Elixir del Sueño viene en frasco de 30ml.
Precio: $50.000 COP.

## Posición del negocio
Producto premium, no competimos por precio.
Posición: calidad sobre cantidad.

## Debe contener la respuesta
- [SIEMPRE] mencionar precio explícito
- [SI APLICA] ofrecer promo 2x1 si cliente pregunta por descuento

## NUNCA decir
- comparar con competencia
- mentir sobre stock

## Cuándo escalar a humano
- pregunta por factura electrónica
- queja sobre devolución
`
    const result = parseKbDoc(raw, 'kb/product/precio.md')
    expect(result.frontmatter.topic).toBe('precio')
    expect(result.frontmatter.keywords).toEqual(['precio', 'costo'])
    expect(result.frontmatter.category).toBe('product')
    expect(result.frontmatter.last_reviewed).toBe('2026-05-01')
    expect(result.frontmatter.reviewed_by).toBe('jose')

    // D-01 #2..#6 — 5 markdown sections nuevas.
    expect(result.sections.hechosDelProducto).toContain('frasco de 30ml')
    expect(result.sections.hechosDelProducto).toContain('$50.000 COP')
    expect(result.sections.posicionDelNegocio).toContain('Producto premium')
    expect(result.sections.posicionDelNegocio).toContain('calidad sobre cantidad')
    expect(result.sections.debeContener).toEqual([
      '[SIEMPRE] mencionar precio explícito',
      '[SI APLICA] ofrecer promo 2x1 si cliente pregunta por descuento',
    ])
    expect(result.sections.nuncaDecir).toEqual([
      'comparar con competencia',
      'mentir sobre stock',
    ])
    expect(result.sections.cuandoEscalar).toEqual([
      'pregunta por factura electrónica',
      'queja sobre devolución',
    ])
  })

  it('throws on missing topic', () => {
    const raw = `---
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---
body
`
    expect(() => parseKbDoc(raw, 'kb/product/x.md')).toThrow(/topic/)
  })

  it('throws on category outside enum', () => {
    const raw = `---
topic: foo
keywords: []
category: invalid_category
last_reviewed: 2026-05-01
reviewed_by: jose
---
body
`
    expect(() => parseKbDoc(raw, 'kb/product/x.md')).toThrow(/category/)
  })

  it('throws on last_reviewed with wrong format MM-DD-YYYY', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 05-01-2026
reviewed_by: jose
---
body
`
    expect(() => parseKbDoc(raw, 'kb/product/x.md')).toThrow(/YYYY-MM-DD/)
  })

  it('parses NUNCA decir bullets into string[]', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## NUNCA decir
- a
- b
- c
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.nuncaDecir).toEqual(['a', 'b', 'c'])
  })

  it('returns empty arrays + empty strings when sections absent', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
solo hechos
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.hechosDelProducto).toContain('solo hechos')
    expect(result.sections.posicionDelNegocio).toBe('')
    expect(result.sections.debeContener).toEqual([])
    expect(result.sections.nuncaDecir).toEqual([])
    expect(result.sections.cuandoEscalar).toEqual([])
  })

  it('silently ignores deprecated headers (Respuesta canónica, Si el cliente insiste, Sources)', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Respuesta canónica
DEPRECATED — debe ignorarse silenciosamente.

## Si el cliente insiste
DEPRECATED — debe ignorarse silenciosamente.

## Hechos del producto
hechos válidos.

## Posición del negocio
posición válida.

## Debe contener la respuesta
- [SIEMPRE] mencionar algo

## Sources
DEPRECATED — debe ignorarse silenciosamente.
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    // Deprecated headers are silently ignored — no throw, no leakage into shape.
    expect(result.sections.hechosDelProducto).toContain('hechos válidos')
    expect(result.sections.posicionDelNegocio).toContain('posición válida')
    expect(result.sections.debeContener).toEqual(['[SIEMPRE] mencionar algo'])
    // El shape nuevo NO tiene canonica/alternativa/sources — TypeScript ya lo prohíbe,
    // pero verificamos defensivamente que no aparezcan keys runtime.
    expect((result.sections as Record<string, unknown>).canonica).toBeUndefined()
    expect((result.sections as Record<string, unknown>).alternativa).toBeUndefined()
    expect((result.sections as Record<string, unknown>).sources).toBeUndefined()
  })

  it('silently ignores unknown headers (no throw)', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
algo

## Otro header desconocido
nada importante

## NUNCA decir
- algo
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.hechosDelProducto).toContain('algo')
    expect(result.sections.nuncaDecir).toEqual(['algo'])
  })

  it('accepts "Posicion del negocio" without accent (defensive)', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
hechos

## Posicion del negocio
sin tilde funciona

## Debe contener la respuesta
- [SIEMPRE] x
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.posicionDelNegocio).toContain('sin tilde funciona')
  })

  it('accepts "Cuando escalar" without accent (defensive)', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
hechos

## Posición del negocio
posición

## Debe contener la respuesta
- [SIEMPRE] x

## Cuando escalar
- pregunta sin tilde
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.cuandoEscalar).toEqual(['pregunta sin tilde'])
  })

  it('accepts shorter header "Debe contener" (without "la respuesta")', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
hechos

## Posición del negocio
posición

## Debe contener
- [SIEMPRE] item corto
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.debeContener).toEqual(['[SIEMPRE] item corto'])
  })

  it('preserves [SIEMPRE] and [SI APLICA] prefixes in debeContener items', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
hechos

## Posición del negocio
posición

## Debe contener la respuesta
- [SIEMPRE] mencionar precio
- [SI APLICA] ofrecer promo si cliente pregunta
- [SIEMPRE] cerrar con CTA
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.debeContener[0]).toMatch(/^\[SIEMPRE\] /)
    expect(result.sections.debeContener[1]).toMatch(/^\[SI APLICA\] /)
    expect(result.sections.debeContener[2]).toMatch(/^\[SIEMPRE\] /)
  })

  describe('tone_override (D-05)', () => {
    it('parses frontmatter without tone_override (optional — most KBs)', () => {
      const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Hechos del producto
hechos
`
      const result = parseKbDoc(raw, 'kb/product/x.md')
      expect(result.frontmatter.tone_override).toBeUndefined()
    })

    it('parses frontmatter with tone_override as string', () => {
      const raw = `---
topic: interaccion_alcohol
keywords: [alcohol]
category: edge-cases
last_reviewed: 2026-05-01
reviewed_by: jose
tone_override: "Tono más serio y empático, sin emojis."
---

## Hechos del producto
hechos edge-case
`
      const result = parseKbDoc(raw, 'kb/edge-cases/interaccion_alcohol.md')
      expect(result.frontmatter.tone_override).toBe(
        'Tono más serio y empático, sin emojis.',
      )
    })

    it('parses frontmatter with tone_override explicitly null', () => {
      const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
tone_override: null
---

## Hechos del producto
hechos
`
      const result = parseKbDoc(raw, 'kb/product/x.md')
      expect(result.frontmatter.tone_override).toBeNull()
    })
  })
})
