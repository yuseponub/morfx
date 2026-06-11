---
phase: agent-varixcenter
verified: 2026-06-11T19:00:00-05:00
status: human_needed
score: 18/18 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Agregar env vars VARIX_CLINIC_SUPABASE_URL + VARIX_CLINIC_SERVICE_ROLE_KEY en Vercel (Production + Preview)"
    expected: "Sin las env vars el booking hace fail-open y el agente degrada a handoff. Con ellas, getVarixAvailability y bookVarixAppointment conectan al Supabase de varix-clinic en prod."
    why_human: "Las env vars son secretos del operador — no se pueden verificar programáticamente ni commitear. Requieren acción manual en el panel de Vercel."
  - test: "Crear la routing rule en /agentes/routing/editor (workspace Varixcenter c6621640-ba67-43de-9f05-905f09a6dc8f)"
    expected: "El SQL pre-formado en 12-ROUTING-RULE-USER-ACTION.md inserta: rule_type='agent_router', priority=100, fact channel in ['whatsapp','facebook','instagram'] → agent_id='varixcenter'. Después de crearla, un mensaje WA/FB/IG inbound al workspace debe enrutar al agente varixcenter."
    why_human: "Activación 100% manual por diseño (D-02 / Regla 6). El SQL también hace INSERT de workspace_agent_config con lifecycle_routing_enabled=true."
  - test: "Smoke real: enviar mensaje al número WA/FB/IG del workspace Varixcenter y verificar que: (a) el bot responde con el saludo custom D-12, (b) el flujo de captura de datos funciona, (c) la cita aparece en la DB de varix-clinic."
    expected: "Respuesta con template saludo CORE ('¡Hola! 👋 Bienvenido a VarixCenter…') + COMP ('¿Deseas agendar tu valoración?'). Captura nombre+cédula+teléfono. Slots reales de 20min. Cita creada en patients + appointments de varix-clinic con estado 'programada'."
    why_human: "Requiere WA/FB/IG conectado al workspace, env vars configuradas, y routing rule activa. No se puede testear sin runtime real."
  - test: "Verificar dropdown routing-editor muestra 'Varixcenter Valoraciones'"
    expected: "En /agentes/routing/editor del workspace Varixcenter, el dropdown de selección de agente incluye la opción con id='varixcenter'."
    why_human: "Requiere browser y deploy activo en Vercel."
  - test: "LEARNINGS.md del standalone"
    expected: "Crear .planning/standalone/agent-varixcenter/LEARNINGS.md documentando: patrón cross-project Supabase (service_role), CR-01 parseSlotToISO solo-inicio, W-02 catch-all 'otro', rule_type='agent_router' (no 'router'), 23P01 retry por doctor, ON CONFLICT workspace_agent_config."
    why_human: "Pendiente de escritura — documentado como ítem por-completar en 11-SUMMARY.md §Próximos pasos."
---

# Phase agent-varixcenter: Verification Report

**Phase Goal:** Nuevo agente conversacional `varixcenter` (motor v3 clonado, patrón godentist) que agenda VALORACIONES ($100.000) en VarixCenter end-to-end: saludo custom → captura nombre+teléfono+cédula → disponibilidad real (slots 20min, 2 doctores fusionados, festivos excluidos) contra el Supabase de varix-clinic → crea patient+appointment estado `programada`. Multi-canal WA+FB+IG vía routing rule manual (priority 100). Workspace c6621640-ba67-43de-9f05-905f09a6dc8f. Sin alterar agentes en producción (Regla 6).

**Verified:** 2026-06-11T19:00:00-05:00
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cadena webhook → routing → dispatch → V3ProductionRunner 'varixcenter' existe y está conectada | VERIFIED | webhook-processor.ts: pre-warm `import('../varixcenter')` (count=2) + branch `agentId === 'varixcenter'` (count=1); v3-production-runner.ts: `agentModule === 'varixcenter'` → `await import('../varixcenter')` → `processMessage` |
| 2 | VARIXCENTER_AGENT_ID = 'varixcenter' as const definida y usada en config.ts, response-track.ts, index.ts | VERIFIED | `config.ts:20`, `TEMPLATE_LOOKUP_AGENT_ID = VARIXCENTER_AGENT_ID` en response-track.ts, ninguna referencia a la constante de otro agente en código no-test |
| 3 | Anti-Pitfall 1 (anti-cdc06d9): 0 matches de 'godentist' en src/lib/agents/varixcenter/ fuera de __tests__ | VERIFIED | Gate 2: `grep -rn "'godentist'" src/lib/agents/varixcenter/` sin `__tests__/` = 0. Tests anti-regresión intencionales: `.not.toBe('godentist')` en response-track.test.ts (líneas 119, 134, 150) |
| 4 | Regla 3: 0 matches createClient/createAdminClient/@supabase/supabase-js en src/lib/agents/varixcenter/ | VERIFIED | Gate 1: 0 matches. El único `createClient` del cross-project está en `src/lib/domain/varix-clinic/client.ts` (único lugar correcto) |
| 5 | 24 intents del diseño §1 definidos en constants.ts (VARIX_INTENTS) | VERIFIED | 12 informacionales + 5 acciones cliente + 5 escape + 2 otros = 24, mapeados verbatim al diseño en constants.ts:16-47 |
| 6 | 7 fases del diseño §3 implementadas en config.ts (states + validTransitions) | VERIFIED | initial, capturing_data, capturing_fecha, showing_availability, confirming, appointment_registered, closed con validTransitions correctas |
| 7 | Festivos colombianos + isNonWorkingDay TZ-safe implementados | VERIFIED | constants.ts:190+ FESTIVOS_COLOMBIA_2026 + isNonWorkingDay(); state.ts usa isNonWorkingDay en mergeSlots para rechazar domingo/festivo; availability.ts usa la misma función antes de consultar Supabase |
| 8 | CRITICAL_FIELDS = ['nombre','telefono','cedula'] (D-05, NO sede_preferida) | VERIFIED | constants.ts:88 `VARIX_CRITICAL_FIELDS = ['nombre', 'telefono', 'cedula']`; VAL guard en v3-production-runner.ts:626 `'varixcenter': ['nombre', 'telefono', 'cedula']` |
| 9 | getVarixAvailability genera grilla 20min, fusiona 2 doctores (slot libre si AL MENOS 1 libre), excluye domingos/festivos | VERIFIED | availability.ts:13 comentario + :197 `alMenosUnoLibre = DOCTOR_UUIDS.some(...)` + SLOT_MINUTES=20 + HORARIOS weekday/saturday correctos (11:00-11:20 incluido en rango 8:00–11:30) |
| 10 | bookVarixAppointment: patient idempotente por cédula + appointment con retry 23P01 doctor A→B→slot_taken + timestamp -05:00 | VERIFIED | booking.ts:118 maneja 23505 race, :136-168 loop por DOCTOR_UUIDS con 23P01 retry; parseSlotToISO construye offset literal `-05:00`; bookVarixAppointment recibe fechaHoraInicio/Fin ya con -05:00 |
| 11 | CR-01 fix: parseSlotToISO tolera formato solo-inicio ('10:00 AM') calculando fin = inicio + SLOT_MINUTES | VERIFIED | availability.ts:81-94, commit `37e9f42e`. Sin el fix, booking degradaba siempre a handoff (TypeError en undefined.trim()) |
| 12 | W-01 fix: query appointments lanza en error de Supabase (nunca trata error como 0 citas = todos libres) | VERIFIED | availability.ts: desestructura `{ error: apptError }` y hace throw si falla; commit `37e9f42e` |
| 13 | response-track: tipo_venas → info_vasitos/info_grandes/info_ambas; null → triage; es_foraneo → fuera_de_ciudad COMP | VERIFIED | response-track.ts:57-84 resolveTipoVenasTemplates + :175-178 esForaneo → fuera_de_ciudad COMP |
| 14 | varixcenter-agent.ts llama getVarixAvailability en mostrar_disponibilidad (fail-open) y bookVarixAppointment en agendar_cita con slot_taken re-consulta | VERIFIED | varixcenter-agent.ts:29-30 imports; :325 getVarixAvailability; :371 bookVarixAppointment; :386-392 slot_taken re-consulta |
| 15 | Tag VAL side-effect: v3-production-runner incluye varixcenter con CRITICAL_FIELDS cedula (no sede_preferida) | VERIFIED | runner:595-626: branch extendido `agentModule !== 'varixcenter'` = false activa el tag; CRITICAL_FIELDS_BY_AGENT['varixcenter'] correcto |
| 16 | Regla 6 — Godentist baseline intacto: 9 suites / 103 tests sin regresión | VERIFIED | Ejecutado 2026-06-11: `Test Files 9 passed (9)` · `Tests 103 passed (103)` |
| 17 | Suite completa varixcenter + varix-clinic: 7 suites / 148 tests verdes | VERIFIED | Ejecutado 2026-06-11: `Test Files 7 passed (7)` · `Tests 148 passed (148)` |
| 18 | tsc --noEmit = 0 errores | VERIFIED | Ejecutado 2026-06-11: exit 0, 0 errores |

**Score:** 18/18 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/agents/varixcenter/config.ts` | VARIXCENTER_AGENT_ID + AgentConfig 7 fases | VERIFIED | 81 líneas, literal `'varixcenter' as const`, 7 states con validTransitions |
| `src/lib/agents/varixcenter/constants.ts` | 24 intents + CRITICAL_FIELDS + festivos + isNonWorkingDay | VERIFIED | 253 líneas, VARIX_INTENTS array 24 elementos, FESTIVOS_COLOMBIA_2026, isNonWorkingDay() |
| `src/lib/agents/varixcenter/comprehension-schema.ts` | Zod schema 24 intents + slots sin sede + tipo_venas enum | VERIFIED | tipo_venas z.enum(['grandes','vasitos','ambas']), cedula, fecha_preferida, horario_seleccionado presentes |
| `src/lib/agents/varixcenter/transitions.ts` | Máquina de estados — 42+ transiciones del diseño §7 | VERIFIED | 549 líneas; escape (guards.ts R0/R1) + W-02 catch-all `* + otro → handoff` |
| `src/lib/agents/varixcenter/response-track.ts` | Selección de templates por intent/acción, TEMPLATE_LOOKUP_AGENT_ID propio | VERIFIED | 506 líneas; TEMPLATE_LOOKUP_AGENT_ID = VARIXCENTER_AGENT_ID; tipo_venas routing; fuera_de_ciudad COMP |
| `src/lib/agents/varixcenter/varixcenter-agent.ts` | processMessage con write-path varix-clinic | VERIFIED | 579 líneas; imports getVarixAvailability + bookVarixAppointment; slot_taken re-consulta |
| `src/lib/agents/varixcenter/index.ts` | Self-register + re-exports | VERIFIED | agentRegistry.register(varixcenterConfig) side-effect |
| `src/lib/domain/varix-clinic/client.ts` | getVarixClinicClient() singleton, fail-fast env vars, W-03 URL validation | VERIFIED | 82 líneas; throw ante env vars faltantes; `new URL(url)` antes de cachear (W-03) |
| `src/lib/domain/varix-clinic/constants.ts` | DOCTOR_CIRO_UUID, DOCTOR_CAROLINA_UUID, SLOT_MINUTES=20, HORARIOS | VERIFIED | 45 líneas; ambos UUIDs correctos del audit Wave 0; SLOT_MINUTES=20; HORARIOS weekday/saturday |
| `src/lib/domain/varix-clinic/availability.ts` | getVarixAvailability + parseSlotToISO (CR-01) | VERIFIED | 214 líneas; solo-inicio tolerated (CR-01 commit 37e9f42e); merge 2 doctores; throw en error (W-01) |
| `src/lib/domain/varix-clinic/booking.ts` | bookVarixAppointment + 23P01 retry + patient idempotente | VERIFIED | 170 líneas; loop DOCTOR_UUIDS; 23505 race; 23P01 retry; slot_taken |
| `src/lib/agents/agent-catalog.ts` | entry id:'varixcenter' | VERIFIED | line 46 |
| `src/lib/agents/production/webhook-processor.ts` | pre-warm (count≥2) + dispatch branch | VERIFIED | 2 imports + branch agentId === 'varixcenter' |
| `src/lib/agents/engine/v3-production-runner.ts` | agentModule branch + VAL guard parametrizado | VERIFIED | agentModule === 'varixcenter' → processMessage; CRITICAL_FIELDS_BY_AGENT['varixcenter'] = ['nombre','telefono','cedula'] |
| `supabase/migrations/20260611165220_varixcenter_template_catalog.sql` | 46 templates bajo agent_id='varixcenter', saludo D-12, idempotente | VERIFIED | 265 líneas; DELETE antes de INSERT; 46 rows; saludo custom '¡Hola! 👋 Bienvenido a VarixCenter…'; sanity DO blocks |
| `.claude/rules/agent-scope.md` | Scope varixcenter (PUEDE/NO PUEDE/Validación/Consumidores) | VERIFIED | Sección completa a partir de línea 242 con 6 grep gates, coexistencia, SQL activación |
| `CLAUDE.md` | Entrada resumida varixcenter (Regla 4) | VERIFIED | Línea 167: descripción completa incluyendo cross-project Supabase, cedula diverge de godentist, anti-cdc06d9 |
| `.planning/standalone/agent-varixcenter/12-ROUTING-RULE-USER-ACTION.md` | SQL pre-formado routing rule WA+FB+IG, rule_type='agent_router' | VERIFIED | rule_type='agent_router' (corregido de 'router' del template godentist-fb-ig); ON CONFLICT workspace_agent_config; pre-requisitos env vars documentados |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| webhook-processor.ts | varixcenter agent | `agentId === 'varixcenter'` → `import('../varixcenter')` + `V3ProductionRunner({agentModule:'varixcenter'})` | WIRED | Líneas 848-855 + pre-warm línea 261 |
| v3-production-runner.ts | varixcenter processMessage | `agentModule === 'varixcenter'` → `await import('../varixcenter')` | WIRED | Líneas 162-165 |
| varixcenter-agent.ts | getVarixAvailability | `import('@/lib/domain/varix-clinic/availability')` → llamada en mostrar_disponibilidad | WIRED | Líneas 29, 325, 392 |
| varixcenter-agent.ts | bookVarixAppointment | `import('@/lib/domain/varix-clinic/booking')` → llamada en agendar_cita | WIRED | Líneas 30, 371 |
| availability.ts | varix-clinic Supabase | `getVarixClinicClient()` → `.from('appointments').select(...)` | WIRED | Líneas 176+; fail-open si client throw |
| booking.ts | varix-clinic Supabase | `getVarixClinicClient()` → `.from('patients').select/insert`, `.from('appointments').insert` | WIRED | Líneas 103-149 |
| response-track.ts | agent_templates DB | `getTemplatesForIntents(VARIXCENTER_AGENT_ID, ...)` | WIRED | VARIXCENTER_AGENT_ID usado en calls líneas 209, 463 |
| v3-production-runner.ts | VAL tag side-effect | `agentModule !== 'varixcenter' = false` → activa tag VAL usando CRITICAL_FIELDS_BY_AGENT['varixcenter'] | WIRED | Líneas 617, 626 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| varixcenter-agent.ts mostrar_disponibilidad | `availabilitySlots` | `getVarixAvailability(fecha_preferida)` → availability.ts → `.from('appointments').select(...)` en varix-clinic Supabase | Sí — query real a appointments; grilla generada dinámicamente | FLOWING |
| varixcenter-agent.ts agendar_cita | `result` de booking | `bookVarixAppointment(...)` → booking.ts → `.from('patients').select/insert` + `.from('appointments').insert` en varix-clinic Supabase | Sí — INSERT real; IDs devueltos de DB | FLOWING |
| response-track.ts | templates renderizados | `getTemplatesForIntents('varixcenter', workspaceId, ...)` → agent_templates table | Sí — query a prod DB con 46 rows confirmados por orquestador (count=46 vía REST) | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED para checks que requieren runtime Supabase (availability, booking). Los tests unitarios con mocks del cliente cubren los comportamientos críticos (148 tests varixcenter + varix-clinic; 251 totales combinados).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tsc predice deploy verde | `npx tsc --noEmit` | exit 0 (0 errores) | PASS |
| Suite varixcenter verde | `npx vitest run src/lib/agents/varixcenter/ src/lib/domain/varix-clinic/` | 7 files, 148/148 | PASS |
| Regla 6 — godentist baseline | `npx vitest run src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/` | 9 files, 103/103 | PASS |
| Suite combinada | `npx vitest run src/lib/agents/varixcenter/ src/lib/domain/varix-clinic/ src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/` | 16 files, 251/251 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VARIX-REGISTER | Plans 02, 07, 11 | Agente registrado en catalog + webhook + runner | SATISFIED | 6 grep gates todos = 1/2 (ver tabla Key Links) |
| VARIX-BOOK | Plans 03, 05, 06, 09 | bookVarixAppointment: patient idempotente + appointment + 23P01 retry | SATISFIED | booking.ts 170 líneas; tests booking.test.ts incluyendo 23P01 mock |
| VARIX-AVAIL | Plans 03, 05, 06, 09 | getVarixAvailability: grilla 20min + merge + festivos | SATISFIED | availability.ts 214 líneas; CR-01 fix; tests 297 líneas |
| VARIX-TEMPLATES | Plans 06, 08, 10 | 46 templates prod + TEMPLATE_LOOKUP_AGENT_ID propio + anti-Pitfall 1 | SATISFIED | Migración aplicada (count=46 confirmado por orquestador); response-track anti-Pitfall 1 test |
| VARIX-CLONE | Plans 02, 04, 06, 07, 08 | Motor v3 clonado, cero cambios agentes existentes | SATISFIED | Archivos independientes; godentist/godentist-fb-ig 103/103 intacto |
| VARIX-FESTIVOS | Plans 02, 05 | Festivos colombianos + domingo TZ-safe | SATISFIED | FESTIVOS_COLOMBIA_2026 + isNonWorkingDay en constants.ts; usado en state.ts y availability.ts |
| VARIX-VAL | Plans 07, 08 | Tag VAL con CRITICAL_FIELDS cedula (no sede_preferida) | SATISFIED | runner:626 `'varixcenter': ['nombre','telefono','cedula']` |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| booking.ts | 14, 57 | Comentario "placeholder válido" para apellido='.' | Info | Intencional — patients.apellido es NOT NULL; cuando no hay apellido se graba '.' como placeholder. Comportamiento documentado, no es un stub. |

Sin otros anti-patrones de código encontrados. No hay TODO/FIXME en el código de implementación. No hay retornos de array vacío que fluyan a rendering sin fetch real.

---

### Human Verification Required

#### 1. Env vars Vercel (BLOQUEANTE para booking real)

**Test:** Agregar `VARIX_CLINIC_SUPABASE_URL` y `VARIX_CLINIC_SERVICE_ROLE_KEY` en el panel de Vercel del proyecto MorfX (Production + Preview). Los valores vienen de `varix-clinic/.env.local`.

**Expected:** Con las env vars presentes, `getVarixClinicClient()` construye un cliente válido. Sin ellas, el agente hace fail-open y escala a handoff humano en runtime.

**Why human:** Son secretos del operador. No se pueden verificar ni commitear. Requieren acción manual en Vercel Dashboard.

#### 2. Routing rule manual (activación del agente)

**Test:** Ejecutar el SQL de `12-ROUTING-RULE-USER-ACTION.md` (o usar `/agentes/routing/editor`) en el workspace Varixcenter `c6621640-ba67-43de-9f05-905f09a6dc8f`. Verificar que el dropdown ya muestra "Varixcenter Valoraciones" antes de crear la rule.

**Expected:** INSERT en routing_rules con `rule_type='agent_router'`, `priority=100`, fact `channel in ['whatsapp','facebook','instagram']`, `agent_id='varixcenter'`. INSERT en workspace_agent_config con `lifecycle_routing_enabled=true` (ON CONFLICT DO UPDATE).

**Why human:** Activación 100% manual por diseño (D-02 / Regla 6). El agente está en prod pero dormant hasta que el operador cree la rule.

#### 3. Smoke real end-to-end

**Test:** Enviar un mensaje de WhatsApp/Facebook/Instagram al workspace Varixcenter. Verificar el flujo completo: saludo D-12 → captura datos → disponibilidad slots reales → confirmación → cita creada en varix-clinic.

**Expected:** Template saludo CORE ('¡Hola! 👋 Bienvenido a VarixCenter, donde tus várices son cosa del pasado ✨') + COMP ('¿Deseas agendar tu valoración?'). Slots de 20min reales. Cita en `appointments` de varix-clinic con estado `'programada'`. Tag VAL en contacto MorfX.

**Why human:** Requiere WA/FB/IG conectado al workspace, env vars configuradas, routing rule activa, y acceso a varix-clinic DB para confirmar el INSERT.

#### 4. Verificar dropdown routing-editor

**Test:** Ir a `/agentes/routing/editor` (workspace Varixcenter) en el deploy de Vercel y confirmar que el dropdown de agentes incluye "Varixcenter Valoraciones".

**Expected:** Entrada con id='varixcenter' visible. Si no aparece, el deploy no incluyó el código del agente.

**Why human:** Requiere browser y deploy activo.

#### 5. LEARNINGS.md pendiente de escritura

**Test:** Crear `.planning/standalone/agent-varixcenter/LEARNINGS.md` documentando: patrón cross-project Supabase service_role, CR-01 parseSlotToISO solo-inicio, W-02 catch-all 'otro', rule_type='agent_router' (no 'router'), 23P01 retry por doctor, ON CONFLICT workspace_agent_config.

**Expected:** Archivo creado con los bugs y decisiones de la fase documentados.

**Why human:** Tarea de escritura de documentación pendiente según 11-SUMMARY.md §Próximos pasos item 5.

---

### Deferred Items

Items no son gaps de código — son pendientes operacionales/documentación explícitamente documentados:

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Env vars VARIX_CLINIC_SUPABASE_URL + VARIX_CLINIC_SERVICE_ROLE_KEY en Vercel | Operador (acción pre-activación) | 00-WAVE0-AUDIT.md §Env vars en Vercel; 11-SUMMARY.md §Próximos pasos item 1; 12-ROUTING-RULE-USER-ACTION.md §Pre-requisito 1 |
| 2 | Routing rule manual (activación del agente) | Operador (acción post-deploy) | D-02 locked; 12-ROUTING-RULE-USER-ACTION.md completo; Regla 6 sin feature flag |
| 3 | Smoke real end-to-end con cita real en varix-clinic | Operador (post env vars + rule) | 11-SUMMARY.md §Próximos pasos item 4 |
| 4 | LEARNINGS.md | Operador/Claude (documentación pendiente) | 11-SUMMARY.md §Próximos pasos item 5 |

---

### Gaps Summary

Sin gaps de código. Todos los must-haves del código están implementados, conectados y verificados (18/18). Los 5 ítems de verificación humana son pendientes operacionales y de documentación, no defectos del código:

- El código está completo, testeado (251/251), con tsc=0 y pusheado a Vercel.
- La migración de templates fue aplicada en prod (46 rows, confirmado por el orquestador vía REST).
- Los 6 grep gates pasan todos.
- Regla 3 verificada (0 createClient directo en agent files).
- Regla 6 verificada (godentist + godentist-fb-ig 103/103 intactos).
- CR-01, W-01, W-02, W-03 del code review aplicados y commitados.
- La activación final (env vars + routing rule) es intencional por diseño (D-02 / Regla 6).

---

_Verified: 2026-06-11T19:00:00-05:00_
_Verifier: Claude (gsd-verifier)_
