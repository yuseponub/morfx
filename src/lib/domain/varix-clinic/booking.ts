// ============================================================================
// Domain Layer — Varix Clinic Booking (agent-varixcenter, Plan 05 Wave 2)
//
// Crea la cita de valoración REAL en el Supabase de varix-clinic: un patient
// idempotente (por cédula) + un appointment. PRIMER módulo de MorfX que ESCRIBE
// en una base de datos externa (godentist solo lee del robot).
//
// ──────────────────────────────────────────────────────────────────────────
// PITFALL 5 — nombre/apellido y celular
// ──────────────────────────────────────────────────────────────────────────
// `patients.nombre` Y `patients.apellido` son NOT NULL; `celular` es VARCHAR(10).
// El bot captura "nombre completo" + teléfono `573XXXXXXXXX` (12 dígitos). Acá:
//   - Split nombre/apellido: primer token = nombre, resto = apellido. Si solo
//     hay un token, apellido = '.' (placeholder válido, satisface NOT NULL).
//   - Celular: se toman los últimos 10 dígitos numéricos (quita prefijo país 57).
//
// ──────────────────────────────────────────────────────────────────────────
// PITFALL 6 — Timezone (Regla 2, America/Bogota UTC-5)
// ──────────────────────────────────────────────────────────────────────────
// `fechaHoraInicio` / `fechaHoraFin` llegan YA como ISO con offset literal
// `-05:00` (los construye `parseSlotToISO` en availability.ts, consumido por el
// agente en Plan 06). Acá se insertan verbatim — NUNCA se hace `new Date(str)`
// ni se re-serializa sin offset.
//
// ──────────────────────────────────────────────────────────────────────────
// CONSTRAINT 23P01 — retry por doctor (D-04)
// ──────────────────────────────────────────────────────────────────────────
// `appointments` tiene un EXCLUDE gist `no_overlapping_appointments` por
// (doctor_id, tstzrange) que rechaza con `error.code === '23P01'` si ese doctor
// ya tiene una cita activa solapando el rango. Estrategia: intentar con el
// doctor A; si choca (23P01), intentar con el doctor B; si AMBOS chocan, el slot
// está realmente lleno → `slot_taken`. NO se hace retry implícito del MISMO
// doctor (igual contract que crm-writer / crm-mutation-tools).
//
// SCOPE (Threat T-varix-03): este módulo SOLO toca `patients` (select/insert) y
// `appointments` (insert). Cero acceso a pagos, historias clínicas u otras
// tablas de varix-clinic.
//
// created_by: NULL (nullable; el bot no es un `auth.users` — A2 research).
// ============================================================================

import { getVarixClinicClient } from './client'
import { DOCTOR_UUIDS, VALORACION_MOTIVO } from './constants'

type BookResult =
  | { ok: true; appointmentId: string; patientId: string }
  | { ok: false; reason: 'slot_taken' | 'error'; detail?: string }

interface SupabaseError {
  code?: string
  message?: string
}

/**
 * Divide un nombre completo en `{ nombre, apellido }`.
 * Primer token = nombre; resto = apellido. Un solo token → apellido = '.'
 * (placeholder válido, ya que `patients.apellido` es NOT NULL — Pitfall 5).
 */
function splitNombre(nombreCompleto: string): { nombre: string; apellido: string } {
  const tokens = nombreCompleto.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { nombre: '.', apellido: '.' }
  if (tokens.length === 1) return { nombre: tokens[0], apellido: '.' }
  return { nombre: tokens[0], apellido: tokens.slice(1).join(' ') }
}

/**
 * Normaliza un teléfono a 10 dígitos (formato `celular VARCHAR(10)`).
 * Toma los últimos 10 dígitos numéricos → quita prefijo país (57…) — Pitfall 5.
 */
function normalizeCelular(telefono: string): string {
  const digits = telefono.replace(/\D/g, '')
  return digits.slice(-10)
}

/**
 * Crea una cita de valoración en varix-clinic.
 *
 * - Patient idempotente por cédula: SELECT primero; si no existe, INSERT.
 *   Maneja la carrera `23505` (otro proceso creó el patient) con re-SELECT.
 * - Appointment con retry por doctor en `23P01`: doctor A → doctor B → slot_taken.
 *
 * @param params.fechaHoraInicio - ISO con offset `-05:00` (Regla 2 / Pitfall 6).
 * @param params.fechaHoraFin - ISO con offset `-05:00`.
 * @returns `{ ok:true, appointmentId, patientId }` o
 *   `{ ok:false, reason:'slot_taken'|'error', detail? }`.
 * @throws si `getVarixClinicClient()` falla (env vars). El caller hace fail-open.
 */
export async function bookVarixAppointment(params: {
  nombre: string
  cedula: string
  telefono: string
  fechaHoraInicio: string // ISO con -05:00
  fechaHoraFin: string
}): Promise<BookResult> {
  const { nombre, apellido } = splitNombre(params.nombre)
  const celular = normalizeCelular(params.telefono)
  const cedula = params.cedula

  const sb = getVarixClinicClient()

  // ── 1. Patient idempotente por cédula ──────────────────────────────────────
  const { data: existing } = await sb
    .from('patients')
    .select('id')
    .eq('cedula', cedula)
    .maybeSingle()

  let patientId: string | undefined = (existing as { id: string } | null)?.id

  if (!patientId) {
    const { data, error } = await sb
      .from('patients')
      .insert({ cedula, nombre, apellido, celular })
      .select('id')
      .single()

    const insErr = error as SupabaseError | null
    if (insErr?.code === '23505') {
      // Carrera: otro proceso creó el patient con esta cédula → re-SELECT.
      const { data: re } = await sb
        .from('patients')
        .select('id')
        .eq('cedula', cedula)
        .single()
      patientId = (re as { id: string } | null)?.id
      if (!patientId) {
        return { ok: false, reason: 'error', detail: 'patient race resolution failed' }
      }
    } else if (insErr) {
      return { ok: false, reason: 'error', detail: insErr.message }
    } else {
      patientId = (data as { id: string }).id
    }
  }

  // ── 2. Appointment con retry por doctor (constraint 23P01) ──────────────────
  for (const doctorId of DOCTOR_UUIDS) {
    const { data, error } = await sb
      .from('appointments')
      .insert({
        patient_id: patientId,
        doctor_id: doctorId,
        fecha_hora_inicio: params.fechaHoraInicio, // ISO -05:00 (Regla 2, Pitfall 6)
        fecha_hora_fin: params.fechaHoraFin,
        estado: 'programada',
        motivo_consulta: VALORACION_MOTIVO,
        // created_by: NULL (el bot no es un auth.users — A2)
      })
      .select('id')
      .single()

    if (!error) {
      return {
        ok: true,
        appointmentId: (data as { id: string }).id,
        patientId,
      }
    }

    const apptErr = error as SupabaseError
    if (apptErr.code !== '23P01') {
      // Error real (no solape) → no tiene sentido reintentar otro doctor.
      return { ok: false, reason: 'error', detail: apptErr.message }
    }
    // 23P01 → ese doctor ocupado en ese rango; probar el siguiente.
  }

  // Ambos doctores chocaron → el slot está realmente lleno.
  return { ok: false, reason: 'slot_taken' }
}
