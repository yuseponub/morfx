import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../comprehension-prompt'

describe('buildSystemPrompt — CRM context injection (standalone: somnio-recompra-crm-reader)', () => {
  describe('when _v3:crm_context_status === "ok"', () => {
    it('injects the CRM section BEFORE "DATOS YA CAPTURADOS"', () => {
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        direccion: 'Cra 10 #20-30',
        '_v3:crm_context':
          'Ultimo pedido entregado: 2x Somnio el 2026-04-10. Tags: VIP. 3 pedidos totales.',
        '_v3:crm_context_status': 'ok',
      })

      expect(prompt).toContain('## CONTEXTO CRM DEL CLIENTE (precargado)')
      expect(prompt).toContain(
        'Ultimo pedido entregado: 2x Somnio el 2026-04-10. Tags: VIP. 3 pedidos totales.',
      )
      expect(prompt).toContain('NO reinventes datos')

      const crmIdx = prompt.indexOf('## CONTEXTO CRM DEL CLIENTE')
      const datosIdx = prompt.indexOf('DATOS YA CAPTURADOS')
      expect(crmIdx).toBeGreaterThan(-1)
      expect(datosIdx).toBeGreaterThan(-1)
      expect(crmIdx).toBeLessThan(datosIdx)
    })

    it('filters _v3: keys from the JSON dump of DATOS YA CAPTURADOS', () => {
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        direccion: 'Cra 10 #20-30',
        '_v3:crm_context': 'Ultimo pedido: 2x Somnio...',
        '_v3:crm_context_status': 'ok',
      })

      // The JSON dump must NOT include _v3: keys. They should only appear in the
      // CONTEXTO CRM section (the raw text, which may contain "crm_context" as a word —
      // but the LITERAL key '"_v3:crm_context"' must not appear as a JSON field).
      const datosBlock = prompt.split('DATOS YA CAPTURADOS')[1] ?? ''
      expect(datosBlock).not.toContain('"_v3:crm_context"')
      expect(datosBlock).not.toContain('"_v3:crm_context_status"')
      // Sanity: normal keys must still appear.
      expect(datosBlock).toContain('"nombre"')
      expect(datosBlock).toContain('"direccion"')
    })

    it('filters multiple _v3: keys (not just the two we introduced)', () => {
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        '_v3:crm_context': 'context text',
        '_v3:crm_context_status': 'ok',
        '_v3:some_future_meta': 'should also be filtered',
        '_v3:accionesEjecutadas': '[]',
      })
      const datosBlock = prompt.split('DATOS YA CAPTURADOS')[1] ?? ''
      expect(datosBlock).not.toContain('_v3:')
      expect(datosBlock).toContain('"nombre"')
    })
  })

  describe('when _v3:crm_context_status is NOT "ok"', () => {
    it('does NOT inject CRM section when status === "empty"', () => {
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        '_v3:crm_context': '',
        '_v3:crm_context_status': 'empty',
      })
      expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
    })

    it('does NOT inject CRM section when status === "error"', () => {
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        '_v3:crm_context': '',
        '_v3:crm_context_status': 'error',
      })
      expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
    })

    it('does NOT inject CRM section when status is absent entirely', () => {
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        direccion: 'Cra 10 #20-30',
      })
      expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
      // Backward-compat: behavior identical to pre-Plan 06 state when flag=false.
      expect(prompt).toContain('DATOS YA CAPTURADOS')
      expect(prompt).toContain('"nombre"')
    })

    it('does NOT inject CRM section when context is empty string even with status=ok', () => {
      // Defensive: if a bad write produced status=ok + empty text, skip injection.
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        '_v3:crm_context': '',
        '_v3:crm_context_status': 'ok',
      })
      expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
    })

    it('does NOT inject CRM section when context is whitespace-only even with status=ok', () => {
      const prompt = buildSystemPrompt({
        nombre: 'Jose',
        '_v3:crm_context': '   \n  ',
        '_v3:crm_context_status': 'ok',
      })
      expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
    })
  })

  describe('edge cases', () => {
    it('empty existingData produces "DATOS YA CAPTURADOS: Ninguno aun." + no CRM section', () => {
      const prompt = buildSystemPrompt({})
      expect(prompt).toContain('DATOS YA CAPTURADOS: Ninguno aun.')
      expect(prompt).not.toContain('## CONTEXTO CRM DEL CLIENTE')
    })

    it('preserves botContextSection concatenation order (CRM + Datos + BotContext)', () => {
      const prompt = buildSystemPrompt(
        {
          nombre: 'Jose',
          '_v3:crm_context': 'contexto rico',
          '_v3:crm_context_status': 'ok',
        },
        ['Hola que tal?', 'Deseas llevarlo?'],
      )
      const crmIdx = prompt.indexOf('## CONTEXTO CRM DEL CLIENTE')
      const datosIdx = prompt.indexOf('DATOS YA CAPTURADOS')
      const botIdx = prompt.indexOf('ULTIMOS MENSAJES DEL BOT')
      expect(crmIdx).toBeGreaterThan(-1)
      expect(datosIdx).toBeGreaterThan(crmIdx)
      expect(botIdx).toBeGreaterThan(datosIdx)
    })
  })
})
