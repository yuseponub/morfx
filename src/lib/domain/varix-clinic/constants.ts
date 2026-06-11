// ============================================================================
// Domain Layer — Varix Clinic Constants (agent-varixcenter)
//
// Constantes de negocio de la clínica VarixCenter: UUIDs de los 2 doctores que
// atienden valoraciones, horarios hábiles y duración del slot.
//
// Las consumen `availability.ts` (calcular slots libres) y `booking.ts` (crear
// la cita de valoración) en Wave 2.
//
// Fuentes:
//   - UUIDs de doctores: 00-WAVE0-AUDIT.md (query contra doctors_view del
//     Supabase prod de varix-clinic, 2026-06-11). Exactamente 2 filas — no hay
//     médicos extra que desambiguar.
//   - Horarios + slot: DISENO-COMPLETO.md §8 (D-03 slot = 20 min).
// ============================================================================

// ── Doctores (UUIDs reales de varix-clinic `doctors_view`) ──────────────────
// Dr. Ciro Mario Romero (ciromario@gmail.com)
export const DOCTOR_CIRO_UUID = 'fa3e2e8d-faf4-40b0-a3cb-a8d50780988d'
// Dra. María Carolina Romero (caromerorincon@gmail.com)
export const DOCTOR_CAROLINA_UUID = 'aee08e40-5c60-481e-966f-51af351351e8'

/** Los 2 doctores que atienden valoraciones (orden de preferencia). */
export const DOCTOR_UUIDS = [DOCTOR_CIRO_UUID, DOCTOR_CAROLINA_UUID] as const

// ── Slot / duración de la valoración ────────────────────────────────────────
/** Tamaño del slot en minutos (D-03): una valoración ocupa exactamente un slot. */
export const SLOT_MINUTES = 20

/** Duración de la cita de valoración en minutos (= un slot). */
export const APPOINTMENT_DURATION_MINUTES = 20

// ── Horarios hábiles (DISENO-COMPLETO.md §8) ────────────────────────────────
// Expresados en MINUTOS desde medianoche, como rangos [inicio, fin) por jornada.
// L-V (día 1-5): mañana 8:00–11:30, tarde 14:30–15:30.
// Sábado (día 6): mañana 8:00–12:00, sin tarde.
// Domingo (día 0): cerrado (no aparece aquí).
export const HORARIOS = {
  weekday: { manana: [8 * 60, 11 * 60 + 30], tarde: [14 * 60 + 30, 15 * 60 + 30] },
  saturday: { manana: [8 * 60, 12 * 60], tarde: null },
} as const

// ── Motivo de la cita ───────────────────────────────────────────────────────
/** Texto del motivo que se graba en la cita creada por el bot. */
export const VALORACION_MOTIVO = 'Valoración (agendada por bot WhatsApp)'
