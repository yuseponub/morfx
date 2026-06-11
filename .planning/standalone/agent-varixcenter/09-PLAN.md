---
phase: agent-varixcenter
plan: 09
type: execute
wave: 4
depends_on: [05]
files_modified:
  - src/lib/domain/varix-clinic/__tests__/availability.test.ts
  - src/lib/domain/varix-clinic/__tests__/booking.test.ts
autonomous: true
requirements: [VARIX-AVAIL, VARIX-BOOK, VARIX-FESTIVOS]

must_haves:
  truths:
    - "availability.test.ts prueba grilla 20min, exclusión domingo/festivo, merge de 2 agendas"
    - "booking.test.ts prueba 23P01 retry por doctor -> slot_taken, idempotencia patient, split nombre/apellido, celular 10 dígitos, TZ -05:00"
    - "Las suites del domain pasan verde con mock del cliente Supabase"
  artifacts:
    - path: "src/lib/domain/varix-clinic/__tests__/availability.test.ts"
      provides: "tests de generación de grilla + festivos + merge"
      contains: "getVarixAvailability"
    - path: "src/lib/domain/varix-clinic/__tests__/booking.test.ts"
      provides: "tests de 23P01 + idempotencia + normalización"
      contains: "23P01"
  key_links:
    - from: "booking.test.ts"
      to: "manejo 23P01"
      via: "mock que devuelve error.code 23P01 en primer doctor"
      pattern: "23P01"
---

<objective>
Wave 4 — Tests del domain module varix-clinic (la pieza sin analog, ~80% del riesgo). Mockear el cliente Supabase y probar las invariantes críticas: grilla de 20min, exclusión de festivos, merge de 2 agendas, manejo de 23P01 con retry por doctor, idempotencia de patient, split nombre/apellido, celular 10 dígitos, TZ -05:00.

Purpose: Probar el código nuevo de mayor riesgo sin depender de la conexión real a varix-clinic. Las invariantes (D-03, D-04, D-09, Pitfalls 5/6) deben estar bajo test.
Output: 2 suites en src/lib/domain/varix-clinic/__tests__/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/RESEARCH.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@src/lib/agents/godentist-fb-ig/__tests__/dentos-availability.test.ts
@src/lib/domain/varix-clinic/availability.ts
@src/lib/domain/varix-clinic/booking.ts
@src/lib/domain/varix-clinic/constants.ts

<interfaces>
Framework: Vitest (`npx vitest run src/lib/domain/varix-clinic/__tests__/`)
Mock del cliente: vi.mock('@/lib/domain/varix-clinic/client', () => ({ getVarixClinicClient: () => mockSupabaseClient }))
mockSupabaseClient debe simular .from('appointments').select().gte().lte().not() y .from('patients').select().eq().maybeSingle() + .insert().select().single()
Para 23P01: el mock de appointments.insert devuelve { error: { code: '23P01' } } en el primer doctor y { data: { id } } en el segundo
Analog del mock pattern: dentos-availability.test.ts
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: availability.test.ts (grilla + festivos + merge)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/__tests__/dentos-availability.test.ts (analog — mock pattern + assertions de slots)
    - src/lib/domain/varix-clinic/availability.ts (lo que se testea)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §8 (horarios) + D-09 (festivos)
  </read_first>
  <files>src/lib/domain/varix-clinic/__tests__/availability.test.ts</files>
  <action>
    Crear `src/lib/domain/varix-clinic/__tests__/availability.test.ts` mockeando getVarixClinicClient. Tests mínimos:
    - **Día hábil sin citas (lunes):** getVarixAvailability('2026-06-15') -> manana incluye '8:00 AM' ... y el último de mañana termina <= 11:30; tarde incluye 14:30/14:50/15:10.
    - **Sábado:** tarde vacío, mañana hasta ~11:40.
    - **Domingo:** { manana:[], tarde:[] } (D-09) — sin tocar Supabase (verificar que el mock NO se llamó).
    - **Festivo (un YYYY-MM-DD del Set FESTIVOS):** { manana:[], tarde:[] } (D-09).
    - **Merge:** un slot ocupado por AMBOS doctores NO aparece; ocupado por solo UNO SÍ aparece. (Mock devuelve appointments de ambos doctores en un slot vs solo uno.)
    - **TZ-safe:** verificar que el día de semana se calcula con Date.UTC (un test que pasaría mal con getDay() local — ej. una fecha límite).
  </action>
  <verify>
    <automated>npx vitest run src/lib/domain/varix-clinic/__tests__/availability.test.ts 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - Test de domingo/festivo verifica slots vacíos (D-09)
    - Test de merge verifica que slot doble-ocupado se excluye y slot mono-ocupado se incluye
    - Test de día hábil verifica grilla 20min con cierre correcto
    - Suite pasa verde
  </acceptance_criteria>
  <done>availability bajo test: grilla, festivos, merge de 2 agendas.</done>
</task>

<task type="auto">
  <name>Task 2: booking.test.ts (23P01 + idempotencia + normalización + TZ)</name>
  <read_first>
    - src/lib/domain/varix-clinic/booking.ts (lo que se testea)
    - .planning/standalone/agent-varixcenter/RESEARCH.md §Code Examples (booking) + Pitfalls 5/6
    - .planning/standalone/agent-varixcenter/PATTERNS.md sección booking.ts
  </read_first>
  <files>src/lib/domain/varix-clinic/__tests__/booking.test.ts</files>
  <action>
    Crear `src/lib/domain/varix-clinic/__tests__/booking.test.ts` mockeando getVarixClinicClient. Tests mínimos:
    - **Patient nuevo:** cédula no existe -> insert patient + insert appointment ok -> { ok:true, appointmentId, patientId }.
    - **Patient existente (idempotencia):** maybeSingle devuelve un patient -> NO se llama patients.insert; se reusa patientId.
    - **Split nombre/apellido:** nombre="Paola Méndez García" -> el insert de patient recibe { nombre:'Paola', apellido:'Méndez García' }. nombre="Pedro" (un token) -> apellido='.'.
    - **Celular 10 dígitos:** telefono="573001234567" -> el insert recibe celular="3001234567".
    - **23P01 retry por doctor:** appointments.insert con doctor A devuelve error.code='23P01', con doctor B devuelve { data:{id} } -> { ok:true } con doctor B.
    - **Ambos doctores 23P01:** ambos inserts devuelven 23P01 -> { ok:false, reason:'slot_taken' }.
    - **Error no-23P01:** insert devuelve error.code='XXXXX' -> { ok:false, reason:'error', detail }.
    - **TZ -05:00:** verificar que el insert de appointment recibe fecha_hora_inicio con '-05:00' en el string (el test pasa el ISO con offset).
  </action>
  <verify>
    <automated>npx vitest run src/lib/domain/varix-clinic/__tests__/booking.test.ts 2>&1 | tail -10; grep -c "23P01" src/lib/domain/varix-clinic/__tests__/booking.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "23P01" src/lib/domain/varix-clinic/__tests__/booking.test.ts` >= 2 (retry + ambos)
    - Test de slot_taken (ambos doctores 23P01) presente
    - Test de split nombre/apellido + celular 10 dígitos presente
    - Test de idempotencia patient (existente -> no re-insert) presente
    - Suite pasa verde
    - `npx tsc --noEmit 2>&1 | grep "varix-clinic/__tests__"` no muestra errores
  </acceptance_criteria>
  <done>booking bajo test: 23P01 retry, slot_taken, idempotencia, split, normalización, TZ.</done>
</task>

</tasks>

<verification>
- 2 suites existen en src/lib/domain/varix-clinic/__tests__/
- `npx vitest run src/lib/domain/varix-clinic/__tests__/` verde
- tsc --noEmit sin errores en varix-clinic/
</verification>

<success_criteria>
- availability testeado (grilla, festivos D-09, merge D-03)
- booking testeado (23P01 D-04, idempotencia, Pitfalls 5/6)
- Suites verdes con mock del cliente Supabase
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/09-SUMMARY.md`
</output>
