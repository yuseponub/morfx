// ============================================================================
// Standalone agent-varixcenter — Plan 05 Task 1 (TDD)
// Tests for getVarixAvailability + parseSlotToISO (availability.ts).
//
// Cubre:
//   - Grilla 20min mañana/tarde weekday (último slot mañana termina ≤ 11:30)
//   - Sábado solo mañana 8:00..11:40, tarde vacío
//   - Domingo / festivo → { manana: [], tarde: [] } SIN tocar Supabase (D-09)
//   - Merge 2 agendas: slot descartado solo si AMBOS doctores ocupados
//   - parseSlotToISO usa offset literal -05:00 (Regla 2, Pitfall 6)
//   - getVarixClinicClient throw propaga (caller hace fail-open)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- varix-clinic client mock ----------------------------------------------
// Cadena: from('appointments').select(...).gte(...).lte(...).not(...) → Promise<{data,error}>
let apptRows: Array<{
  doctor_id: string
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado: string
}> = []
let clientThrows = false

const notMock = vi.fn(() => Promise.resolve({ data: apptRows, error: null }))
const lteMock = vi.fn(() => ({ not: notMock }))
const gteMock = vi.fn(() => ({ lte: lteMock }))
const selectMock = vi.fn(() => ({ gte: gteMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
const getVarixClinicClientMock = vi.fn(() => {
  if (clientThrows) throw new Error('VARIX_CLINIC_* env vars not set')
  return { from: fromMock }
})

vi.mock('@/lib/domain/varix-clinic/client', () => ({
  getVarixClinicClient: () => getVarixClinicClientMock(),
}))

import {
  getVarixAvailability,
  parseSlotToISO,
} from '@/lib/domain/varix-clinic/availability'
import {
  DOCTOR_CIRO_UUID,
  DOCTOR_CAROLINA_UUID,
} from '@/lib/domain/varix-clinic/constants'

beforeEach(() => {
  vi.clearAllMocks()
  apptRows = []
  clientThrows = false
  notMock.mockImplementation(() => Promise.resolve({ data: apptRows, error: null }))
  lteMock.mockImplementation(() => ({ not: notMock }))
  gteMock.mockImplementation(() => ({ lte: lteMock }))
  selectMock.mockImplementation(() => ({ gte: gteMock }))
  fromMock.mockImplementation(() => ({ select: selectMock }))
})

// Helpers de fecha de referencia (TZ-safe respecto a Date.UTC):
//   2026-06-16 = martes (weekday)
//   2026-06-20 = sábado
//   2026-06-21 = domingo
//   2026-06-15 = festivo (Sagrado Corazón, en FESTIVOS_COLOMBIA_2026)

describe('getVarixAvailability — día no hábil (D-09)', () => {
  it('domingo → { manana:[], tarde:[] } SIN consultar Supabase', async () => {
    const result = await getVarixAvailability('2026-06-21')
    expect(result).toEqual({ manana: [], tarde: [] })
    expect(getVarixClinicClientMock).not.toHaveBeenCalled()
  })

  it('festivo → { manana:[], tarde:[] } SIN consultar Supabase', async () => {
    const result = await getVarixAvailability('2026-06-15')
    expect(result).toEqual({ manana: [], tarde: [] })
    expect(getVarixClinicClientMock).not.toHaveBeenCalled()
  })
})

describe('getVarixAvailability — grilla weekday (martes 2026-06-16)', () => {
  it('genera mañana 8:00..11:00 (último slot termina ≤ 11:30)', async () => {
    // Grilla de 20min desde 8:00 → :00/:20/:40. El último slot cuyo fin no
    // excede 11:30 es 11:00-11:20 (11:20 ≤ 11:30). 11:20-11:40 se excluye.
    const { manana } = await getVarixAvailability('2026-06-16')
    expect(manana[0]).toBe('8:00 AM - 8:20 AM')
    expect(manana).toContain('11:00 AM - 11:20 AM')
    // 11:20 no cabe (terminaría 11:40 > 11:30)
    expect(manana).not.toContain('11:20 AM - 11:40 AM')
    // último slot termina ≤ 11:30
    expect(manana[manana.length - 1]).toBe('11:00 AM - 11:20 AM')
  })

  it('genera tarde 14:30, 14:50, 15:10', async () => {
    const { tarde } = await getVarixAvailability('2026-06-16')
    expect(tarde).toEqual([
      '2:30 PM - 2:50 PM',
      '2:50 PM - 3:10 PM',
      '3:10 PM - 3:30 PM',
    ])
  })
})

describe('getVarixAvailability — sábado (2026-06-20)', () => {
  it('solo mañana 8:00..11:40, tarde vacío', async () => {
    const { manana, tarde } = await getVarixAvailability('2026-06-20')
    expect(manana[0]).toBe('8:00 AM - 8:20 AM')
    expect(manana[manana.length - 1]).toBe('11:40 AM - 12:00 PM')
    expect(tarde).toEqual([])
  })
})

describe('getVarixAvailability — merge 2 agendas', () => {
  it('slot ocupado por UN solo doctor SÍ aparece (libre por el otro)', async () => {
    apptRows = [
      {
        doctor_id: DOCTOR_CIRO_UUID,
        fecha_hora_inicio: '2026-06-16T08:00:00-05:00',
        fecha_hora_fin: '2026-06-16T08:20:00-05:00',
        estado: 'programada',
      },
    ]
    const { manana } = await getVarixAvailability('2026-06-16')
    expect(manana).toContain('8:00 AM - 8:20 AM')
  })

  it('slot ocupado por AMBOS doctores NO aparece', async () => {
    apptRows = [
      {
        doctor_id: DOCTOR_CIRO_UUID,
        fecha_hora_inicio: '2026-06-16T08:00:00-05:00',
        fecha_hora_fin: '2026-06-16T08:20:00-05:00',
        estado: 'programada',
      },
      {
        doctor_id: DOCTOR_CAROLINA_UUID,
        fecha_hora_inicio: '2026-06-16T08:00:00-05:00',
        fecha_hora_fin: '2026-06-16T08:20:00-05:00',
        estado: 'programada',
      },
    ]
    const { manana } = await getVarixAvailability('2026-06-16')
    expect(manana).not.toContain('8:00 AM - 8:20 AM')
    // el resto de slots siguen disponibles
    expect(manana).toContain('8:20 AM - 8:40 AM')
  })

  it('solape parcial cuenta como ocupado (rango semi-abierto)', async () => {
    // appt 8:10-8:30 solapa con slot 8:00-8:20 y con slot 8:20-8:40 (8:20<8:30)
    apptRows = [
      {
        doctor_id: DOCTOR_CIRO_UUID,
        fecha_hora_inicio: '2026-06-16T08:10:00-05:00',
        fecha_hora_fin: '2026-06-16T08:30:00-05:00',
        estado: 'programada',
      },
      {
        doctor_id: DOCTOR_CAROLINA_UUID,
        fecha_hora_inicio: '2026-06-16T08:10:00-05:00',
        fecha_hora_fin: '2026-06-16T08:30:00-05:00',
        estado: 'programada',
      },
    ]
    const { manana } = await getVarixAvailability('2026-06-16')
    expect(manana).not.toContain('8:00 AM - 8:20 AM')
    expect(manana).not.toContain('8:20 AM - 8:40 AM')
  })

  it('appt que termina exactamente al inicio del slot NO solapa (semi-abierto)', async () => {
    // appt 7:40-8:00 NO solapa con slot 8:00-8:20 (apptFin=8:00 > sInicio=8:00 es false)
    apptRows = [
      {
        doctor_id: DOCTOR_CIRO_UUID,
        fecha_hora_inicio: '2026-06-16T07:40:00-05:00',
        fecha_hora_fin: '2026-06-16T08:00:00-05:00',
        estado: 'programada',
      },
      {
        doctor_id: DOCTOR_CAROLINA_UUID,
        fecha_hora_inicio: '2026-06-16T07:40:00-05:00',
        fecha_hora_fin: '2026-06-16T08:00:00-05:00',
        estado: 'programada',
      },
    ]
    const { manana } = await getVarixAvailability('2026-06-16')
    expect(manana).toContain('8:00 AM - 8:20 AM')
  })
})

describe('getVarixAvailability — TZ-safe weekday (Plan 09 — Regla 2)', () => {
  // En America/Bogota (UTC-5) `new Date('YYYY-MM-DD')` parsea como medianoche UTC
  // y `getDay()` lo lee 5h antes → corre el día al ANTERIOR. La implementación usa
  // `Date.UTC(...).getUTCDay()`, que NO corre el día. Estos tests fallarían si
  // alguien sustituyera el cálculo por `new Date(fecha).getDay()` (regresión TZ).
  //
  // Verificado en runtime Bogota:
  //   2026-06-20 (sábado): getUTCDay()=6  vs getDay()=5 (viernes → elegiría weekday → tendría tarde)
  //   2026-06-21 (domingo): getUTCDay()=0  vs getDay()=6 (sábado → NO sería no-hábil)

  it('sábado boundary selecciona HORARIOS.saturday (tarde vacío), NO weekday', async () => {
    // Con `getDay()` local este día se leería como viernes → tendría tarde.
    // Con `getUTCDay()` se lee correctamente como sábado → tarde = [].
    const { manana, tarde } = await getVarixAvailability('2026-06-20')
    expect(tarde).toEqual([]) // sábado no tiene jornada de tarde
    // y SÍ tiene mañana hasta 12:00 (rango saturday, no weekday que cierra 11:30)
    expect(manana[manana.length - 1]).toBe('11:40 AM - 12:00 PM')
  })

  it('domingo boundary es no-hábil (D-09) — getUTCDay()=0, NO se trata como sábado', async () => {
    // Con `getDay()` local este día se leería como sábado → tendría grilla de mañana.
    // Con la lógica TZ-safe (isNonWorkingDay + getUTCDay) → { manana:[], tarde:[] }.
    const result = await getVarixAvailability('2026-06-21')
    expect(result).toEqual({ manana: [], tarde: [] })
    expect(getVarixClinicClientMock).not.toHaveBeenCalled()
  })

  it('lunes boundary selecciona HORARIOS.weekday (tarde presente), NO sábado/domingo', async () => {
    // 2026-06-22 = lunes. getUTCDay()=1 → weekday (mañana 8:00–11:30 + tarde).
    const { manana, tarde } = await getVarixAvailability('2026-06-22')
    expect(manana[manana.length - 1]).toBe('11:00 AM - 11:20 AM') // cierre weekday ≤ 11:30
    expect(tarde.length).toBeGreaterThan(0) // weekday SÍ tiene tarde
  })
})

describe('getVarixAvailability — fail-open', () => {
  it('si getVarixClinicClient lanza, propaga el throw (caller hace fail-open)', async () => {
    clientThrows = true
    await expect(getVarixAvailability('2026-06-16')).rejects.toThrow(
      /VARIX_CLINIC/,
    )
  })

  it('W-01: si la query de appointments retorna error, lanza (NO trata error como 0 citas)', async () => {
    // Una query fallida (red/RLS/permiso) devuelve { data:null, error }.
    // NUNCA debe degradar a "0 citas = todos los slots libres" (disponibilidad falsa).
    notMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: 'permission denied' } }),
    )
    await expect(getVarixAvailability('2026-06-16')).rejects.toThrow(
      /availability query failed/,
    )
  })
})

describe('parseSlotToISO — CR-01: formato solo hora de inicio (comprehension)', () => {
  it('"10:00 AM" (sin separador) calcula fin = inicio + SLOT_MINUTES (20min)', () => {
    // horario_seleccionado de la comprehension llega como "10:00 AM" (solo inicio).
    // Antes esto producía TypeError (undefined.trim()) y booking siempre fallaba.
    expect(parseSlotToISO('2026-06-15', '10:00 AM')).toEqual({
      inicio: '2026-06-15T10:00:00-05:00',
      fin: '2026-06-15T10:20:00-05:00',
    })
  })

  it('"2:00 PM" (solo inicio PM) calcula fin +20min correctamente', () => {
    expect(parseSlotToISO('2026-06-16', '2:00 PM')).toEqual({
      inicio: '2026-06-16T14:00:00-05:00',
      fin: '2026-06-16T14:20:00-05:00',
    })
  })

  it('formato rango completo "8:00 AM - 8:20 AM" sigue funcionando (retrocompatible)', () => {
    expect(parseSlotToISO('2026-06-15', '8:00 AM - 8:20 AM')).toEqual({
      inicio: '2026-06-15T08:00:00-05:00',
      fin: '2026-06-15T08:20:00-05:00',
    })
  })

  it('casing minúscula "10:00 am" (variación de comprehension) parsea igual', () => {
    expect(parseSlotToISO('2026-06-15', '10:00 am')).toEqual({
      inicio: '2026-06-15T10:00:00-05:00',
      fin: '2026-06-15T10:20:00-05:00',
    })
  })
})

describe('parseSlotToISO — offset literal -05:00 (Regla 2, Pitfall 6)', () => {
  it('convierte slot mañana a ISO con -05:00', () => {
    expect(parseSlotToISO('2026-06-15', '8:00 AM - 8:20 AM')).toEqual({
      inicio: '2026-06-15T08:00:00-05:00',
      fin: '2026-06-15T08:20:00-05:00',
    })
  })

  it('convierte slot tarde (PM → 24h) con -05:00', () => {
    expect(parseSlotToISO('2026-06-16', '2:30 PM - 2:50 PM')).toEqual({
      inicio: '2026-06-16T14:30:00-05:00',
      fin: '2026-06-16T14:50:00-05:00',
    })
  })

  it('mediodía 12:00 PM se mapea a 12:00:00 (no 00:00)', () => {
    expect(parseSlotToISO('2026-06-20', '11:40 AM - 12:00 PM')).toEqual({
      inicio: '2026-06-20T11:40:00-05:00',
      fin: '2026-06-20T12:00:00-05:00',
    })
  })
})
