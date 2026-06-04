/**
 * Unit tests for the pure interactive-limits validation helper (D-05a, Wave 0).
 *
 * Pure function — NO vi.mock needed (no I/O). Asserts on the returned
 * InteractiveValidationError[] array. The load-bearing case is total-rows <= 10
 * across ALL sections (10 sections × 2 rows = 20 → REJECT) — the limit the
 * meta-whatsapp-sender clamps silently miss (RESEARCH Pitfall 1).
 */

import { describe, it, expect } from 'vitest'
import { validateButtons, validateList, INTERACTIVE_LIMITS } from '@/lib/whatsapp/interactive-limits'

describe('INTERACTIVE_LIMITS — complete Meta limit set', () => {
  it('exports all 13 keys with the Meta values', () => {
    expect(INTERACTIVE_LIMITS).toEqual({
      body: 1024, header: 60, footer: 60,
      maxButtons: 3, buttonTitle: 20, buttonId: 256,
      listButtonLabel: 20, maxSections: 10, sectionTitle: 24,
      maxTotalRows: 10, rowTitle: 24, rowDescription: 72, rowId: 200,
    })
  })
})

describe('validateButtons — Meta limit set', () => {
  const validButtons = {
    body: 'Elige una opción',
    buttons: [
      { id: 'b1', title: 'Sí' },
      { id: 'b2', title: 'No' },
    ],
  }

  it('accepts a valid 1-3 button payload (empty error array)', () => {
    expect(validateButtons(validButtons)).toEqual([])
  })

  it('rejects empty body', () => {
    const errs = validateButtons({ ...validButtons, body: '   ' })
    expect(errs.some(e => e.field === 'body' && e.message === 'El cuerpo es obligatorio')).toBe(true)
  })

  it('rejects body > 1024', () => {
    const errs = validateButtons({ ...validButtons, body: 'x'.repeat(1025) })
    expect(errs.some(e => e.field === 'body')).toBe(true)
  })

  it('rejects header > 60 / footer > 60', () => {
    const errsHeader = validateButtons({ ...validButtons, header: 'h'.repeat(61) })
    expect(errsHeader.some(e => e.field === 'header')).toBe(true)
    const errsFooter = validateButtons({ ...validButtons, footer: 'f'.repeat(61) })
    expect(errsFooter.some(e => e.field === 'footer')).toBe(true)
  })

  it('rejects > 3 buttons', () => {
    const errs = validateButtons({
      body: 'Elige',
      buttons: [
        { id: 'b1', title: 'A' },
        { id: 'b2', title: 'B' },
        { id: 'b3', title: 'C' },
        { id: 'b4', title: 'D' },
      ],
    })
    expect(errs.some(e => e.field === 'buttons' && e.message === 'Máx 3 botones')).toBe(true)
  })

  it('rejects < 1 button', () => {
    const errs = validateButtons({ body: 'Elige', buttons: [] })
    expect(errs.some(e => e.field === 'buttons' && e.message === 'Al menos 1 botón')).toBe(true)
  })

  it('rejects button title > 20 + empty title', () => {
    const errsLong = validateButtons({ body: 'Elige', buttons: [{ id: 'b1', title: 'x'.repeat(21) }] })
    expect(errsLong.some(e => e.field === 'button.0')).toBe(true)
    const errsEmpty = validateButtons({ body: 'Elige', buttons: [{ id: 'b1', title: '   ' }] })
    expect(errsEmpty.some(e => e.field === 'button.0' && e.message === 'Título obligatorio')).toBe(true)
  })

  it('rejects duplicate button ids', () => {
    const errs = validateButtons({
      body: 'Elige',
      buttons: [
        { id: 'dup', title: 'A' },
        { id: 'dup', title: 'B' },
      ],
    })
    expect(errs.some(e => e.field === 'buttons' && e.message === 'IDs de botón duplicados')).toBe(true)
  })
})

describe('validateList — Meta limit set', () => {
  const validList = {
    body: 'Selecciona',
    buttonLabel: 'Ver opciones',
    sections: [
      {
        title: 'Sección 1',
        rows: [
          { id: 'r1', title: 'Opción 1' },
          { id: 'r2', title: 'Opción 2' },
        ],
      },
    ],
  }

  it('accepts a valid list (empty error array)', () => {
    expect(validateList(validList)).toEqual([])
  })

  it('rejects > 10 total rows across ALL sections (10 sections × 2 rows = 20)', () => {
    const sections = Array.from({ length: 10 }, (_, si) => ({
      title: `Sección ${si}`,
      rows: [
        { id: `s${si}_r0`, title: 'Fila A' },
        { id: `s${si}_r1`, title: 'Fila B' },
      ],
    }))
    const totalRows = sections.reduce((n, s) => n + s.rows.length, 0)
    expect(totalRows).toBe(20)
    const errs = validateList({ body: 'Selecciona', buttonLabel: 'Ver', sections })
    expect(errs.some(e => e.field === 'sections' && /10 filas/.test(e.message))).toBe(true)
  })

  it('rejects > 10 sections', () => {
    const sections = Array.from({ length: 11 }, (_, si) => ({
      title: `S${si}`,
      rows: [{ id: `r${si}`, title: 'Fila' }],
    }))
    const errs = validateList({ body: 'Selecciona', buttonLabel: 'Ver', sections })
    expect(errs.some(e => e.field === 'sections' && /secciones/.test(e.message))).toBe(true)
  })

  it('rejects buttonLabel > 20 + empty', () => {
    const errsLong = validateList({ ...validList, buttonLabel: 'x'.repeat(21) })
    expect(errsLong.some(e => e.field === 'buttonLabel')).toBe(true)
    const errsEmpty = validateList({ ...validList, buttonLabel: '   ' })
    expect(errsEmpty.some(e => e.field === 'buttonLabel' && e.message === 'Etiqueta del botón obligatoria')).toBe(true)
  })

  it('rejects row title > 24 + empty', () => {
    const errsLong = validateList({
      body: 'Selecciona', buttonLabel: 'Ver',
      sections: [{ title: 'S', rows: [{ id: 'r1', title: 'x'.repeat(25) }] }],
    })
    expect(errsLong.some(e => e.field === 'row.0.0')).toBe(true)
    const errsEmpty = validateList({
      body: 'Selecciona', buttonLabel: 'Ver',
      sections: [{ title: 'S', rows: [{ id: 'r1', title: '   ' }] }],
    })
    expect(errsEmpty.some(e => e.field === 'row.0.0' && e.message === 'Título obligatorio')).toBe(true)
  })

  it('rejects row description > 72', () => {
    const errs = validateList({
      body: 'Selecciona', buttonLabel: 'Ver',
      sections: [{ title: 'S', rows: [{ id: 'r1', title: 'Opción', description: 'd'.repeat(73) }] }],
    })
    expect(errs.some(e => e.field === 'row.0.0')).toBe(true)
  })

  it('rejects section title > 24', () => {
    const errs = validateList({
      body: 'Selecciona', buttonLabel: 'Ver',
      sections: [{ title: 'x'.repeat(25), rows: [{ id: 'r1', title: 'Opción' }] }],
    })
    expect(errs.some(e => e.field === 'section.0')).toBe(true)
  })

  it('rejects duplicate row ids across ALL sections', () => {
    const errs = validateList({
      body: 'Selecciona', buttonLabel: 'Ver',
      sections: [
        { title: 'S1', rows: [{ id: 'dup', title: 'A' }] },
        { title: 'S2', rows: [{ id: 'dup', title: 'B' }] },
      ],
    })
    expect(errs.some(e => e.field === 'rows' && e.message === 'IDs de fila duplicados')).toBe(true)
  })
})
