// ============================================================================
// Domain Layer — Varix Clinic Availability (agent-varixcenter, Plan 05 Wave 2)
//
// PRIMERA generación de grilla de disponibilidad PROPIA en MorfX.
// ──────────────────────────────────────────────────────────────────────────
// A diferencia de GoDentist (`dentos-availability.ts`), que recibe los slots
// YA formateados desde un robot Railway que scrapea Dentos, este módulo GENERA
// la grilla él mismo: arma slots fijos de 20 min dentro de los horarios hábiles
// de la clínica y los cruza contra las citas ya existentes en el Supabase de
// varix-clinic, FUSIONANDO las agendas de los 2 doctores.
//
// REGLA DEL MERGE (D-03 + clinica mono-cliente):
//   Un slot candidato está LIBRE si AL MENOS UNO de los 2 doctores no tiene
//   ninguna cita activa que solape ese rango. Solo se descarta cuando AMBOS
//   doctores están ocupados en ese rango. (El constraint Postgres
//   `no_overlapping_appointments` es por doctor, así que dos doctores pueden
//   atender el mismo horario simultáneamente.)
//
// TIMEZONE (Regla 2 — America/Bogota UTC-5):
//   - El día de semana se calcula con `Date.UTC(...).getUTCDay()`, NUNCA con
//     `new Date(fecha).getDay()` (que aplicaría el offset del runtime y podría
//     correr el día). Mismo patrón que `isNonWorkingDay` / godentist.
//   - `parseSlotToISO` construye TIMESTAMPTZ con offset literal `-05:00`
//     (Pitfall 6). NUNCA `new Date(str).toISOString()` sin offset.
//
// FAIL-OPEN: `getVarixClinicClient()` lanza si faltan las env vars. Acá NO se
// captura — se deja propagar para que el CALLER (el agente, Wave 3) haga el
// fail-open a handoff humano. Es la misma semántica documentada en client.ts.
// ============================================================================

import { getVarixClinicClient } from './client'
import { DOCTOR_UUIDS, HORARIOS, SLOT_MINUTES } from './constants'
import { isNonWorkingDay } from '@/lib/agents/varixcenter/constants'

// ── Helpers puros de tiempo (copiados verbatim de dentos-availability.ts) ────

/** Parse "8:00 AM" o "1:30 PM" → minutos desde medianoche (-1 si no matchea). */
function parseTimeToMinutes(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return -1
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

/** Convert minutos desde medianoche → "H:MM AM/PM". */
function minutesToTime(mins: number): string {
  let hours = Math.floor(mins / 60)
  const minutes = mins % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  if (hours > 12) hours -= 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`
}

// ── parseSlotToISO — slot string → TIMESTAMPTZ con offset -05:00 ─────────────

/**
 * Convierte un slot + fecha (YYYY-MM-DD) en su par de timestamps ISO con offset
 * literal `-05:00` (America/Bogota — Regla 2 / Pitfall 6).
 *
 * Tolera DOS formatos de entrada (CR-01):
 *   - Rango completo: "8:00 AM - 8:20 AM" (lo que genera buildSlotGrid).
 *   - Solo hora de inicio: "10:00 AM" (lo que captura la comprehension en
 *     `horario_seleccionado` — ver comprehension-schema.ts: "el de las 10" ->
 *     "10:00 AM"). En este caso el fin se calcula como inicio + SLOT_MINUTES.
 *
 * Lo consume Plan 06 (varixcenter-agent) para construir `fechaHoraInicio` /
 * `fechaHoraFin` que pasa a `bookVarixAppointment`.
 *
 * @example
 * parseSlotToISO('2026-06-15', '8:00 AM - 8:20 AM')
 *   → { inicio: '2026-06-15T08:00:00-05:00', fin: '2026-06-15T08:20:00-05:00' }
 * @example
 * parseSlotToISO('2026-06-15', '10:00 AM')
 *   → { inicio: '2026-06-15T10:00:00-05:00', fin: '2026-06-15T10:20:00-05:00' }
 */
export function parseSlotToISO(
  fecha: string,
  slotStr: string,
): { inicio: string; fin: string } {
  const parts = slotStr.split(' - ')
  const startStr = parts[0].trim()
  const endStr = parts[1]?.trim()

  const startMin = parseTimeToMinutes(startStr)
  // Si no viene el fin (formato "10:00 AM" de la comprehension), o si el fin no
  // parsea, calcular fin = inicio + SLOT_MINUTES. NUNCA pasar undefined a
  // parseTimeToMinutes (CR-01: undefined.trim() -> TypeError).
  const parsedEnd = endStr ? parseTimeToMinutes(endStr) : -1
  const endMin = parsedEnd === -1 ? startMin + SLOT_MINUTES : parsedEnd

  return {
    inicio: `${fecha}T${minutesToHHMMSS(startMin)}-05:00`,
    fin: `${fecha}T${minutesToHHMMSS(endMin)}-05:00`,
  }
}

/** minutos desde medianoche → "HH:MM:SS" (24h, zero-padded). */
function minutesToHHMMSS(mins: number): string {
  const hh = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0')
  const mm = (mins % 60).toString().padStart(2, '0')
  return `${hh}:${mm}:00`
}

// ── Generación de grilla ─────────────────────────────────────────────────────

/**
 * Genera la grilla de candidatos de 20 min dentro de un rango [inicio, fin)
 * expresado en minutos. El último slot incluido es aquel cuyo fin (inicio +
 * SLOT_MINUTES) NO excede el cierre del rango.
 *
 * Ej: rango [480, 690] (8:00–11:30) → 8:00..11:10 (11:10+20=11:30 cabe).
 */
function buildSlotGrid(range: readonly [number, number]): string[] {
  const [open, close] = range
  const slots: string[] = []
  for (let start = open; start + SLOT_MINUTES <= close; start += SLOT_MINUTES) {
    const end = start + SLOT_MINUTES
    slots.push(`${minutesToTime(start)} - ${minutesToTime(end)}`)
  }
  return slots
}

// ── API principal ────────────────────────────────────────────────────────────

interface VarixAppointmentRow {
  doctor_id: string | null
  fecha_hora_inicio: string
  fecha_hora_fin: string
  estado: string
}

/**
 * Disponibilidad de la clínica para una fecha YYYY-MM-DD.
 *
 * Devuelve `{ manana, tarde }` con los slots de 20 min LIBRES (mismo shape que
 * `checkDentosAvailability` de godentist, para que el template
 * `mostrar_disponibilidad` lo consuma sin cambios).
 *
 * - Domingo / festivo → `{ manana: [], tarde: [] }` (D-09), SIN consultar Supabase.
 * - Sábado → solo mañana (8:00–12:00), tarde vacío.
 * - L-V → mañana (8:00–11:30) + tarde (14:30–15:30).
 * - Merge de los 2 doctores: un slot se descarta solo si AMBOS están ocupados.
 *
 * @throws si `getVarixClinicClient()` falla (env vars). El caller hace fail-open.
 */
export async function getVarixAvailability(
  fecha: string,
): Promise<{ manana: string[]; tarde: string[] }> {
  // 1. Día no hábil (D-09): domingo o festivo → vacío, sin tocar Supabase.
  if (isNonWorkingDay(fecha) !== null) {
    return { manana: [], tarde: [] }
  }

  // 2. Día de semana TZ-safe (Regla 2): Date.UTC + getUTCDay (1-5 = L-V, 6 = sáb).
  const [y, m, d] = fecha.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const horario = weekday === 6 ? HORARIOS.saturday : HORARIOS.weekday

  // 3. Grilla de candidatos por jornada.
  const candidatosManana = buildSlotGrid(horario.manana)
  const candidatosTarde = horario.tarde ? buildSlotGrid(horario.tarde) : []

  // 4. Citas activas del día (ambos doctores). Rango del día completo en -05:00.
  const sb = getVarixClinicClient()
  const dayStart = `${fecha}T00:00:00-05:00`
  const dayEnd = `${fecha}T23:59:59-05:00`
  const { data: appts, error: apptError } = await sb
    .from('appointments')
    .select('doctor_id, fecha_hora_inicio, fecha_hora_fin, estado')
    .gte('fecha_hora_inicio', dayStart)
    .lte('fecha_hora_inicio', dayEnd)
    .not('estado', 'in', '(cancelada,no_asistio)')

  // W-01: NUNCA tratar un error de Supabase como "0 citas = todos los slots
  // libres". Si la query falla (red, RLS, permiso), propagar — el caller
  // (varixcenter-agent) ya hace fail-open -> sin_disponibilidad/handoff.
  if (apptError) {
    throw new Error(`varix-clinic availability query failed: ${apptError.message}`)
  }

  const rows: VarixAppointmentRow[] = (appts as VarixAppointmentRow[]) ?? []

  // 5. Filtro de merge: descartar slot solo si AMBOS doctores ocupados.
  const filterFree = (slots: string[]): string[] =>
    slots.filter((slot) => {
      const { inicio, fin } = parseSlotToISO(fecha, slot)
      const sInicio = Date.parse(inicio)
      const sFin = Date.parse(fin)
      // Un doctor está libre en este slot si NO tiene ninguna cita que solape.
      const alMenosUnoLibre = DOCTOR_UUIDS.some((doctorId) => {
        const ocupado = rows.some((appt) => {
          if (appt.doctor_id !== doctorId) return false
          const aInicio = Date.parse(appt.fecha_hora_inicio)
          const aFin = Date.parse(appt.fecha_hora_fin)
          // Solape de rangos semi-abiertos [) (igual al constraint gist '[)').
          return aInicio < sFin && aFin > sInicio
        })
        return !ocupado
      })
      return alMenosUnoLibre
    })

  return {
    manana: filterFree(candidatosManana),
    tarde: filterFree(candidatosTarde),
  }
}
