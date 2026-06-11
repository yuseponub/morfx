---
phase: agent-varixcenter
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/domain/varix-clinic/client.ts
  - src/lib/domain/varix-clinic/constants.ts
autonomous: true
requirements: [VARIX-AVAIL, VARIX-BOOK]

must_haves:
  truths:
    - "Existe un único lugar que instancia el cliente Supabase de varix-clinic (getVarixClinicClient)"
    - "El cliente hace fail-fast (throw) si faltan las env vars VARIX_CLINIC_* (caller hace fail-open)"
    - "Los UUIDs de los 2 doctores están disponibles para booking.ts"
  artifacts:
    - path: "src/lib/domain/varix-clinic/client.ts"
      provides: "getVarixClinicClient() singleton (único createClient de varix-clinic)"
      contains: "getVarixClinicClient"
    - path: "src/lib/domain/varix-clinic/constants.ts"
      provides: "DOCTOR_CIRO_UUID, DOCTOR_CAROLINA_UUID, horarios hábiles, slot 20min"
  key_links:
    - from: "client.ts"
      to: "Supabase varix-clinic"
      via: "VARIX_CLINIC_SUPABASE_URL + VARIX_CLINIC_SERVICE_ROLE_KEY env vars"
      pattern: "VARIX_CLINIC_SUPABASE_URL"
---

<objective>
Wave 1 — Crear el domain module varix-clinic base: el cliente Supabase del proyecto hermano (único lugar que instancia createClient cross-project) + las constantes de negocio (UUIDs doctores, horarios, slot 20min). Es la fundación de la integración real (Regla 3 — todo write cross-project pasa por aquí).

Purpose: Aislar el acceso al Supabase de varix-clinic en un solo módulo domain (igual platform-config.ts es el único que toca platform_config). availability.ts y booking.ts (Wave 2) consumen este cliente.
Output: 2 archivos en src/lib/domain/varix-clinic/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/RESEARCH.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@.planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md
@src/lib/supabase/admin.ts
@src/lib/domain/platform-config.ts

<interfaces>
Patrón createAdminClient (src/lib/supabase/admin.ts): leer env, createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
Desviación domain documentada (src/lib/domain/platform-config.ts header): NO usa DomainContext ni workspace_id porque es config global. varix-clinic es análogo: mono-cliente, sin tenancy multi-workspace.
Horarios hábiles (diseño §8): L-V 8:00–11:30 + 14:30–15:30, sáb 8:00–12:00. Slot = 20 min (D-03).
Doctores: DOCTOR_CIRO_UUID + DOCTOR_CAROLINA_UUID (de 00-WAVE0-AUDIT.md Task 2).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: client.ts (único createClient de varix-clinic, fail-fast)</name>
  <read_first>
    - src/lib/supabase/admin.ts (patrón readEnv + createClient service_role)
    - src/lib/domain/platform-config.ts (header — copiar el estilo de documentación de la desviación: sin workspace_id)
    - .planning/standalone/agent-varixcenter/RESEARCH.md §Code Examples (esqueleto verbatim de client.ts)
  </read_first>
  <files>src/lib/domain/varix-clinic/client.ts</files>
  <action>
    Crear `src/lib/domain/varix-clinic/client.ts` con el patrón verbatim de RESEARCH §Code Examples:

    ```typescript
    import { createClient, type SupabaseClient } from '@supabase/supabase-js'

    let _client: SupabaseClient | null = null

    export function getVarixClinicClient(): SupabaseClient {
      if (_client) return _client
      const url = process.env.VARIX_CLINIC_SUPABASE_URL
      const key = process.env.VARIX_CLINIC_SERVICE_ROLE_KEY
      if (!url || !key) throw new Error('VARIX_CLINIC_* env vars not set')
      _client = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      return _client
    }
    ```

    **Header obligatorio (copiar el estilo de platform-config.ts líneas 8-49):** documentar:
    - Que este es el ÚNICO lugar que instancia el cliente Supabase de varix-clinic (proyecto hermano).
    - DESVIACIÓN del patrón domain estándar: NO usa DomainContext ni filtra por workspace_id de MorfX, porque varix-clinic es mono-cliente (no tiene tenancy multi-workspace) — igual que platform-config.ts documenta su propia desviación.
    - Que usa `service_role` porque toda la RLS de varix-clinic exige usuario authenticated con rol staff, y el bot no tiene sesión.
    - Fail-fast (throw) si faltan env vars → el caller (availability/booking) hace fail-open (cae a handoff, no crashea — Pitfall 8).
  </action>
  <verify>
    <automated>grep -c "getVarixClinicClient" src/lib/domain/varix-clinic/client.ts && grep -c "VARIX_CLINIC_SUPABASE_URL" src/lib/domain/varix-clinic/client.ts</automated>
  </verify>
  <acceptance_criteria>
    - `getVarixClinicClient` exportada; singleton (cachea `_client`)
    - Lee `VARIX_CLINIC_SUPABASE_URL` y `VARIX_CLINIC_SERVICE_ROLE_KEY` de process.env
    - Hace `throw` si falta cualquiera de las 2 env vars
    - Header documenta la desviación del patrón domain (sin workspace_id; mono-cliente)
    - `auth: { autoRefreshToken: false, persistSession: false }` presente
  </acceptance_criteria>
  <done>client.ts es el único punto de acceso al Supabase de varix-clinic, con fail-fast y desviación documentada.</done>
</task>

<task type="auto">
  <name>Task 2: constants.ts (UUIDs doctores + horarios + slot 20min)</name>
  <read_first>
    - .planning/standalone/agent-varixcenter/00-WAVE0-AUDIT.md (UUIDs reales de Ciro + Carolina)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §8 (horarios + slot)
    - src/lib/agents/godentist/dentos-availability.ts líneas 132-135 (patrón de cap operativo)
  </read_first>
  <files>src/lib/domain/varix-clinic/constants.ts</files>
  <action>
    Crear `src/lib/domain/varix-clinic/constants.ts` con las constantes de negocio (valores CONCRETOS del diseño + audit):

    - `export const DOCTOR_CIRO_UUID = '<uuid-de-00-WAVE0-AUDIT>'` (Dr. Ciro Mario Romero)
    - `export const DOCTOR_CAROLINA_UUID = '<uuid-de-00-WAVE0-AUDIT>'` (Dra. María Carolina Romero)
    - `export const DOCTOR_UUIDS = [DOCTOR_CIRO_UUID, DOCTOR_CAROLINA_UUID] as const`
    - `export const SLOT_MINUTES = 20` (D-03)
    - Horarios hábiles (diseño §8) en minutos desde medianoche, como rangos por jornada y día:
      ```typescript
      // L-V (1-5): mañana 8:00–11:30, tarde 14:30–15:30. Sábado (6): mañana 8:00–12:00 (sin tarde).
      export const HORARIOS = {
        weekday: { manana: [8*60, 11*60+30], tarde: [14*60+30, 15*60+30] },
        saturday: { manana: [8*60, 12*60], tarde: null },
      } as const
      ```
    - `export const APPOINTMENT_DURATION_MINUTES = 20` (un slot = una valoración).
    - `export const VALORACION_MOTIVO = 'Valoración (agendada por bot WhatsApp)'`

    ⚠️ Si en 00-WAVE0-AUDIT.md aparecieron MÁS de 2 doctores y el operador especificó cuáles 2 atienden valoraciones, usar ESOS 2 UUIDs.
  </action>
  <verify>
    <automated>grep -c "DOCTOR_CIRO_UUID" src/lib/domain/varix-clinic/constants.ts && grep -c "SLOT_MINUTES = 20" src/lib/domain/varix-clinic/constants.ts && grep -cE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" src/lib/domain/varix-clinic/constants.ts</automated>
  </verify>
  <acceptance_criteria>
    - DOCTOR_CIRO_UUID y DOCTOR_CAROLINA_UUID son UUIDs válidos (formato 8-4-4-4-12), NO placeholders
    - `grep -cE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" src/lib/domain/varix-clinic/constants.ts` ≥ 2
    - SLOT_MINUTES = 20
    - HORARIOS define weekday (manana+tarde) y saturday (solo manana) con los rangos del diseño §8
  </acceptance_criteria>
  <done>constants.ts con UUIDs reales, slot 20min y horarios hábiles del diseño §8.</done>
</task>

</tasks>

<verification>
- 2 archivos existen en src/lib/domain/varix-clinic/
- UUIDs de doctores son reales (no placeholders)
- client.ts es el único createClient de varix-clinic
</verification>

<success_criteria>
- getVarixClinicClient singleton con fail-fast
- UUIDs reales de los 2 doctores
- Horarios L-V 8:00–11:30 + 14:30–15:30, sáb 8:00–12:00 + slot 20min codificados
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/03-SUMMARY.md`
</output>
