// ============================================================================
// Domain Layer — Varix Clinic Supabase Client (agent-varixcenter)
//
// Cliente Supabase del PROYECTO HERMANO `varix-clinic` (base de datos de la
// clínica, distinta del Supabase de MorfX). Este archivo es el ÚNICO lugar en
// todo el codebase que instancia `createClient` apuntando a varix-clinic
// (análogo a como `platform-config.ts` es el único que toca `platform_config`).
//
// Lo consumen `availability.ts` y `booking.ts` (Wave 2) para leer
// disponibilidad de los doctores y crear citas de valoración.
//
// ──────────────────────────────────────────────────────────────────────────
// DESVIACION INTENCIONAL DEL PATRON DOMAIN LAYER
// ──────────────────────────────────────────────────────────────────────────
// A diferencia del resto de módulos en `src/lib/domain/*`, este archivo:
//   1. NO acepta `DomainContext` como primer parámetro.
//   2. NO filtra por `workspace_id` de MorfX.
//   3. NO retorna `DomainResult<T>`.
//
// Rationale: varix-clinic es MONO-CLIENTE — su base de datos pertenece a una
// sola clínica y NO tiene tenancy multi-workspace. El `workspace_id` de MorfX
// no tiene significado dentro de varix-clinic. Es la misma desviación que
// documenta `platform-config.ts` para su config platform-wide.
//
// ──────────────────────────────────────────────────────────────────────────
// USO DE service_role
// ──────────────────────────────────────────────────────────────────────────
// Se usa `SERVICE_ROLE_KEY` porque TODA la RLS de varix-clinic exige un usuario
// `authenticated` con rol `staff`. El bot de WhatsApp NO tiene sesión de
// usuario en varix-clinic, por lo que la única forma de leer/escribir es con la
// service_role key (bypass RLS) — igual que `createAdminClient()` en MorfX.
//
// ──────────────────────────────────────────────────────────────────────────
// FAIL-FAST (Pitfall 8)
// ──────────────────────────────────────────────────────────────────────────
// Si faltan `VARIX_CLINIC_SUPABASE_URL` o `VARIX_CLINIC_SERVICE_ROLE_KEY` se
// hace `throw` inmediato. El CALLER (availability/booking) captura ese throw y
// hace FAIL-OPEN: cae a handoff humano en vez de crashear el agente. Así, si
// las env vars no están configuradas en Vercel, el flujo de agendamiento
// degrada limpiamente a "te conecto con un asesor" en lugar de tumbar el turno.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Singleton del cliente Supabase de varix-clinic (proyecto hermano).
 *
 * @throws si faltan las env vars `VARIX_CLINIC_SUPABASE_URL` o
 *   `VARIX_CLINIC_SERVICE_ROLE_KEY`. El caller debe capturar y hacer fail-open
 *   (handoff humano), nunca dejar que el throw tumbe el turno del agente.
 */
export function getVarixClinicClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env.VARIX_CLINIC_SUPABASE_URL
  const key = process.env.VARIX_CLINIC_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('VARIX_CLINIC_* env vars not set')
  }

  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return _client
}
