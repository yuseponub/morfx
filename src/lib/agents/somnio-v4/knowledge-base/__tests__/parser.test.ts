import { describe, it, expect } from 'vitest'
import { parseKbDoc } from '../parser'

describe('parseKbDoc', () => {
  it('parses valid frontmatter and body with all sections', () => {
    const raw = `---
topic: precio
keywords: [precio, costo]
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Respuesta canónica
50 USD el frasco.

## Si el cliente insiste
Promo 2x1 disponible.

## NUNCA decir
- comparar con competencia
- mentir sobre stock

## Sources
catalog.md
`
    const result = parseKbDoc(raw, 'kb/product/precio.md')
    expect(result.frontmatter.topic).toBe('precio')
    expect(result.frontmatter.keywords).toEqual(['precio', 'costo'])
    expect(result.frontmatter.category).toBe('product')
    expect(result.frontmatter.last_reviewed).toBe('2026-05-01')
    expect(result.frontmatter.reviewed_by).toBe('jose')
    expect(result.sections.canonica).toContain('50 USD')
    expect(result.sections.alternativa).toContain('Promo 2x1')
    expect(result.sections.nuncaDecir).toEqual(['comparar con competencia', 'mentir sobre stock'])
    expect(result.sections.sources).toContain('catalog.md')
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

  it('returns empty nuncaDecir when section absent', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Respuesta canónica
hi
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.nuncaDecir).toEqual([])
  })

  it('recognizes "Respuesta canonica" without accent', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Respuesta canonica
sin tilde funciona
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.canonica).toContain('sin tilde funciona')
  })

  it('silently ignores unknown headers', () => {
    const raw = `---
topic: foo
keywords: []
category: product
last_reviewed: 2026-05-01
reviewed_by: jose
---

## Respuesta canónica
hello

## Otro header desconocido
nada importante

## NUNCA decir
- algo
`
    const result = parseKbDoc(raw, 'kb/product/x.md')
    expect(result.sections.canonica).toContain('hello')
    expect(result.sections.nuncaDecir).toEqual(['algo'])
  })
})
