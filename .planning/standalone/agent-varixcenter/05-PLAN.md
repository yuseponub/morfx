---
phase: agent-varixcenter
plan: 05
type: execute
wave: 2
depends_on: [03]
files_modified:
  - src/lib/domain/varix-clinic/availability.ts
  - src/lib/domain/varix-clinic/booking.ts
autonomous: true
requirements: [VARIX-AVAIL, VARIX-BOOK, VARIX-FESTIVOS]

must_haves:
  truths:
    - "getVarixAvailability genera grilla de slots de 20min dentro de horarios hábiles y excluye domingos/festivos (D-09)"
    - "Un slot está LIBRE si AL MENOS uno de los 2 doctores no tiene cita solapada en ese rango"
    - "bookVarixAppointment crea patient idempotente por cédula (split nombre/apellido + celular 10 dígitos)"
    - "bookVarixAppointment maneja el constraint 23P01: intenta doctor A, si choca intenta doctor B, si ambos chocan retorna slot_taken"
    - "fecha_hora_inicio se construye con offset -05:00 (Regla 2, Pitfall 6)"
  artifacts:
    - path: "src/lib/domain/varix-clinic/availability.ts"
      provides: "getVarixAvailability(fecha) → { manana: string[], tarde: string[] }"
      contains: "getVarixAvailability"
    - path: "src/lib/domain/varix-clinic/booking.ts"
      provides: "bookVarixAppointment(...) → { ok:true, appointmentId, patientId } | { ok:false, reason }"
      contains: "bookVarixAppointment"
  key_links:
    - from: "booking.ts"
      to: "appointments constraint 23P01"
      via: "retry otro doctor → slot_taken"
      pattern: "23P01"
    - from: "availability.ts"
      to: "appointments de varix-clinic"
      via: "getVarixClinicClient + isNonWorkingDay"
      pattern: "getVarixClinicClient"
---

<objective>
Wave 2 — Construir las DOS piezas genuinamente nuevas (sin analog directo en MorfX, ~80% del riesgo): generar la grilla de disponibilidad de 20min fusionando 2 agendas de doctores (availability.ts) + escribir la cita real en el Supabase de varix-clinic con manejo del constraint anti-solapamiento (booking.ts).

GoDentist NUNCA escribe — recibe slots ya formateados del robot. Acá generamos la grilla nosotros y escribimos patient+appointment cross-project. Riesgos: TZ (Regla 2), constraint 23P01 concurrente, split nombre/apellido, celular 10 dígitos.

Purpose: Habilitar el agendamiento REAL (el corazón del valor del bot). availability lo consume mostrar_disponibilidad; booking lo consume agendar_cita (Wave 3).
Output: 2 archivos en src/lib/domain/varix-clinic/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/RESEARCH.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@.planning/standalone/agent-varixcenter/DISENO-COMPLETO.md
@src/lib/agents/godentist/dentos-availability.ts
@src/lib/domain/varix-clinic/client.ts
@src/lib/domain/varix-clinic/constants.ts
@src/lib/agents/varixcenter/constants.ts

<interfaces>
Cliente: getVarixClinicClient() de ./client (único acceso a varix-clinic)
Constantes: DOCTOR_UUIDS, SLOT_MINUTES=20, HORARIOS, VALORACION_MOTIVO de ./constants
Festivos: isNonWorkingDay(fecha) de src/lib/agents/varixcenter/constants (o clonar el helper a varix-clinic)
Helpers de tiempo (copiar de dentos-availability.ts líneas 109-130): parseTimeToMinutes("8:00 AM")→480, minutesToTime(480)→"8:00 AM"

Schema varix-clinic (VERIFIED migraciones 006/007/041/052):
- patients: cedula VARCHAR(10) UNIQUE parcial WHERE NOT NULL, nombre VARCHAR(100) NOT NULL, apellido VARCHAR(100) NOT NULL, celular VARCHAR(10), ciudad VARCHAR(100). Trigger prevent_cedula_update (cédula inmutable).
- appointments: patient_id UUID NOT NULL, doctor_id UUID NULL, fecha_hora_inicio TIMESTAMPTZ NOT NULL, fecha_hora_fin TIMESTAMPTZ NOT NULL, estado appointment_status DEFAULT 'programada', motivo_consulta TEXT, created_by UUID NULL.
- Constraint no_overlapping_appointments: EXCLUDE gist (doctor_id WITH =, tstzrange(inicio,fin,'[)') WITH &&) WHERE estado NOT IN ('cancelada','no_asistio'). error.code='23P01'. NULL doctor_id nunca colisiona.
- Shape de retorno (espejo de checkDentosAvailability godentist): { manana: string[], tarde: string[] }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: availability.ts (grilla 20min + merge 2 agendas + festivos)</name>
  <read_first>
    - src/lib/agents/godentist/dentos-availability.ts (helpers parseTimeToMinutes/minutesToTime líneas 109-130 + shape { manana, tarde } líneas 19-23 + cap operativo)
    - .planning/standalone/agent-varixcenter/RESEARCH.md §Decisión + Open Question 4 (reglas de grilla, último slot que cabe antes del cierre)
    - .planning/standalone/agent-varixcenter/PATTERNS.md sección availability.ts
    - src/lib/domain/varix-clinic/constants.ts (HORARIOS, SLOT_MINUTES, DOCTOR_UUIDS)
  </read_first>
  <behavior>
    - getVarixAvailability('2026-06-15') (lunes) → genera slots mañana 8:00,8:20,...,11:10 (último que cabe completo antes de 11:30) + tarde 14:30,14:50,15:10
    - getVarixAvailability de un sábado → solo mañana 8:00..11:40, tarde vacío
    - getVarixAvailability de un domingo o festivo → { manana:[], tarde:[] } (D-09)
    - Un slot ocupado por AMBOS doctores NO aparece; ocupado por solo uno SÍ aparece (merge)
    - Si la conexión Supabase falla → throw (caller hace fail-open)
  </behavior>
  <action>
    Crear `src/lib/domain/varix-clinic/availability.ts`:

    **1. Copiar helpers puros** de dentos-availability.ts (verbatim): `parseTimeToMinutes`, `minutesToTime`. Son helpers sin estado.

    **2. Exclusión de día no hábil (D-09):** al inicio, si `isNonWorkingDay(fecha)` ≠ null → retornar `{ manana: [], tarde: [] }` (sin consultar Supabase). Usar el helper TZ-safe (`Date.UTC`).

    **3. Determinar día de semana TZ-safe** (Regla 2): `new Date(Date.UTC(y, m-1, d)).getUTCDay()` (1-5 = L-V, 6 = sábado). Seleccionar HORARIOS.weekday o HORARIOS.saturday.

    **4. Generar grilla de candidatos de 20min** dentro de cada rango de HORARIOS:
    - Mañana weekday [8*60, 11*60+30]: slots inicio 8:00, 8:20, ..., último cuyo fin (inicio+20) ≤ 11:30 → 8:00..11:10 (11:10+20=11:30 cabe). Formato "8:00 AM - 8:20 AM" o como lo espere mostrar_disponibilidad (consistente con godentist; revisar el template `mostrar_disponibilidad` de PLANTILLAS.md que usa {{slots_manana}}).
    - Tarde weekday [14*60+30, 15*60+30]: 14:30, 14:50, 15:10 (15:10+20=15:30 cabe).
    - Sábado mañana [8*60, 12*60]: 8:00..11:40; tarde vacío.

    **5. Consultar appointments existentes (estado activo, ambos doctores)** del día:
    ```typescript
    const sb = getVarixClinicClient()
    const dayStart = `${fecha}T00:00:00-05:00`
    const dayEnd   = `${fecha}T23:59:59-05:00`
    const { data: appts } = await sb.from('appointments')
      .select('doctor_id, fecha_hora_inicio, fecha_hora_fin, estado')
      .gte('fecha_hora_inicio', dayStart)
      .lte('fecha_hora_inicio', dayEnd)
      .not('estado', 'in', '(cancelada,no_asistio)')
    ```

    **6. Merge de 2 agendas:** un slot candidato [sInicio, sFin) está LIBRE si AL MENOS uno de DOCTOR_UUIDS no tiene ninguna appointment activa que solape ese rango. Solapa si `apptInicio < sFin && apptFin > sInicio` (rango semi-abierto, igual al constraint gist '[)'). Comparar por doctor_id; un slot solo se descarta si AMBOS doctores están ocupados en ese rango.

    **7. Retorno:** `{ manana: string[], tarde: string[] }` (mismo shape que checkDentosAvailability para que mostrar_disponibilidad lo consuma sin cambios).

    **8. Helper de conversión slot → TIMESTAMPTZ (Pitfall 6 / Regla 2):** exportar un helper puro junto a parseTimeToMinutes/minutesToTime:
    ```typescript
    export function parseSlotToISO(fecha: string, slotStr: string): { inicio: string; fin: string }
    // parseSlotToISO('2026-06-15', '8:00 AM - 8:20 AM')
    //   → { inicio: '2026-06-15T08:00:00-05:00', fin: '2026-06-15T08:20:00-05:00' }
    ```
    Implementación: split del slotStr por ' - ', parseTimeToMinutes en cada lado, formatear HH:MM:SS con offset literal `-05:00` (NUNCA `new Date(str)` sin offset). Plan 06 (varixcenter-agent) lo consume para construir fechaHoraInicio/Fin de bookVarixAppointment.

    **Header:** documentar que esta es la primera generación de grilla propia en MorfX (godentist recibe slots del robot) + Regla 2.
  </action>
  <verify>
    <automated>grep -c "getVarixAvailability" src/lib/domain/varix-clinic/availability.ts && grep -c "isNonWorkingDay" src/lib/domain/varix-clinic/availability.ts && grep -c "Date.UTC" src/lib/domain/varix-clinic/availability.ts</automated>
  </verify>
  <acceptance_criteria>
    - getVarixAvailability exportada con firma `(fecha: string) => Promise<{ manana: string[], tarde: string[] }>`
    - Llama `isNonWorkingDay` y retorna slots vacíos para domingo/festivo (D-09)
    - Usa `Date.UTC(...).getUTCDay()` para el día de semana (Regla 2), NO `new Date(fecha).getDay()`
    - Consulta appointments filtrando `estado NOT IN (cancelada, no_asistio)`
    - Lógica de merge: slot descartado solo si AMBOS doctores ocupados
    - Slot 20min: el último slot de mañana weekday termina ≤ 11:30
    - `grep -c "export function parseSlotToISO" src/lib/domain/varix-clinic/availability.ts` = 1 y su salida usa offset literal `-05:00`
  </acceptance_criteria>
  <done>availability.ts genera grilla 20min, excluye festivos/domingos, fusiona 2 agendas.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: booking.ts (patient idempotente + appointment + 23P01 retry)</name>
  <read_first>
    - .planning/standalone/agent-varixcenter/RESEARCH.md §Code Examples (booking con 23P01 — esqueleto verbatim) + §Decisión (created_by NULL, nombre/apellido split, celular 10 dígitos)
    - .planning/standalone/agent-varixcenter/PATTERNS.md sección booking.ts (Pitfalls 5/6)
    - src/lib/domain/varix-clinic/constants.ts (DOCTOR_UUIDS, VALORACION_MOTIVO)
    - src/lib/domain/varix-clinic/client.ts (getVarixClinicClient)
  </read_first>
  <behavior>
    - bookVarixAppointment con cédula nueva → crea patient (nombre="Paola", apellido="Méndez García" si nombre="Paola Méndez García") + appointment, retorna { ok:true, appointmentId, patientId }
    - cédula existente → reusa patientId, NO re-inserta patient, NO toca cédula (trigger prevent_cedula_update)
    - telefono "573001234567" → celular guardado como "3001234567" (10 dígitos)
    - INSERT appointment con doctor A da 23P01 → reintenta con doctor B
    - ambos doctores dan 23P01 → { ok:false, reason:'slot_taken' }
    - error no-23P01 → { ok:false, reason:'error', detail }
    - fecha_hora_inicio se construye con offset -05:00
  </behavior>
  <action>
    Crear `src/lib/domain/varix-clinic/booking.ts` con la firma de RESEARCH §Decisión:
    ```typescript
    export async function bookVarixAppointment(params: {
      nombre: string; cedula: string; telefono: string
      fechaHoraInicio: string  // ISO con -05:00
      fechaHoraFin: string
    }): Promise<
      | { ok: true; appointmentId: string; patientId: string }
      | { ok: false; reason: 'slot_taken' | 'error'; detail?: string }
    >
    ```

    Implementación (esqueleto verbatim de RESEARCH §Code Examples, verificado contra migraciones 006/007/041/052):

    **1. Split nombre/apellido (Pitfall 5):** `nombre` Y `apellido` son NOT NULL. Heurística: primer token = nombre, resto = apellido; si solo hay un token, apellido='.' (placeholder válido). Ej: "Paola Méndez García" → nombre="Paola", apellido="Méndez García".

    **2. Normalizar celular a 10 dígitos (Pitfall 5):** `celular VARCHAR(10)`. Quitar prefijo país: "573001234567" (12) → "3001234567" (10). Helper: tomar los últimos 10 dígitos numéricos.

    **3. Patient idempotente por cédula:**
    ```typescript
    const sb = getVarixClinicClient()
    const { data: existing } = await sb.from('patients').select('id').eq('cedula', cedula).maybeSingle()
    let patientId = existing?.id
    if (!patientId) {
      const { data, error } = await sb.from('patients')
        .insert({ cedula, nombre, apellido, celular }).select('id').single()
      if (error?.code === '23505') {  // carrera: otro creó el patient — re-SELECT
        const { data: re } = await sb.from('patients').select('id').eq('cedula', cedula).single()
        patientId = re.id
      } else if (error) {
        return { ok: false, reason: 'error', detail: error.message }
      } else {
        patientId = data.id
      }
    }
    ```

    **4. INSERT appointment con retry por doctor (constraint 23P01):**
    ```typescript
    for (const doctorId of DOCTOR_UUIDS) {
      const { data, error } = await sb.from('appointments').insert({
        patient_id: patientId, doctor_id: doctorId,
        fecha_hora_inicio: fechaHoraInicio,   // ISO con -05:00 (Regla 2, Pitfall 6)
        fecha_hora_fin: fechaHoraFin,
        estado: 'programada',
        motivo_consulta: VALORACION_MOTIVO,
      }).select('id').single()
      if (!error) return { ok: true, appointmentId: data.id, patientId }
      if (error.code !== '23P01') return { ok: false, reason: 'error', detail: error.message }
      // 23P01 → ese doctor ocupado en ese rango; probar el siguiente
    }
    return { ok: false, reason: 'slot_taken' }
    ```

    **5. created_by:** dejar NULL (es nullable — A2 research; auditoría más rica = follow-up).

    **Header:** documentar Pitfalls 5 (nombre/apellido + celular), 6 (TZ offset), y el patrón 23P01 retry-por-doctor.
  </action>
  <verify>
    <automated>grep -c "bookVarixAppointment" src/lib/domain/varix-clinic/booking.ts && grep -c "23P01" src/lib/domain/varix-clinic/booking.ts && grep -c "slot_taken" src/lib/domain/varix-clinic/booking.ts</automated>
  </verify>
  <acceptance_criteria>
    - bookVarixAppointment exportada con el retorno discriminado { ok:true,... } | { ok:false, reason:'slot_taken'|'error' }
    - SELECT patient por cédula antes de INSERT (idempotencia); maneja 23505 con re-SELECT
    - Loop sobre DOCTOR_UUIDS con manejo de `error.code === '23P01'` → siguiente doctor; ambos → slot_taken
    - Split nombre/apellido implementado (apellido NOT NULL)
    - Celular normalizado a 10 dígitos antes del INSERT
    - estado:'programada' + motivo_consulta = VALORACION_MOTIVO
    - `npx tsc --noEmit 2>&1 | grep "varix-clinic/booking"` no muestra errores
  </acceptance_criteria>
  <done>booking.ts crea patient idempotente + appointment, maneja 23P01 con retry por doctor, TZ -05:00.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| MorfX bot → Supabase varix-clinic | El bot escribe patient+appointment con service_role (bypasea RLS) cross-project |
| Cliente WhatsApp → comprehension → booking | cédula/nombre/teléfono del usuario llegan a INSERT |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-varix-01 | Tampering | booking.ts INSERT cédula/nombre | mitigate | supabase-js usa queries parametrizadas (.eq/.insert con objeto), nunca string concat — SQL injection imposible |
| T-varix-02 | Info disclosure | VARIX_CLINIC_SERVICE_ROLE_KEY | mitigate | env var en Vercel, nunca NEXT_PUBLIC_*, nunca en logs/repo |
| T-varix-03 | Elevation | booking escribe fuera de scope (pagos/historias) | mitigate | domain module SOLO toca patients (insert) + appointments (insert); cero acceso a otras tablas de varix-clinic |
| T-varix-04 | Tampering | doble agendamiento concurrente (race) | mitigate | constraint Postgres 23P01 garantiza atomicidad; retry por doctor → slot_taken |
| T-varix-05 | Info disclosure | cédula/teléfono en observability | mitigate | redaction en el agente (Wave 3): phone last 4, cédula parcial |
</threat_model>

<verification>
- 2 archivos existen en src/lib/domain/varix-clinic/
- availability genera grilla correcta, excluye festivos, fusiona 2 agendas
- booking maneja 23P01 + idempotencia patient + TZ -05:00
- `npx tsc --noEmit` sin errores nuevos en varix-clinic/
</verification>

<success_criteria>
- getVarixAvailability con grilla 20min + merge + festivos (D-03, D-09)
- bookVarixAppointment con patient idempotente + appointment + 23P01 retry (D-04)
- TZ -05:00 en fecha_hora (Regla 2)
- Scope acotado: solo patients + appointments (Threat T-varix-03)
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/05-SUMMARY.md`
</output>
