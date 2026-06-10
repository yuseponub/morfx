/**
 * Tests para la regla "miércoles sin mañana" en checkDentosAvailability (Punto A).
 * Standalone godentist-block-wednesday-morning — Plan 01 (agente godentist-fb-ig / FB/IG).
 * Clon de la suite de WhatsApp; el robot Dentos se mockea vía global.fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkDentosAvailability } from '../dentos-availability'

// Respuesta del robot con slots de mañana Y tarde para CABECERA.
function mockRobotOk() {
  const body = {
    success: true,
    slots: [
      { doctor: 'A', horaInicio: '8:00 AM', horaFin: '11:00 AM', jornada: 'manana' },
      { doctor: 'B', horaInicio: '2:00 PM', horaFin: '5:00 PM', jornada: 'tarde' },
    ],
    summary: { manana: ['8:00 AM - 11:00 AM'], tarde: ['2:00 PM - 5:00 PM'] },
  }
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(mockRobotOk())
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('checkDentosAvailability (fb-ig) — bloqueo miércoles mañana (Punto A)', () => {
  it('miércoles (2026-06-10) → mañana vacía, tarde intacta', async () => {
    const res = await checkDentosAvailability('2026-06-10', 'cabecera')
    expect(res.success).toBe(true)
    expect(res.slots.manana).toEqual([])
    expect(res.slots.tarde.length).toBeGreaterThan(0)
  })

  it('martes (2026-06-09) → mañana NO se toca (anti-regresión)', async () => {
    const res = await checkDentosAvailability('2026-06-09', 'cabecera')
    expect(res.success).toBe(true)
    expect(res.slots.manana.length).toBeGreaterThan(0)
  })

  it('jueves (2026-06-11) → mañana NO se toca (anti-regresión)', async () => {
    const res = await checkDentosAvailability('2026-06-11', 'cabecera')
    expect(res.success).toBe(true)
    expect(res.slots.manana.length).toBeGreaterThan(0)
  })
})
