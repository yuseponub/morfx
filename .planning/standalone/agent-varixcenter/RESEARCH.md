# Phase agent-varixcenter — Research

**Researched:** 2026-06-11
**Domain:** Agente conversacional clonado del motor Somnio v3 (patrón GoDentist) + integración cross-project con Supabase de varix-clinic para agendamiento real.
**Confidence:** HIGH (patrón de clone) / HIGH (schema varix-clinic, leído de migraciones reales) / MEDIUM (decisión de integración — depende de credenciales que el operador debe proveer)

## Summary

Este standalone crea un agente nuevo `varixcenter` clonando el motor v3 que ya usan `godentist` y `godentist-fb-ig`. **NO es un sibling** (el sibling FB/IG comparte negocio con su agente padre); es un agente NUEVO para un negocio distinto, pero las mecánicas de registro, dispatch, routing y catálogo de templates son **idénticas** al pattern documentado en `LEARNINGS.md` de `agent-godentist-fb-ig` — que es la receta canónica a seguir. `[VERIFIED: .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md]`

La gran diferencia técnica vs todos los clones previos: **`agendar_cita` debe ESCRIBIR en una base de datos externa (varix-clinic)**. GoDentist NUNCA escribe — su `agendar_cita` solo emite un template `cita_agendada` y el equipo agenda a mano en Dentos; el robot Railway es read-only para disponibilidad. `[VERIFIED: grep en src/lib/agents/godentist/ — no hay write-back; godentist-agent.ts:432 solo retorna template]`. Por eso varixcenter introduce código de write genuinamente nuevo: crear `patient` + crear `appointment` en el Postgres de varix-clinic, con manejo del constraint anti-solapamiento (código `23P01`).

**Recomendación primaria:** Clonar el motor v3 siguiendo la receta de 7 waves de `LEARNINGS.md` (verbatim clone + 6 sitios de registro + Regla 5 SQL apply). Para la integración varix-clinic, usar **query directa al Supabase de varix-clinic con un segundo cliente `service_role`** encapsulado en un domain module nuevo de MorfX (`src/lib/domain/varix-clinic/`), con credenciales en variables de entorno dedicadas (`VARIX_CLINIC_SUPABASE_URL` / `VARIX_CLINIC_SERVICE_ROLE_KEY`). Justificación detallada en §Decisión.

## User Constraints (from DISENO-COMPLETO.md — D-01..D-15 LOCKED)

> No hay CONTEXT.md formal; el diseño locked está en `DISENO-COMPLETO.md`. Estas decisiones son vinculantes — el planner NO debe explorar alternativas a ellas.

### Decisiones bloqueadas
- **D-01:** Motor v3 clonado, agente nuevo `varixcenter`, cero cambios a agentes existentes (Regla 6).
- **D-02:** Multi-canal día 1: WA + FB + IG vía routing rules con fact `channel` (UN solo agente, NO siblings).
- **D-03:** Agendamiento Opción A: slots reales contra varix-clinic. Slot = **20 min**. Agendas de AMBOS doctores fusionadas (cliente no elige doctor).
- **D-04:** El bot CREA el `patient` (nombre + cédula + teléfono) + appointment tipo valoración estado `programada`.
- **D-05:** Datos críticos: `nombre` + `telefono` + `cedula`. Triage: `ciudad` + `tipo_venas`.
- **D-06:** Precios: valoración $100.000, escleroterapia $95.000/sesión. ECOR/cirugía: "se determina en la valoración" (NO dar rango).
- **D-09:** Bot 24/7. Festivos/domingo: conversa pero solo ofrece slots en horarios hábiles.
- **D-10:** Tag `VAL` al completar datos críticos (side-effect en runner, igual GoDentist).
- **D-12:** Saludo doble triage. 5 opciones en PLANTILLAS.md — **cliente escoge 1 (pendiente)**.

### A discreción de Claude (research/plan)
- Mecanismo exacto de integración varix-clinic (§8 del diseño) — **esta investigación lo resuelve abajo**.
- Esquema de retomas L1–L6 (D1 cuestionario: "creamos unas parecidas a GoDentist").
- Grilla exacta de generación de slots dentro de los horarios.

### Fuera de scope (deferido)
- Recordatorio 1 día antes (D-08 — sigue manual con el equipo).
- Reagendar/cancelar por el bot (D-07 — handoff a humano).
- Respuestas a outbound de reactivación (futuro standalone).
- Versión del bot que da rango de precio ECOR.

## Phase Requirements

> No se proveyeron IDs de requisito formales. Los requisitos derivan de D-01..D-15 + contrato funcional §8. El planner debe mapear cada wave a estas decisiones.

| Req derivado | Descripción | Soporte en research |
|--------------|-------------|---------------------|
| VARIX-CLONE | Clonar motor v3 (types, schema, transitions, state, guards, phase, constants, comprehension, sales-track, response-track, agent) | §Architecture Patterns — receta 7 waves |
| VARIX-REGISTER | Registrar agent_id en 6 sitios | §Architecture Patterns — checklist de 6 sitios |
| VARIX-AVAIL | `getAvailability(fecha)` contra varix-clinic | §Decisión + §Code Examples |
| VARIX-BOOK | `bookAppointment()` crea patient + appointment | §Decisión + §Code Examples |
| VARIX-TEMPLATES | ~44 templates bajo `agent_id='varixcenter'` vía migración SQL | §Common Pitfalls (Pitfall 1) + Regla 5 |
| VARIX-VAL | Tag VAL en datosCriticos | §Code Examples — runner side-effect |
| VARIX-FESTIVOS | Excluir domingos + festivos Colombia de los slots | §Don't Hand-Roll — reusar `isNonWorkingDay` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Comprensión NLU (intents, slots) | Agente MorfX (Haiku) | — | clonado de godentist comprehension.ts |
| State machine / transiciones | Agente MorfX | — | clonado de transitions.ts (pura, sin IO) |
| Selección de templates | Response-track MorfX | DB `agent_templates` | TemplateManager lee por `agent_id` |
| Disponibilidad (slots) | Domain module MorfX nuevo | Supabase varix-clinic (read) | MorfX genera grilla + consulta appointments existentes |
| Crear patient + appointment | Domain module MorfX nuevo | Supabase varix-clinic (write, service_role) | escritura real cross-project |
| Tag VAL + contacto CRM | v3-production-runner (side-effect) | Domain MorfX (`assignTag`) | mismo patrón godentist:597 |
| Routing por canal | agent-lifecycle-router (fact `channel`) | tabla `routing_rules` | shipped 2026-05-04 |
| Festivos Colombia | Helper puro MorfX | — | reusar `FESTIVOS_COLOMBIA_2026` de godentist/constants.ts |

## Standard Stack

### Core (todo ya existe en el codebase — clonar, no instalar)
| Módulo | Ubicación | Propósito | Por qué estándar |
|--------|-----------|-----------|------------------|
| Motor V3ProductionRunner | `src/lib/agents/engine/v3-production-runner.ts` | Orquesta comprehension→state→response, side-effect VAL | Lo usan godentist + godentist-fb-ig `[VERIFIED]` |
| agentRegistry | `src/lib/agents/registry.ts` | Registro self-register on import | Todos los agentes se registran ahí `[VERIFIED]` |
| AGENT_CATALOG | `src/lib/agents/agent-catalog.ts` | Dropdown del routing-editor | godentist + godentist-fb-ig listados `[VERIFIED]` |
| TemplateManager | (consumido en response-track) | Carga templates por `agent_id` | TEMPLATE_LOOKUP_AGENT_ID pattern `[VERIFIED]` |
| Comprehension Haiku | `CLAUDE_MODELS.HAIKU` (config.ts) | NLU structured output | godentist-fb-ig/config.ts `[VERIFIED]` |
| Fact `channel` router | agent-lifecycle-router (`facts.ts`) | Routing WA/FB/IG por canal | shipped 2026-05-04 `[CITED: MEMORY routing_channel_fact]` |
| `isNonWorkingDay` + `FESTIVOS_COLOMBIA_2026` | `src/lib/agents/godentist/constants.ts:215-244` | Festivos + domingos | ya cubre festivos 2026 `[VERIFIED]` |
| `getPlatformConfig` | `src/lib/domain/platform-config.ts` | Lectura config plataforma con cache TTL 30s + fail-open | precedente para feature flags `[VERIFIED]` |
| `@supabase/supabase-js` `createClient` | `src/lib/supabase/admin.ts` | Cliente Supabase (service_role) | base para el 2º cliente varix-clinic `[VERIFIED]` |

### Supporting (para varix-clinic integration)
| Módulo | Propósito | Cuándo usar |
|--------|-----------|-------------|
| Segundo `SupabaseClient` (URL+key propias) | Conexión al Postgres de varix-clinic | En el domain module `src/lib/domain/varix-clinic/client.ts` (nuevo) |
| `date-fns` 4.1.0 | Manipulación de fechas/slots | Ya en package.json — generar grilla de 20 min |

### Alternativas Consideradas
| En vez de | Se podría usar | Tradeoff |
|-----------|----------------|----------|
| Query directa Supabase varix-clinic (RECOMENDADO) | API route en varix-clinic consumida por HTTP | Ver §Decisión — HTTP agrega deploy coupling + latencia + un punto de fallo más |
| Env vars dedicadas para credenciales | `platform_config` (como Shopify D-15) | Ver §Decisión — env vars es más simple para credenciales de un solo tenant; platform_config si se quiere flip sin redeploy |

**Instalación:** Ninguna. Todo el stack ya existe. El único "install" es agregar 2 env vars en Vercel.

**Version verification:** No aplica — no se agregan dependencias npm. `date-fns@^4.1.0` ya presente `[VERIFIED: package.json]`.

## Decisión: Integración varix-clinic

**RECOMENDACIÓN FIRME: Query directa al Supabase de varix-clinic con un segundo cliente `service_role`, encapsulado en un domain module nuevo `src/lib/domain/varix-clinic/`.**

### Por qué query directa (no API route HTTP)

| Criterio | Query directa (✅ recomendado) | API route HTTP en varix-clinic |
|----------|-------------------------------|--------------------------------|
| Latencia | 1 round-trip a Postgres (~50-150ms) | 2 round-trips: HTTP a varix-clinic + su query a Postgres |
| Puntos de fallo | Solo Postgres | Postgres + deploy de varix-clinic + red entre Vercels |
| Deploy coupling | Cero — varix-clinic no cambia | Hay que crear+deployar+versionar endpoints en varix-clinic |
| Secretos | 2 env vars en MorfX | Auth compartida nueva (token/HMAC) que mantener en ambos lados |
| Control | Lo controlamos nosotros (mismo dueño) | Igual, pero con más superficie |
| Esfuerzo | 1 domain module en MorfX | Cambios en DOS repos |

Como **controlamos ambos proyectos** y son del mismo dueño, la query directa con `service_role` es el camino más simple y robusto. El precedente de robot HTTP (GoDentist→Dentos) existe SOLO porque Dentos es software de terceros sin acceso a DB — no es el caso aquí. `[VERIFIED: dentos-availability.ts usa HTTP porque Dentos es externo]`

### Cómo encaja con Regla 3 (domain layer)

Regla 3 dice: toda mutación pasa por `src/lib/domain/`. La integración varix-clinic se modela como un **domain module nuevo** `src/lib/domain/varix-clinic/` que:
- Es el ÚNICO lugar que instancia el cliente Supabase de varix-clinic (igual que `platform-config.ts` es el único que toca `platform_config`).
- Expone `getVarixAvailability(fecha)` y `bookVarixAppointment(...)`.
- El agente `varixcenter` y el runner importan EXCLUSIVAMENTE desde este domain module — cero `createClient` directo en `src/lib/agents/varixcenter/**` (verificable via grep, mismo gate que los otros agentes).
- **Desviación documentada del patrón domain:** NO filtra por `workspace_id` de MorfX (la DB de varix-clinic no tiene tenancy multi-workspace — es mono-cliente), igual que `platform-config.ts` documenta su desviación. `[VERIFIED: platform-config.ts líneas 8-21]`

### Manejo de secretos

Credenciales de varix-clinic en env vars dedicadas en Vercel:
```
VARIX_CLINIC_SUPABASE_URL=https://<proyecto-varix>.supabase.co
VARIX_CLINIC_SERVICE_ROLE_KEY=eyJhbGci...   # service_role — bypasea RLS
```
`[VERIFIED: varix-clinic/.env.local tiene NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY]`

Se necesita `service_role` porque **toda la RLS de varix-clinic exige un usuario `authenticated` con rol staff** (`EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN (...))`). `[VERIFIED: 006_patients_table.sql líneas 64-83, 007_appointments.sql líneas 109-161]`. El bot no tiene sesión de usuario → debe usar service_role para INSERT en `patients` + `appointments`.

**`[ASSUMED]` — verificar con operador:** que el proyecto Supabase de varix-clinic permite conexiones desde Vercel de MorfX (mismo Supabase cloud, sin allowlist de IP). Riesgo bajo (Supabase es público por defecto), pero confirmar.

### Contrato exacto (firmas + tablas + constraint)

Schema real verificado en migraciones de varix-clinic:

**Tabla `patients`** `[VERIFIED: 006 + 037 + 039 + 041]`:
- `id UUID PK`, `cedula VARCHAR(10)` (nullable desde 041, UNIQUE parcial WHERE cedula IS NOT NULL), `nombre VARCHAR(100) NOT NULL`, `apellido VARCHAR(100) NOT NULL`, `celular VARCHAR(10)` (nullable desde 041), `ciudad VARCHAR(100)` (desde 039), contactos de emergencia (nullable desde 037), `created_by UUID REFERENCES auth.users(id)`.
- ⚠️ `nombre` Y `apellido` son NOT NULL → el bot captura "nombre completo"; hay que **partir nombre/apellido** (heurística: primer token = nombre, resto = apellido; o poner todo en `nombre` y `apellido='.'`). Decisión de plan.
- ⚠️ `celular VARCHAR(10)` → guardar 10 dígitos colombianos (NO el formato `573XXXXXXXXX` de 12). Normalizar.
- Trigger `prevent_cedula_update`: la cédula es inmutable una vez asignada → si el patient ya existe por cédula, NO intentar update de cédula.

**Tabla `appointments`** `[VERIFIED: 007 + 052]`:
- `id UUID PK`, `patient_id UUID NOT NULL`, `doctor_id UUID NULL` (nullable desde 052, FK a `auth.users`), `fecha_hora_inicio TIMESTAMPTZ NOT NULL`, `fecha_hora_fin TIMESTAMPTZ NOT NULL`, `estado appointment_status DEFAULT 'programada'`, `motivo_consulta TEXT`, `notas TEXT`, `created_by UUID`.
- Enum `appointment_status`: `programada | confirmada | en_sala | en_atencion | completada | cancelada | no_asistio`.
- **Constraint anti-solapamiento** `no_overlapping_appointments`: `EXCLUDE USING gist (doctor_id WITH =, tstzrange(inicio, fin, '[)') WITH &&) WHERE (estado NOT IN ('cancelada','no_asistio'))`. **NULL doctor_id NUNCA colisiona** (GiST `=` no matchea NULL). `[VERIFIED: 007 líneas 64-69 + 052]`.

**Vista `doctors_view`** `[VERIFIED: 007 líneas 212-227]`: `SELECT user_id AS id, email, nombre, apellido FROM user_roles JOIN auth.users WHERE role='medico'`. Aquí están Dr. Ciro + Dra. Carolina.

**Firmas propuestas (domain module nuevo):**
```typescript
// src/lib/domain/varix-clinic/availability.ts
export async function getVarixAvailability(fecha: string): Promise<{
  manana: string[]   // ["8:00 AM - 8:20 AM", ...] slots de 20 min libres
  tarde: string[]
}>
// Genera grilla 20-min dentro de horarios hábiles, consulta appointments
// existentes (estado activo) de AMBOS doctores, marca un slot LIBRE si
// AL MENOS UNO de los 2 doctores no tiene cita solapada en ese rango.

// src/lib/domain/varix-clinic/booking.ts
export async function bookVarixAppointment(params: {
  nombre: string; cedula: string; telefono: string
  fechaHoraInicio: string  // ISO con offset -05:00
  fechaHoraFin: string
}): Promise<
  | { ok: true; appointmentId: string; patientId: string }
  | { ok: false; reason: 'slot_taken' | 'error'; detail?: string }
>
// 1. SELECT patient por cedula → si no existe, INSERT.
// 2. Elegir doctor con slot libre (balanceo si ambos libres).
// 3. INSERT appointment (estado='programada', motivo='Valoración (bot WhatsApp)').
// 4. Si INSERT retorna code '23P01' → { ok:false, reason:'slot_taken' }.
```

### Manejo del conflicto de slot concurrente (constraint 23P01)

Patrón verificado en `varix-clinic/src/app/(protected)/citas/actions.ts:88` — el INSERT puede devolver `error.code === '23P01'` (exclusion_violation). `[VERIFIED]`. Estrategia:
1. `bookVarixAppointment` intenta INSERT con doctor A.
2. Si `23P01` con doctor A → reintentar con doctor B (el otro doctor).
3. Si ambos doctores dan `23P01` → retornar `{ ok:false, reason:'slot_taken' }`.
4. El agente, al recibir `slot_taken`, re-ejecuta `getVarixAvailability(fecha)` y emite el template `sin_disponibilidad` / re-muestra slots frescos (mismo patrón fail-open que godentist `availabilityFallback`). `[VERIFIED: godentist-agent.ts:343]`

### `created_by` para appointments creadas por el bot

`appointments.created_by` y `patients.created_by` son FK a `auth.users(id)`. El bot no es un usuario. Opciones (decisión de plan, **`[ASSUMED]`** pendiente confirmar con operador):
- (a) Dejar `created_by = NULL` (es nullable — no tiene constraint NOT NULL en 006/007). ✅ más simple.
- (b) Crear un usuario `bot@varixcenter` con rol staff en varix-clinic y usar su UUID. Mejor para auditoría (la tabla tiene audit logging via `enable_audit_for_table`).
- Recomendación: (a) para V1; si auditoría lo exige, (b) en follow-up.

## Architecture Patterns

### System Architecture Diagram

```
WhatsApp/FB/IG inbound
   │
   ▼
webhook-processor.ts ──(routing-lifecycle-router resuelve agent_id por fact channel)──► agent_id='varixcenter'
   │  (pre-warm import('../varixcenter') línea ~253 + dispatch branch línea ~820)
   ▼
V3ProductionRunner({ agentModule:'varixcenter' })  ◄── side-effect: tag VAL en datosCriticos (runner:602)
   │   import('../varixcenter') → processMessage()
   ▼
varixcenter-agent.ts
   ├─► comprehension.ts (Haiku) ──► intent + slots (nombre/cedula/telefono/ciudad/tipo_venas/fecha)
   ├─► state.ts (merge slots; rechaza domingo/festivo vía isNonWorkingDay → fecha_vaga)
   ├─► sales-track.ts (transitions.ts) ──► accion (pedir_datos / mostrar_disponibilidad / agendar_cita / handoff)
   │
   ├─ si accion=='mostrar_disponibilidad':
   │     └─► domain/varix-clinic/availability.getVarixAvailability(fecha)
   │            └─► [Supabase varix-clinic READ] appointments activas de 2 doctores ► slots libres 20min
   │
   ├─ si accion=='agendar_cita':
   │     └─► domain/varix-clinic/booking.bookVarixAppointment({nombre,cedula,telefono,slot})
   │            └─► [Supabase varix-clinic WRITE service_role] upsert patient + insert appointment
   │                   └─ 23P01? ► retry otro doctor ► slot_taken ► re-availability
   │
   └─► response-track.ts (TEMPLATE_LOOKUP_AGENT_ID='varixcenter') ──► templates desde agent_templates
          └─► output: hasta 3 mensajes/turno
```

### Recommended Project Structure (clonar de godentist-fb-ig)
```
src/lib/agents/varixcenter/
├── index.ts                  # self-register agentRegistry.register(varixcenterConfig)
├── config.ts                 # VARIXCENTER_AGENT_ID = 'varixcenter'; AgentConfig
├── types.ts                  # clonar verbatim
├── comprehension-schema.ts   # adaptar: tipo_venas enum, sin sede (1 sola)
├── comprehension-prompt.ts   # adaptar: ejemplos varices/vasitos/cedula
├── comprehension.ts          # clonar + rename log prefix
├── guards.ts                 # adaptar gates (triageCompleto, datosCriticos)
├── phase.ts                  # clonar (mapeo accion→fase)
├── constants.ts              # adaptar intents (24) + reusar FESTIVOS de godentist
├── state.ts                  # clonar (merge + rechazo domingo/festivo)
├── transitions.ts            # adaptar tabla §7 del diseño
├── sales-track.ts            # clonar
├── response-track.ts         # CRÍTICO: TEMPLATE_LOOKUP_AGENT_ID='varixcenter'
├── varixcenter-agent.ts      # processMessage con agent:'varixcenter' + llamadas a domain/varix-clinic
└── __tests__/                # 6+ suites (transitions/comprehension/response/sales/availability/agent)

src/lib/domain/varix-clinic/   # NUEVO (no es agente)
├── client.ts                 # único createClient del Supabase de varix-clinic
├── availability.ts           # getVarixAvailability + generación grilla 20min
└── booking.ts                # bookVarixAppointment (upsert patient + insert appointment)
```

### Pattern 1: Receta de 7 waves (de LEARNINGS godentist-fb-ig)
**Qué:** El clone canónico se hace en waves Wave 0 (audit) → Wave 1 (verbatim+adapted) → Wave 2 (helpers) → Wave 3 (6 sitios de registro) → Wave 4 (tests) → Wave 5 (SQL apply Regla 5 BLOCKING) → Wave 6 (docs) → Wave 7 (verify+LEARNINGS).
**Cuándo:** Cualquier agente clon del motor v3.
**Ejemplo:** `[CITED: .planning/standalone/agent-godentist-fb-ig/LEARNINGS.md líneas 49-134]`

### Pattern 2: Los 6 sitios de registro (sin uno, el agente NO funciona end-to-end)
```bash
# 1. AgentRegistry (self-register on import)
grep -c "agentRegistry.register" src/lib/agents/varixcenter/index.ts                  # = 1
# 2. AGENT_CATALOG (dropdown routing-editor)
grep -c "id: 'varixcenter'" src/lib/agents/agent-catalog.ts                            # = 1
# 3. webhook-processor pre-warm (anti-B-001 cold-lambda race) — línea ~253 Promise.all
grep -c "import('../varixcenter')" src/lib/agents/production/webhook-processor.ts      # >= 2
# 4. webhook-processor dispatch branch — línea ~820 (paralelo a godentist-fb-ig)
#    else if (agentId === 'varixcenter') { new V3ProductionRunner(adapters,{workspaceId,agentModule:'varixcenter'}) }
# 5. v3-production-runner agentModule branch — línea ~157 (import processMessage)
grep -c "agentModule === 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts  # >= 1
# 6. v3-production-runner VAL side-effect guard — línea ~605 (extender compound check)
grep -cE "agentModule.*!== 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts  # >= 1
```
`[VERIFIED: webhook-processor.ts:253,820 + v3-production-runner.ts:157,605]`

### Anti-Patterns to Avoid
- **Catálogo de templates compartido** entre agentes (regresión `cdc06d9`): NUNCA. `TEMPLATE_LOOKUP_AGENT_ID` literal `'varixcenter'` en response-track + test anti-regresión `expect(callArgs[0]).not.toBe('godentist')`. `[CITED: LEARNINGS Pitfall 1]`
- **`createClient` directo dentro de `src/lib/agents/varixcenter/**`**: prohibido (Regla 3). Todo va por `src/lib/domain/varix-clinic/`.
- **Generar slots sin excluir festivos/domingos** (D-09): reusar `isNonWorkingDay`.
- **Asumir que GoDentist escribe la cita**: NO lo hace. El write-path es código nuevo.

## Don't Hand-Roll

| Problema | No construir | Usar | Por qué |
|----------|--------------|------|---------|
| Festivos Colombia 2026 | Lista nueva de festivos | `FESTIVOS_COLOMBIA_2026` + `isNonWorkingDay()` de `godentist/constants.ts:215-244` | Ya cubre Ley 51/1983 + trasladados a lunes; verificado en prod godentist `[VERIFIED]` |
| Detección de domingo/sábado timezone-safe | `new Date().getDay()` (drift por TZ runtime) | `new Date(Date.UTC(y,m-1,d)).getUTCDay()` (patrón godentist) | Regla 2 — evita corrimiento por TZ del lambda `[VERIFIED: dentos-availability.ts:86]` |
| Motor de comprehension/state/transitions | Lógica NLU nueva | Clonar godentist v3 verbatim | Probado en prod, 93 tests en el sibling `[VERIFIED]` |
| Registro de agente | Wiring manual ad-hoc | Los 6 sitios documentados | Falta uno = agente roto silenciosamente `[CITED: LEARNINGS]` |
| Manejo de constraint solapamiento | Lock optimista propio | Capturar `error.code==='23P01'` del INSERT | El constraint Postgres ya garantiza atomicidad `[VERIFIED: citas/actions.ts:88]` |
| Idempotencia de patient | Crear siempre patient nuevo | SELECT por cédula → INSERT solo si no existe | UNIQUE parcial en cédula `[VERIFIED: 041]` |
| Routing por canal | Branch por canal en el agente | Fact `channel` en routing rules (D-02) | shipped 2026-05-04 `[CITED]` |
| Tag VAL | Tag en el agente | side-effect en runner:605 (extender guard) | mantiene el agente puro `[VERIFIED]` |

**Key insight:** Casi todo ya existe en MorfX (motor, festivos, registro, tag VAL). El ÚNICO código genuinamente nuevo es el domain module `varix-clinic/` (availability + booking) — ahí está el 80% del riesgo. La generación de la grilla de 20 min + el merge de 2 agendas no tiene precedente directo (godentist recibe slots ya formateados del robot scraper, no los genera).

## Common Pitfalls

### Pitfall 1: Catálogo de templates compartido (regresión cdc06d9)
**Qué sale mal:** `TEMPLATE_LOOKUP_AGENT_ID` queda apuntando a `'godentist'` por copy-paste → varixcenter responde con templates de GoDentist.
**Por qué pasa:** Clone descuidado de response-track.ts.
**Cómo evitar:** Literal `'varixcenter'` + test obligatorio `expect(callArgs[0]).not.toBe('godentist')` en response-track.test.ts. Grep gate = 0 matches de `'godentist'` en `src/lib/agents/varixcenter/`.
**Señales:** El bot responde con wording de odontología/sedes en una conversación de várices.
`[CITED: LEARNINGS Pitfall 1 — fue regresión real revertida en somnio-recompra]`

### Pitfall 2: Cold-lambda race (B-001)
**Qué sale mal:** El dispatch branch hace `await import('../varixcenter')` pero el lambda frío no lo tiene pre-warmed → race con el primer mensaje.
**Cómo evitar:** Pre-warm en `Promise.all([... import('../varixcenter')])` línea ~253 de webhook-processor. Grep gate ≥ 2 matches.
`[CITED: LEARNINGS Pitfall 2 + VERIFIED webhook-processor.ts:253]`

### Pitfall 3: Routing priority collision
**Qué sale mal:** Operador crea routing rule con priority ya ocupado → UNIQUE INDEX `uq_routing_rules_priority WHERE active=true` rechaza.
**Cómo evitar:** Wave 0 audit `SELECT priority FROM routing_rules WHERE workspace_id='c6621640-...' AND active=true`. Proveer SQL pre-formado con priority libre en `agent-scope.md`.
`[CITED: LEARNINGS Pitfall 4]`

### Pitfall 4: VAL tag side-effect omitido
**Qué sale mal:** El guard en runner:605 (`agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'`) hace `return` early para varixcenter → leads no reciben tag VAL → no cuentan en métricas.
**Cómo evitar:** Extender el compound check a incluir `&& agentModule !== 'varixcenter'`. Grep gate = 1 match.
`[CITED: LEARNINGS Pitfall 6 + VERIFIED v3-production-runner.ts:605]`

### Pitfall 5: nombre/apellido y celular en patients
**Qué sale mal:** El bot captura "nombre completo" + teléfono `573XXXXXXXXX` (12 dígitos), pero `patients` exige `nombre` Y `apellido` NOT NULL y `celular VARCHAR(10)`.
**Cómo evitar:** Partir nombre/apellido (heurística) + normalizar celular a 10 dígitos antes del INSERT.
`[VERIFIED: 006_patients_table.sql + 041]`

### Pitfall 6: Timezone en fecha_hora (Regla 2)
**Qué sale mal:** Generar `fecha_hora_inicio` sin offset → se interpreta en UTC → la cita aparece 5h corrida en el calendario de varix-clinic.
**Cómo evitar:** Construir TIMESTAMPTZ con offset explícito `-05:00` (America/Bogota). El slot "8:00 AM del 2026-06-15" → `2026-06-15T08:00:00-05:00`.
`[VERIFIED: CLAUDE.md Regla 2 + appointments es TIMESTAMPTZ]`

### Pitfall 7: Regla 5 — migración de templates antes del push
**Qué sale mal:** Se pushea el código de varixcenter antes de insertar los ~44 templates en `agent_templates` → el agente registrado retorna `templates_not_found_in_catalog` → degradación silenciosa que confunde el debug.
**Cómo evitar:** Wave 5 BLOCKING — aplicar `supabase/migrations/<ts>_varixcenter_template_catalog.sql` en prod ANTES del push. Verificar row count post-apply.
`[CITED: LEARNINGS Wave 5 + CLAUDE.md Regla 5]`

### Pitfall 8: Conexión cross-project Supabase falla en runtime
**Qué sale mal:** Las env vars `VARIX_CLINIC_*` no están en Vercel → `getVarixAvailability` throw en producción → el bot no muestra slots.
**Cómo evitar:** Fail-open en el domain module (igual godentist `availabilityFallback`): si la conexión falla, el agente cae a un template `sin_disponibilidad` + handoff, NO crashea. Validar env vars presentes en Wave 0.

## Code Examples

### Segundo cliente Supabase (varix-clinic) — domain module
```typescript
// src/lib/domain/varix-clinic/client.ts  (NUEVO — único lugar que instancia)
// Patrón: igual createAdminClient pero con URL/key de varix-clinic.
// Source: src/lib/supabase/admin.ts (readEnv pattern) [VERIFIED]
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

### Booking con manejo de 23P01 (slot concurrente)
```typescript
// src/lib/domain/varix-clinic/booking.ts (NUEVO)
// Source schema: varix-clinic/supabase/migrations/006,007,041,052 [VERIFIED]
// Source error-handling: varix-clinic/src/app/(protected)/citas/actions.ts:88 [VERIFIED]
const sb = getVarixClinicClient()

// 1. patient idempotente por cédula
const { data: existing } = await sb.from('patients').select('id').eq('cedula', cedula).maybeSingle()
let patientId = existing?.id
if (!patientId) {
  const { data, error } = await sb.from('patients').insert({
    cedula, nombre, apellido, celular,  // celular 10 dígitos; apellido NOT NULL
  }).select('id').single()
  if (error?.code === '23505') { /* carrera: re-SELECT por cédula */ }
  patientId = data!.id
}

// 2. intentar con cada doctor hasta que uno acepte
for (const doctorId of [DOCTOR_CIRO_UUID, DOCTOR_CAROLINA_UUID]) {
  const { data, error } = await sb.from('appointments').insert({
    patient_id: patientId, doctor_id: doctorId,
    fecha_hora_inicio: fechaHoraInicio,  // ISO con -05:00 (Regla 2)
    fecha_hora_fin: fechaHoraFin,
    estado: 'programada',
    motivo_consulta: 'Valoración (agendada por bot WhatsApp)',
  }).select('id').single()
  if (!error) return { ok: true, appointmentId: data.id, patientId }
  if (error.code !== '23P01') return { ok: false, reason: 'error', detail: error.message }
  // 23P01 → ese doctor está ocupado en ese rango, probar el siguiente
}
return { ok: false, reason: 'slot_taken' }
```

### Festivos — reusar helper godentist
```typescript
// En state.ts del agente, igual godentist/state.ts:105-112 [VERIFIED]
import { isNonWorkingDay } from '@/lib/agents/godentist/constants'
// o clonar el Set a varixcenter/constants.ts para no acoplar agentes
const nonWorking = isNonWorkingDay(fields.fecha_preferida) // 'domingo'|'festivo'|null
if (nonWorking) { /* guardar fecha_vaga, pedir otra fecha */ }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GoDentist: robot Railway scraping (read-only) + agenda manual | varix-clinic: query directa Supabase + write real | este standalone | Primer agente MorfX que ESCRIBE en DB externa |
| Siblings por canal (godentist-fb / godentist-ig separados) | UN agente multi-canal vía fact `channel` (D-02) | 2026-05-04 fact channel | Menos código, una sola routing rule con `channel in [whatsapp,facebook,instagram]` |
| Templates compartidos (cdc06d9) | Catálogo independiente por agent_id | revertido 2026-04-23 | Pitfall 1 obligatorio |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Supabase de varix-clinic acepta conexiones desde Vercel de MorfX sin allowlist IP | §Decisión/Secretos | ALTO — booking falla en prod; mitigado por fail-open |
| A2 | `created_by = NULL` es aceptable para citas/patients creados por el bot | §Decisión/created_by | BAJO — es nullable; auditoría menos rica |
| A3 | Solo hay 2 doctores con rol `medico` (Ciro + Carolina); sus UUIDs se obtienen de `doctors_view` | §booking | MEDIO — si hay más médicos, el balanceo cambia; obtener UUIDs en Wave 0 |
| A4 | Horarios L-V 8:00-11:30 + 14:30-15:30, sáb 8-12 son la grilla correcta para slots | §availability | MEDIO — confirmado en cuestionario A3="Sí correctos" pero validar con clínica |
| A5 | No existe servicio/tabla que ligue appointment↔service obligatoriamente para valoración | §booking | BAJO — 013_appointment_services existe pero la cita base no lo exige (motivo_consulta texto basta) |
| A6 | El workspace MorfX de Varixcenter es `c6621640-ba67-43de-9f05-905f09a6dc8f` | §User Constraints | BAJO — citado en diseño + ANALISIS |

## Open Questions (RESOLVED)

1. **UUIDs de los 2 doctores en varix-clinic**
   - Qué sabemos: están en `doctors_view` (rol `medico`).
   - Qué falta: los UUIDs concretos (Ciro, Carolina) para el balanceo en booking.ts.
   - **RESOLVED:** se obtienen en Wave 0 (Plan 01 Task 2) vía `SELECT id, nombre, apellido FROM doctors_view` contra el Supabase de varix-clinic, y se hardcodean en `src/lib/domain/varix-clinic/constants.ts` (Plan 03 Task 2).

2. **¿La cita necesita un service_id (013_appointment_services) o basta motivo_consulta?**
   - Qué sabemos: `appointments` no tiene FK a service obligatoria; existe tabla puente `appointment_services`.
   - **RESOLVED:** V1 usa solo `motivo_consulta='Valoración'`, sin link a `appointment_services`. Si el reporte de varix-clinic lo requiere, se agrega en follow-up.

3. **Cliente debe escoger 1 de 5 saludos (D-12)**
   - **RESOLVED:** se pide al cliente en Plan 01 Task 2 como blocking gate antes de Wave 5 (la migración de templates no avanza sin el saludo escogido).

4. **Reglas de generación de grilla en el quiebre 11:30→14:30**
   - 8:00-11:30 da 10 slots de 20min + el último parcial (11:30 es el fin); 14:30-15:30 da 3 slots.
   - **RESOLVED:** solo se ofrecen slots que caben COMPLETOS antes del cierre del bloque (Plan 05 Task 1): mañana weekday 8:00, 8:20, …, 11:10 (último válido); tarde 14:30, 14:50, 15:10; sábado 8:00, …, 11:40.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Motor v3 (godentist) | Clone base | ✓ | en repo | — |
| Fact `channel` router | D-02 multi-canal | ✓ | shipped 2026-05-04 | — |
| `FESTIVOS_COLOMBIA_2026` | D-09 | ✓ | godentist/constants.ts | — |
| `date-fns` | grilla slots | ✓ | 4.1.0 | — |
| `@supabase/supabase-js` | 2º cliente | ✓ | en repo | — |
| Supabase varix-clinic (prod) | availability + booking | ✓ (cuestionario B1/A8) | prod | fail-open → handoff |
| `VARIX_CLINIC_SUPABASE_URL` env | client.ts | ✗ (hay que agregar a Vercel) | — | sin esto, throw → fail-open |
| `VARIX_CLINIC_SERVICE_ROLE_KEY` env | client.ts | ✗ (hay que agregar a Vercel) | — | idem |
| UUIDs doctores varix-clinic | booking balanceo | ✗ (Wave 0 query) | — | — |

**Missing dependencies con fallback:**
- Env vars `VARIX_CLINIC_*`: el operador debe agregarlas en Vercel antes del push (Wave 5/6). El domain module hace fail-open si faltan (no crashea el bot, cae a handoff).

**Missing dependencies blocking:**
- UUIDs de los 2 doctores: obtener en Wave 0 vía SELECT a `doctors_view`. Sin esto el booking no puede asignar doctor (aunque NULL doctor_id es técnicamente válido — ver A2/A3).

## Validation Architecture

> `.planning/config.json` no define `workflow.nyquist_validation` → tratado como habilitado.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`npx vitest run`) |
| Config file | repo root (existente) |
| Quick run | `npx vitest run src/lib/agents/varixcenter/__tests__/` |
| Full suite | `npx vitest run` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Comando | File Exists? |
|-----|----------|-----------|---------|-------------|
| VARIX-CLONE | transiciones válidas §7 | unit | `vitest run src/lib/agents/varixcenter/__tests__/transitions.test.ts` | ❌ Wave 4 |
| VARIX-CLONE | comprehension 24 intents | unit | `...comprehension.test.ts` | ❌ Wave 4 |
| VARIX-TEMPLATES | TEMPLATE_LOOKUP_AGENT_ID='varixcenter' (anti-Pitfall 1) | unit | `...response-track.test.ts` (assert `.not.toBe('godentist')`) | ❌ Wave 4 |
| VARIX-AVAIL | grilla 20min + merge 2 doctores + festivos | unit | `...availability.test.ts` (mock Supabase) | ❌ Wave 4 |
| VARIX-BOOK | 23P01 → retry doctor → slot_taken | unit | `...booking.test.ts` (mock Supabase) | ❌ Wave 4 |
| VARIX-BOOK | nombre/apellido split + celular 10 dígitos | unit | `...booking.test.ts` | ❌ Wave 4 |
| VARIX-VAL | tag VAL guard incluye varixcenter | unit/grep | `grep -cE "agentModule.*!== 'varixcenter'" .../v3-production-runner.ts` | ❌ Wave 3 |
| VARIX-REGISTER | 6 sitios | grep gates | ver §Pattern 2 | ❌ Wave 3 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/agents/varixcenter/__tests__/`
- **Per wave merge:** `npx vitest run` + `tsc --noEmit` (MEMORY: tsc=0 predice deploy verde; excluir sub-proyectos en tsconfig)
- **Phase gate:** full suite green + 6 grep gates + Smoke 1 (dropdown routing-editor)

### Wave 0 Gaps
- [ ] `src/lib/agents/varixcenter/__tests__/*` — 6 suites (no existen)
- [ ] `src/lib/domain/varix-clinic/__tests__/availability.test.ts` + `booking.test.ts` — mock del 2º cliente Supabase
- [ ] Framework: ya instalado (Vitest), sin gap de install
- [ ] ⚠️ tsconfig: asegurar que varix-clinic (proyecto vecino) NO entre al `include` del tsconfig de MorfX (MEMORY build_subprojects_break_next_build) — pero como varix-clinic es OTRO repo en otra carpeta, no aplica salvo que se importe código suyo (NO se hace — solo se conecta a su DB).

## Security Domain

> `security_enforcement` no está en config → tratado como habilitado.

### Applicable ASVS Categories
| ASVS | Aplica | Control estándar |
|------|--------|------------------|
| V2 Authentication | sí | service_role key de varix-clinic en env var (nunca en cliente/repo) |
| V4 Access Control | sí | El bot solo agenda valoraciones; NO toca pagos/historias/medias de varix-clinic (scope acotado en domain module) |
| V5 Input Validation | sí | cédula numérica, celular 10 dígitos, fecha YYYY-MM-DD validados antes del INSERT (zod o checks manuales) |
| V6 Cryptography | no | no se maneja cripto propia |

### Known Threat Patterns
| Pattern | STRIDE | Mitigación |
|---------|--------|------------|
| SQL injection vía cédula/nombre | Tampering | supabase-js usa queries parametrizadas (`.eq`, `.insert` con objeto) — nunca string concat `[VERIFIED: citas/actions.ts]` |
| service_role key leak | Info disclosure | env var Vercel; nunca `NEXT_PUBLIC_*`; nunca en logs |
| Bot escribe fuera de scope (pagos, historias) | Elevation | domain module SOLO expone availability+booking; cero acceso a otras tablas |
| Cross-tenant: bot agenda en workspace equivocado | Spoofing | varix-clinic es mono-cliente; el agent_id varixcenter solo enruta a su workspace MorfX |
| PII en observability | Info disclosure | cédula/teléfono en eventos — aplicar redaction como crm-mutation-tools (phone last 4) |

## Project Constraints (from CLAUDE.md)

- **Regla 0/GSD:** discuss→research→plan→execute→verify→LEARNINGS. Sin atajos. (research = este doc).
- **Regla 1:** push a Vercel tras cambios antes de pedir prueba al usuario.
- **Regla 2:** TODA lógica de fechas en America/Bogota (UTC-5). Crítico para `fecha_hora_inicio` (Pitfall 6).
- **Regla 3:** toda mutación por `src/lib/domain/` → la integración varix-clinic vive en `src/lib/domain/varix-clinic/`; cero `createClient` en `agents/varixcenter/`.
- **Regla 5:** migración (templates) aplicada en prod ANTES del push del código que la usa (Wave 5 BLOCKING).
- **Regla 6:** proteger agentes en producción → varixcenter es aditivo, cero cambios a godentist/somnio/etc.; activación 100% vía routing rule manual (sin tráfico hasta que el operador cree la regla).
- **agent-scope.md OBLIGATORIO:** definir scope explícito (PUEDE/NO PUEDE/Validación) de `varixcenter` en `.claude/rules/agent-scope.md` ANTES de mergear (bloqueante). NO PUEDE: tocar pagos/historias/medias/cierres de varix-clinic; solo patients (crear) + appointments (crear valoración). NO PUEDE: crear recursos base en MorfX fuera de su workspace.

## Sources

### Primary (HIGH confidence)
- `varix-clinic/supabase/migrations/{006,007,037,039,041,052}.sql` — schema patients/appointments/doctors_view/constraint 23P01
- `varix-clinic/src/app/(protected)/citas/actions.ts` — patrón INSERT + error 23P01/23505/23503
- `src/lib/agents/godentist/{dentos-availability,constants,state,response-track,godentist-agent}.ts` — motor v3 + festivos + slot formatting
- `src/lib/agents/godentist-fb-ig/{config,index}.ts` — config/register de clone
- `src/lib/agents/production/webhook-processor.ts:253,820` — pre-warm + dispatch branch
- `src/lib/agents/engine/v3-production-runner.ts:157,605` — agentModule branch + VAL guard
- `src/lib/domain/platform-config.ts` — precedente de desviación domain (sin workspace_id) + fail-open
- `src/lib/supabase/admin.ts` — createClient service_role pattern
- `.planning/standalone/agent-godentist-fb-ig/LEARNINGS.md` — receta canónica 7 waves + 8 pitfalls

### Secondary (MEDIUM confidence)
- `.planning/standalone/agent-varixcenter/{DISENO-COMPLETO,PLANTILLAS,RESPUESTAS-CUESTIONARIO,ANALISIS-CONVERSACIONES}.md` — diseño locked + datos del cliente
- `varix-clinic/PROJECT_BRIEF.md` — contexto negocio + precios

### Tertiary (LOW confidence — validar)
- Conexión cross-project Supabase sin allowlist (A1) — no verificado en runtime
- created_by NULL aceptable (A2) — no confirmado con operador

## Metadata

**Confidence breakdown:**
- Clone pattern (motor v3 + 6 sitios): HIGH — receta documentada + verificada en código.
- Schema varix-clinic: HIGH — leído de migraciones reales, no supuesto.
- Decisión de integración: HIGH para el mecanismo (query directa), MEDIUM para credenciales (dependen del operador).
- Generación de grilla de slots: MEDIUM — no hay precedente directo (godentist recibe slots ya hechos); es código nuevo de bajo riesgo algorítmico.
- Festivos: HIGH — helper existente reutilizable.

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (estable — depende de schema varix-clinic que cambia poco; re-verificar si varix-clinic agrega migraciones a appointments/patients)
