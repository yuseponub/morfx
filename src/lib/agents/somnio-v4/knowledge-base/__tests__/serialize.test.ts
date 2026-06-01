// Standalone ui-agent-content-editor — Plan 01 Task 2.
// Exact-output lock for buildContentToEmbed (RESEARCH A1 / Pitfall 1 / Threat T-UICE01-01).
// The serializer is the SINGLE source of the KB embedding text form; this test pins its
// byte form so it can NEVER silently drift across waves (migration re-embed + UI re-embed
// MUST produce identical strings). Any change to serialize.ts that alters the output fails CI.

import { describe, it, expect } from 'vitest'
import { buildContentToEmbed, type KbContentColumns } from '../serialize'

describe('buildContentToEmbed — canonical KB embedding serializer', () => {
  it('A1: produces the exact locked string for a full row with scope_summary', () => {
    const row: KbContentColumns = {
      scope_summary: 'Atiende preguntas sobre dosis y horario.',
      hechos_del_producto: 'Se toma 30 min antes de dormir.',
      posicion_del_negocio: 'No prometer cura.',
      debe_contener: ['Mencionar dosis', 'Recordar constancia'],
      nunca_decir: ['Cura el insomnio'],
      cuando_escalar: ['Cliente reporta efecto adverso'],
    }

    // Built with explicit \n joins so the test itself documents the byte form.
    const expected = [
      'Atiende preguntas sobre dosis y horario.',
      '',
      '## Hechos del producto',
      'Se toma 30 min antes de dormir.',
      '',
      '## Posición del negocio',
      'No prometer cura.',
      '',
      '## Debe contener la respuesta',
      '- Mencionar dosis',
      '- Recordar constancia',
      '',
      '## NUNCA decir',
      '- Cura el insomnio',
      '',
      '## Cuándo escalar a humano',
      '- Cliente reporta efecto adverso',
    ].join('\n')

    expect(buildContentToEmbed(row)).toBe(expected)
  })

  it('B: null scope_summary + empty arrays — no leading scope block, bare empty-section headers', () => {
    const row: KbContentColumns = {
      scope_summary: null,
      hechos_del_producto: 'X',
      posicion_del_negocio: null,
      debe_contener: [],
      nunca_decir: [],
      cuando_escalar: [],
    }

    const result = buildContentToEmbed(row)

    // No leading scope block: output starts at the first header.
    expect(result.startsWith('## Hechos del producto\nX')).toBe(true)

    // Empty arrays render as a bare header (header line + empty body): "## NUNCA decir\n".
    // The "\n\n" section separator then joins to the next header, so the deterministic form
    // between two consecutive empty sections is "header\n" + "\n\n" + "nextHeader" =>
    // three newlines total. (The PLAN's loose hint said two \n; the serializer — locked by
    // the exact toBe below — emits three. Rule 1: test asserts the real deterministic output.)
    expect(result.includes('## NUNCA decir\n\n\n## Cuándo escalar')).toBe(true)

    // Exact full form for the edge fixture, to lock empty-section rendering.
    const expected = [
      '## Hechos del producto',
      'X',
      '',
      '## Posición del negocio',
      '',
      '',
      '## Debe contener la respuesta',
      '',
      '',
      '## NUNCA decir',
      '',
      '',
      '## Cuándo escalar a humano',
      '',
    ].join('\n')
    expect(result).toBe(expected)
  })
})
