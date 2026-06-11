// ============================================================================
// Standalone agent-varixcenter — Plan 05 Task 2 (TDD)
// Tests for bookVarixAppointment (booking.ts).
//
// Cubre:
//   - patient idempotente por cédula (SELECT antes de INSERT; reusa id existente)
//   - split nombre/apellido (apellido NOT NULL; un solo token → '.')
//   - celular normalizado a 10 dígitos (quita prefijo país)
//   - INSERT appointment con retry por doctor en 23P01 → siguiente doctor
//   - ambos doctores 23P01 → { ok:false, reason:'slot_taken' }
//   - error no-23P01 en appointment → { ok:false, reason:'error', detail }
//   - error en patient insert → { ok:false, reason:'error' }
//   - carrera 23505 al crear patient → re-SELECT y continúa
//   - estado:'programada' + motivo_consulta = VALORACION_MOTIVO + TZ -05:00
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- varix-clinic client mock ----------------------------------------------
// Construimos un mock de cliente Supabase configurable por tabla/operación.
//
// patients:
//   .select('id').eq('cedula', ...).maybeSingle() → patientSelectResult
//   .insert({...}).select('id').single()          → patientInsertResult
// appointments:
//   .insert({...}).select('id').single()          → apptInsertResults.shift()

let patientSelectResult: { data: { id: string } | null; error: unknown }
let patientInsertResult: { data: { id: string } | null; error: unknown }
let patientInsertCalls: Array<Record<string, unknown>>
let apptInsertResults: Array<{ data: { id: string } | null; error: unknown }>
let apptInsertCalls: Array<Record<string, unknown>>

function makeClient() {
  return {
    from(table: string) {
      if (table === 'patients') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(patientSelectResult),
              single: () => Promise.resolve(patientSelectResult),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            patientInsertCalls.push(row)
            return {
              select: () => ({
                single: () => Promise.resolve(patientInsertResult),
              }),
            }
          },
        }
      }
      // appointments
      return {
        insert: (row: Record<string, unknown>) => {
          apptInsertCalls.push(row)
          const result = apptInsertResults.shift() ?? {
            data: null,
            error: { code: 'XXXXX', message: 'no result queued' },
          }
          return {
            select: () => ({ single: () => Promise.resolve(result) }),
          }
        },
      }
    },
  }
}

const getVarixClinicClientMock = vi.fn(() => makeClient())

vi.mock('@/lib/domain/varix-clinic/client', () => ({
  getVarixClinicClient: () => getVarixClinicClientMock(),
}))

import { bookVarixAppointment } from '@/lib/domain/varix-clinic/booking'
import {
  DOCTOR_CIRO_UUID,
  DOCTOR_CAROLINA_UUID,
  VALORACION_MOTIVO,
} from '@/lib/domain/varix-clinic/constants'

const baseParams = {
  nombre: 'Paola Méndez García',
  cedula: '1098765432',
  telefono: '573001234567',
  fechaHoraInicio: '2026-06-16T08:00:00-05:00',
  fechaHoraFin: '2026-06-16T08:20:00-05:00',
}

beforeEach(() => {
  vi.clearAllMocks()
  patientSelectResult = { data: null, error: null }
  patientInsertResult = { data: { id: 'patient-new' }, error: null }
  patientInsertCalls = []
  apptInsertResults = [{ data: { id: 'appt-1' }, error: null }]
  apptInsertCalls = []
  // Re-establecer la implementación por defecto (algunos tests la sobreescriben
  // con mockImplementation; clearAllMocks NO restaura la implementación).
  getVarixClinicClientMock.mockImplementation(() => makeClient())
})

describe('bookVarixAppointment — happy path (cédula nueva)', () => {
  it('crea patient + appointment y retorna ok con ids', async () => {
    const result = await bookVarixAppointment(baseParams)
    expect(result).toEqual({
      ok: true,
      appointmentId: 'appt-1',
      patientId: 'patient-new',
    })
  })

  it('split nombre/apellido: primer token = nombre, resto = apellido', async () => {
    await bookVarixAppointment(baseParams)
    expect(patientInsertCalls[0].nombre).toBe('Paola')
    expect(patientInsertCalls[0].apellido).toBe('Méndez García')
  })

  it('un solo token de nombre → apellido placeholder "."', async () => {
    await bookVarixAppointment({ ...baseParams, nombre: 'Paola' })
    expect(patientInsertCalls[0].nombre).toBe('Paola')
    expect(patientInsertCalls[0].apellido).toBe('.')
  })

  it('celular normalizado a 10 dígitos (quita prefijo país)', async () => {
    await bookVarixAppointment(baseParams)
    expect(patientInsertCalls[0].celular).toBe('3001234567')
  })

  it('appointment con estado programada + motivo VALORACION_MOTIVO + TZ -05:00', async () => {
    await bookVarixAppointment(baseParams)
    expect(apptInsertCalls[0].estado).toBe('programada')
    expect(apptInsertCalls[0].motivo_consulta).toBe(VALORACION_MOTIVO)
    expect(apptInsertCalls[0].fecha_hora_inicio).toBe('2026-06-16T08:00:00-05:00')
    expect(apptInsertCalls[0].fecha_hora_fin).toBe('2026-06-16T08:20:00-05:00')
    expect(apptInsertCalls[0].doctor_id).toBe(DOCTOR_CIRO_UUID)
  })
})

describe('bookVarixAppointment — patient idempotente (cédula existente)', () => {
  it('reusa patientId existente y NO inserta patient', async () => {
    patientSelectResult = { data: { id: 'patient-existing' }, error: null }
    const result = await bookVarixAppointment(baseParams)
    expect(result).toEqual({
      ok: true,
      appointmentId: 'appt-1',
      patientId: 'patient-existing',
    })
    expect(patientInsertCalls).toHaveLength(0)
  })
})

describe('bookVarixAppointment — carrera 23505 al crear patient', () => {
  it('re-SELECT por cédula y continúa con el id existente', async () => {
    patientSelectResult = { data: null, error: null } // primer SELECT vacío
    patientInsertResult = { data: null, error: { code: '23505', message: 'dup' } }
    // tras el 23505, el código re-SELECTea por cédula. El mock devuelve
    // patientSelectResult en .single() también → ajustamos a un id tras carrera.
    // Simulamos el re-SELECT devolviendo un patient ya creado por el otro proceso.
    let selectCall = 0
    getVarixClinicClientMock.mockImplementation(() => ({
      from(table: string) {
        if (table === 'patients') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => {
                  selectCall++
                  return Promise.resolve({ data: null, error: null })
                },
                single: () => {
                  selectCall++
                  return Promise.resolve({
                    data: { id: 'patient-race' },
                    error: null,
                  })
                },
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              patientInsertCalls.push(row)
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: null,
                      error: { code: '23505', message: 'dup' },
                    }),
                }),
              }
            },
          }
        }
        return {
          insert: (row: Record<string, unknown>) => {
            apptInsertCalls.push(row)
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'appt-1' }, error: null }),
              }),
            }
          },
        }
      },
    }))
    const result = await bookVarixAppointment(baseParams)
    expect(result).toEqual({
      ok: true,
      appointmentId: 'appt-1',
      patientId: 'patient-race',
    })
  })
})

describe('bookVarixAppointment — error al crear patient (no 23505)', () => {
  it('retorna { ok:false, reason:"error" }', async () => {
    patientInsertResult = {
      data: null,
      error: { code: '23502', message: 'null value' },
    }
    const result = await bookVarixAppointment(baseParams)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('error')
      expect(result.detail).toContain('null value')
    }
  })
})

describe('bookVarixAppointment — constraint 23P01 (retry por doctor)', () => {
  it('doctor A da 23P01 → reintenta con doctor B y agenda', async () => {
    apptInsertResults = [
      { data: null, error: { code: '23P01', message: 'overlap A' } },
      { data: { id: 'appt-2' }, error: null },
    ]
    const result = await bookVarixAppointment(baseParams)
    expect(result).toEqual({
      ok: true,
      appointmentId: 'appt-2',
      patientId: 'patient-new',
    })
    expect(apptInsertCalls).toHaveLength(2)
    expect(apptInsertCalls[0].doctor_id).toBe(DOCTOR_CIRO_UUID)
    expect(apptInsertCalls[1].doctor_id).toBe(DOCTOR_CAROLINA_UUID)
  })

  it('ambos doctores dan 23P01 → { ok:false, reason:"slot_taken" }', async () => {
    apptInsertResults = [
      { data: null, error: { code: '23P01', message: 'overlap A' } },
      { data: null, error: { code: '23P01', message: 'overlap B' } },
    ]
    const result = await bookVarixAppointment(baseParams)
    expect(result).toEqual({ ok: false, reason: 'slot_taken' })
    expect(apptInsertCalls).toHaveLength(2)
  })

  it('error no-23P01 en appointment → { ok:false, reason:"error" } sin reintentar', async () => {
    apptInsertResults = [
      { data: null, error: { code: '42P01', message: 'relation missing' } },
      { data: { id: 'appt-x' }, error: null },
    ]
    const result = await bookVarixAppointment(baseParams)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('error')
      expect(result.detail).toContain('relation missing')
    }
    // NO reintenta con el segundo doctor en error no-23P01
    expect(apptInsertCalls).toHaveLength(1)
  })
})
