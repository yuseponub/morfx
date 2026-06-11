# Phase agent-varixcenter — Mapa de Patrones

**Mapeado:** 2026-06-11
**Archivos analizados:** 21 (16 nuevos en el agente + 3 nuevos en domain + 4 sitios de registro modificados + 1 migración + 6 suites de test)
**Analogs encontrados:** 19 / 21 con match exacto o de rol; 2 sin analog directo (generación de grilla de slots + merge de 2 agendas)

> Receta canónica: clon verbatim del motor v3. **`godentist-fb-ig` es el clon más reciente** (shipped 2026-05-05) → es el analog primario para CADA archivo bajo `src/lib/agents/varixcenter/`. `godentist` es la base original. El planner debe copiar la estructura de godentist-fb-ig (que ya documenta las desviaciones del clon en sus headers).

---

## Clasificación de Archivos

### Agente nuevo — `src/lib/agents/varixcenter/`

| Archivo nuevo | Rol | Data Flow | Analog más cercano | Calidad match |
|---------------|-----|-----------|--------------------|---------------|
| `index.ts` | provider (self-register) | event-driven (import side-effect) | `godentist-fb-ig/index.ts` | exacto |
| `config.ts` | config | — | `godentist-fb-ig/config.ts` | exacto |
| `types.ts` | model (tipos) | — | `godentist-fb-ig/types.ts` | exacto (verbatim) |
| `comprehension-schema.ts` | model (zod) | transform | `godentist-fb-ig/comprehension-schema.ts` | exacto-adaptado |
| `comprehension-prompt.ts` | config (prompt) | — | `godentist-fb-ig/comprehension-prompt.ts` | exacto-adaptado |
| `comprehension.ts` | service (NLU Haiku) | request-response | `godentist-fb-ig/comprehension.ts` | exacto (verbatim + rename log) |
| `guards.ts` | utility (cross-cut) | transform | `godentist-fb-ig/guards.ts` | exacto (verbatim) |
| `phase.ts` | utility (derivación) | transform | `godentist-fb-ig/phase.ts` | exacto-adaptado |
| `constants.ts` | config | — | `godentist/constants.ts` | exacto-adaptado (intents 24 + reusar FESTIVOS) |
| `state.ts` | service (merge estado) | transform | `godentist-fb-ig/state.ts` | exacto-adaptado |
| `transitions.ts` | utility (state machine) | event-driven | `godentist-fb-ig/transitions.ts` | role-match (tabla §7 nueva) |
| `sales-track.ts` | service (decisión acción) | transform | `godentist-fb-ig/sales-track.ts` | exacto (verbatim) |
| `response-track.ts` | service (selección template) | request-response | `godentist-fb-ig/response-track.ts` | **CRÍTICO** exacto-adaptado |
| `varixcenter-agent.ts` | controller (orquestador) | request-response | `godentist/godentist-agent.ts` | role-match (write-path nuevo) |
| `__tests__/*` (6 suites) | test | — | `godentist-fb-ig/__tests__/*` | exacto-adaptado |

### Domain module nuevo — `src/lib/domain/varix-clinic/`

| Archivo nuevo | Rol | Data Flow | Analog más cercano | Calidad match |
|---------------|-----|-----------|--------------------|---------------|
| `client.ts` | service (2º cliente Supabase) | — | `src/lib/supabase/admin.ts` + `domain/platform-config.ts` (desviación) | role-match |
| `availability.ts` | service (lectura slots) | CRUD (read) + transform | `godentist/dentos-availability.ts` (mergeIntervals/parseTime) | partial (genera grilla; sin analog exacto) |
| `booking.ts` | service (escritura cita) | CRUD (write) | `varix-clinic/src/app/(protected)/citas/actions.ts:88` (manejo 23P01) — repo vecino | role-match |
| `__tests__/availability.test.ts` + `booking.test.ts` | test | — | `godentist-fb-ig/__tests__/dentos-availability.test.ts` | role-match |

### Sitios de registro compartidos (MODIFICADOS, no creados)

| Archivo modificado | Rol | Cambio | Analog (branch godentist-fb-ig) |
|--------------------|-----|--------|---------------------------------|
| `src/lib/agents/agent-catalog.ts` | config | +1 entry `id:'varixcenter'` | líneas 40-44 |
| `src/lib/agents/production/webhook-processor.ts` | route (pre-warm) | +`import('../varixcenter')` en Promise.all | línea 260 |
| `src/lib/agents/production/webhook-processor.ts` | route (dispatch) | +branch `else if (agentId === 'varixcenter')` | líneas 820-828 |
| `src/lib/agents/engine/v3-production-runner.ts` | route (agentModule) | +branch import processMessage | líneas 157-161 |
| `src/lib/agents/engine/v3-production-runner.ts` | route (VAL guard) | extender compound check | línea 605 |
| `supabase/migrations/<ts>_varixcenter_template_catalog.sql` | migration | ~44 rows `agent_id='varixcenter'` | `20260505220000_godentist_fb_ig_template_catalog.sql` |

---

## Asignación de Patrones

### `src/lib/agents/varixcenter/config.ts` (config)

**Analog:** `src/lib/agents/godentist-fb-ig/config.ts`

Patrón (líneas 16-84): constante de ID literal + `AgentConfig` con dos slots PLACEHOLDER (intentDetector/orchestrator) porque el motor v3 usa `comprehension.ts` + `sales-track.ts` directamente. Para varixcenter:
- `export const VARIXCENTER_AGENT_ID = 'varixcenter' as const` (línea 19 análoga).
- `model: CLAUDE_MODELS.HAIKU` en ambos slots (D — comprehension siempre Haiku, igual godentist).
- `states`/`validTransitions`: adaptar a las 7 fases del diseño §3 (`initial`→`capturing_data`→`capturing_fecha`→`showing_availability`→`confirming`→`appointment_registered`→`closed`). El shape del objeto `validTransitions` (líneas 65-74) se copia, solo cambian los nombres de estado.
- `tools`: copiar el set godentist-fb-ig (líneas 47-52: `crm.contact.create/update/get` + `whatsapp.message.send`). El write a varix-clinic NO es un tool del registry — va por el domain module.
- `confidenceThresholds` (líneas 76-81) y `tokenBudget` verbatim.

---

### `src/lib/agents/varixcenter/index.ts` (provider — self-register)

**Analog:** `src/lib/agents/godentist-fb-ig/index.ts`

Patrón completo (líneas 14-23):
```typescript
import { agentRegistry } from '../registry'
import { varixcenterConfig } from './config'
agentRegistry.register(varixcenterConfig)              // side-effect on import
export { VARIXCENTER_AGENT_ID } from './config'
export { processMessage } from './varixcenter-agent'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
```
**Gate:** `grep -c "agentRegistry.register" src/lib/agents/varixcenter/index.ts` = 1.

---

### `src/lib/agents/varixcenter/comprehension-schema.ts` (model, transform)

**Analog:** `src/lib/agents/godentist-fb-ig/comprehension-schema.ts`

Patrón (líneas 17-79): un solo `z.object` con tres bloques (`intent` / `extracted_fields` / `classification`). Adaptaciones varixcenter:
- `intent.primary: z.enum(VARIX_INTENTS)` (24 intents del diseño §1; godentist usa `GD_INTENTS`).
- `extracted_fields`: **eliminar** `sede_preferida` y `servicio_interes` (1 sola sede). **Agregar** `tipo_venas: z.enum(['grandes','vasitos','ambas']).nullable()` con `.describe()` de los mapeos (arañitas/vasculares→vasitos, etc. del diseño §2) + `ciudad: z.string().nullable()`. Mantener `nombre`, `cedula`, `telefono` (formato `573XXXXXXXXX` línea 35), `fecha_preferida`/`fecha_vaga` (líneas 43-52 verbatim — la lógica de fecha vaga es idéntica), `preferencia_jornada` (53-55), `horario_seleccionado` (56-58).
- `classification` (líneas 61-72): verbatim (`category`/`sentiment`/`idioma` idénticos al diseño §2).
- Export `type MessageAnalysis = z.infer<...>` (línea 79).

---

### `src/lib/agents/varixcenter/guards.ts` (utility, transform)

**Analog:** `src/lib/agents/godentist-fb-ig/guards.ts` — **clon VERBATIM** (su header dice "DO NOT modify").

Patrón (líneas 14-43): `checkGuards(analysis)` → R0 (confidence < threshold + intent `otro` → handoff) + R1 (`ESCAPE_INTENTS.has(intent)` → handoff). Para varixcenter, `ESCAPE_INTENTS` se define en `constants.ts` con los 5 escapes del diseño §1 (`asesor`, `reagendamiento`, `cancelar_cita`, `queja`, `paciente_antiguo`). El cuerpo de la función no cambia.

---

### `src/lib/agents/varixcenter/phase.ts` (utility, transform)

**Analog:** `src/lib/agents/godentist-fb-ig/phase.ts`

Patrón (líneas 17-35): `derivePhase(acciones)` escanea de más reciente a más antiguo, mapea `tipo` de acción → fase vía `switch`. Adaptar el switch a las acciones del diseño §5/§7: `pedir_datos`/`pedir_datos_parcial`→`capturing_data`, `pedir_fecha`→`capturing_fecha`, `mostrar_disponibilidad`→`showing_availability`, `mostrar_confirmacion`→`confirming`, `agendar_cita`→`appointment_registered`, `handoff`/`no_interesa`→`closed`. **Quitar** el case `pedir_datos_con_sede` (no hay sede). `SIGNIFICANT_ACTIONS` vive en `constants.ts`.

---

### `src/lib/agents/varixcenter/constants.ts` (config)

**Analog:** `src/lib/agents/godentist/constants.ts` (base original, más completa que el sibling)

- **Intents** (líneas 12-45 godentist): reemplazar `GD_INTENTS` por `VARIX_INTENTS` con los 24 del diseño §1.
- **ESCAPE_INTENTS / INFORMATIONAL_INTENTS / SIGNIFICANT_ACTIONS** (líneas 51-60+): adaptar a los intents/acciones de varixcenter.
- **Festivos — NO reescribir.** Reusar `FESTIVOS_COLOMBIA_2026` + `isNonWorkingDay()` (líneas 218-249):
  ```typescript
  // Opción A: importar de godentist (acopla 2 agentes)
  import { isNonWorkingDay } from '@/lib/agents/godentist/constants'
  // Opción B (recomendado por RESEARCH §Don't Hand-Roll): clonar el Set a
  // varixcenter/constants.ts para mantener el agente desacoplado.
  ```
  `isNonWorkingDay` usa `new Date(Date.UTC(y, m-1, d)).getUTCDay()` (línea 247) — TZ-safe (Regla 2). Copiar ese patrón exacto, NO `new Date().getDay()`.
- **CRITICAL_FIELDS:** godentist usa `['nombre','telefono','sede_preferida']` (citado en runner:609). Varixcenter usa `['nombre','telefono','cedula']` (diseño D-05). **Este cambio debe reflejarse también en el VAL guard del runner** (ver Shared Patterns).

---

### `src/lib/agents/varixcenter/response-track.ts` (service, request-response) — **CRÍTICO**

**Analog:** `src/lib/agents/godentist-fb-ig/response-track.ts`

**Anti-Pitfall 1 (regresión cdc06d9).** El header del analog (líneas 1-4) documenta el contrato: la constante de lookup DEBE ser la del agente propio:
```typescript
import { VARIXCENTER_AGENT_ID } from './config'   // analog: línea 30 (GODENTIST_FB_IG_AGENT_ID)
// ... y usarse en getTemplatesForIntents(VARIXCENTER_AGENT_ID, ...)
```
**Gate obligatorio:** `grep -rn "'godentist'" src/lib/agents/varixcenter/response-track.ts` = 0 matches. Test anti-regresión: `expect(callArgs[0]).not.toBe('godentist')` (ver suite response-track).

Patrón de imports compartido (líneas 20-32): `TemplateManager` + `composeBlock` desde `@/lib/agents/somnio/*`, `INFORMATIONAL_INTENTS`/`ACTION_TEMPLATE_MAP` desde `./constants`, `buildResumenContext`/`camposFaltantes` desde `./state`. Adaptaciones:
- **Quitar** `SEDE_DISPLAY_NAMES` (líneas 38-43) — no hay sede.
- `FIELD_LABELS` (líneas 45-50): adaptar a `nombre`/`cedula`/`telefono` (sin sede).
- English short-circuit (`idioma:'en'` → `english_response`) verbatim.
- Triage por `tipo_venas` (diseño §9): nuevo branch que mapea `tipo_venas` → `info_vasitos`/`info_grandes`/`info_ambas`; si null → template `triage`.

---

### `src/lib/agents/varixcenter/varixcenter-agent.ts` (controller, request-response)

**Analog:** `src/lib/agents/godentist/godentist-agent.ts` (write-path es código NUEVO)

**Patrón availability lookup** (godentist-agent líneas 324-356) — copiar la estructura fail-open:
```typescript
let availabilitySlots; let availabilityFallback = false
if (salesResult.accion === 'mostrar_disponibilidad' && mergedState.datos.fecha_preferida) {
  try {
    const result = await getVarixAvailability(mergedState.datos.fecha_preferida)   // domain module, NO robot
    availabilitySlots = result   // { manana, tarde }
    if ((result.manana.length + result.tarde.length) === 0) availabilityFallback = true
  } catch (err) {
    console.error('[varixcenter] Availability lookup failed (fail-open):', err)
    availabilityFallback = true
  }
}
```
Diferencia vs godentist: NO se pasa `sede_preferida` (1 sola sede), y la fuente es `getVarixAvailability` (domain) en vez de `checkDentosAvailability` (robot HTTP).

**Patrón agendar_cita (NUEVO — sin analog; godentist NO escribe).** Cuando `salesResult.accion === 'agendar_cita'`: llamar `bookVarixAppointment({nombre,cedula,telefono,fechaHoraInicio,fechaHoraFin})`. Si retorna `{ok:false, reason:'slot_taken'}` → re-ejecutar `getVarixAvailability` y emitir template `sin_disponibilidad` (mismo patrón fail-open que `availabilityFallback`, godentist-agent línea 343).

**Observability:** copiar los `getCollector()?.recordEvent('pipeline_decision', ...)` (líneas 347-356, 371-376) con `agent:'varixcenter'`. PII redaction de cédula/teléfono (RESEARCH §Security — patrón crm-mutation-tools: phone last 4).

---

### `src/lib/domain/varix-clinic/client.ts` (service — 2º cliente Supabase) — **NUEVO**

**Analogs:** `src/lib/supabase/admin.ts` (patrón `readEnv` + `createClient` service_role) + `src/lib/domain/platform-config.ts` (desviación documentada del patrón domain).

Patrón `createAdminClient` (admin.ts líneas 24-54): leer env, `createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })`. Para varix-clinic:
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
let _client: SupabaseClient | null = null
export function getVarixClinicClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.VARIX_CLINIC_SUPABASE_URL
  const key = process.env.VARIX_CLINIC_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('VARIX_CLINIC_* env vars not set')  // fail-fast → caller fail-open
  _client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _client
}
```
**Desviación documentada (copiar el estilo del header de platform-config.ts líneas 8-49):** este módulo NO filtra por `workspace_id` de MorfX porque varix-clinic es mono-cliente. Documentar el rationale en el header igual que platform-config.ts documenta su desviación (sin DomainContext, sin workspace_id).
**Gate:** `grep -rn "createClient\|createAdminClient\|@supabase/supabase-js" src/lib/agents/varixcenter/` = 0 matches (Regla 3). El único `createClient` de varix-clinic vive aquí.

---

### `src/lib/domain/varix-clinic/availability.ts` (service, read + transform) — **NUEVO**

**Analog parcial:** `src/lib/agents/godentist/dentos-availability.ts` (helpers de tiempo + cap operativo). **La generación de la grilla de 20 min y el merge de 2 agendas NO tiene analog directo** — godentist recibe slots ya formateados del robot.

Reusar de dentos-availability.ts (copiar verbatim, son helpers puros):
- `parseTimeToMinutes` (líneas 109-118) — "8:00 AM" → minutos.
- `minutesToTime` (líneas 123-130) — minutos → "8:00 AM".
- Patrón de detección de día TZ-safe (línea 86): `new Date(Date.UTC(wy, wm-1, wd)).getUTCDay()`.

Lógica NUEVA (RESEARCH §Decisión + Open Question 4):
- Generar grilla 20-min dentro de horarios hábiles (L-V 8:00-11:30 + 14:30-15:30, sáb 8:00-12:00): slots 8:00, 8:20, ..., hasta el último que cabe completo antes del cierre.
- Excluir domingos/festivos vía `isNonWorkingDay` (D-09).
- Query a `appointments` (estado activo, ambos doctores) del Supabase varix-clinic; un slot está LIBRE si AL MENOS un doctor no tiene cita solapada.
- Retorno: `{ manana: string[]; tarde: string[] }` (mismo shape que `checkDentosAvailability`, líneas 19-23, para que response-track lo consuma sin cambios).

---

### `src/lib/domain/varix-clinic/booking.ts` (service, write CRUD) — **NUEVO**

**Analog:** `varix-clinic/src/app/(protected)/citas/actions.ts:88` (repo vecino — manejo de `error.code === '23P01'`). Para el shape del retorno, espejo del patrón `{ ok: true | false }` discriminado.

Patrón (RESEARCH §Code Examples, verificado contra migraciones varix-clinic 006/007/041/052):
1. SELECT patient por `cedula` → si no existe, INSERT (idempotente; UNIQUE parcial en cédula → manejar `23505`).
2. **Pitfall 5:** partir nombre/apellido (heurística primer token) — `nombre` Y `apellido` son NOT NULL. Normalizar `celular` a 10 dígitos (no `573XXXXXXXXX`).
3. **Pitfall 6 (Regla 2):** `fecha_hora_inicio` con offset explícito `-05:00` (TIMESTAMPTZ); "8:00 AM del 2026-06-15" → `2026-06-15T08:00:00-05:00`.
4. Loop sobre `[DOCTOR_CIRO_UUID, DOCTOR_CAROLINA_UUID]`: INSERT appointment; si `error.code === '23P01'` (exclusion_violation) → probar el otro doctor; si ambos fallan → `{ ok:false, reason:'slot_taken' }`.
5. `estado:'programada'`, `motivo_consulta:'Valoración (agendada por bot WhatsApp)'`.

> UUIDs de doctores: obtener en Wave 0 vía `SELECT id, nombre, apellido FROM doctors_view` (Open Question 1). Guardar en `varix-clinic/constants.ts`.

---

### Tests — `src/lib/agents/varixcenter/__tests__/` (6 suites)

**Analog:** `src/lib/agents/godentist-fb-ig/__tests__/` (7 suites, 93 tests)

Mapa de suites (espejo del analog, ver RESEARCH §Validation):
- `transitions.test.ts` ← `godentist-fb-ig/__tests__/transitions.test.ts` (tabla §7).
- `comprehension.test.ts` ← análogo (24 intents).
- `response-track.test.ts` ← `godentist-fb-ig/__tests__/response-track.test.ts` — **CRÍTICO** incluye assert `expect(callArgs[0]).not.toBe('godentist')` (anti-Pitfall 1).
- `sales-track.test.ts`, `agent` test ← análogos.
- `varix-clinic/__tests__/availability.test.ts` + `booking.test.ts` ← `godentist-fb-ig/__tests__/dentos-availability.test.ts` (mock del cliente Supabase; 23P01 → retry doctor → slot_taken; split nombre/apellido + celular 10 dígitos).

**Patrón de mock** (response-track.test.ts líneas 26-42): `vi.hoisted` para mock functions visibles a `vi.mock` factories + `vi.mock('@/lib/agents/somnio/template-manager', ...)`. Copiar verbatim.

---

## Shared Patterns (cross-cutting — aplican a varios archivos)

### Los 6 sitios de registro
**Fuente:** branches `godentist-fb-ig` existentes. Sin uno, el agente NO funciona end-to-end.

1. **AgentRegistry** — `varixcenter/index.ts` self-register (analog: `godentist-fb-ig/index.ts:18`).
2. **AGENT_CATALOG** — `src/lib/agents/agent-catalog.ts`: agregar entry copiando líneas 40-44:
   ```typescript
   { id: 'varixcenter', name: 'Varixcenter Valoraciones', description: 'Agente de agendamiento de valoraciones flebológicas. Slots reales vs varix-clinic. WA + FB + IG.' }
   ```
3. **Pre-warm** — `webhook-processor.ts` línea 260, dentro del `Promise.all` (líneas 253-261): agregar `import('../varixcenter')`. Gate ≥2 matches de `import('../varixcenter')` en el archivo (este + dispatch).
4. **Dispatch branch** — `webhook-processor.ts` líneas 820-828: copiar el branch `else if (agentId === 'godentist-fb-ig')`:
   ```typescript
   } else if (agentId === 'varixcenter') {
     await import('../varixcenter')
     const { V3ProductionRunner } = await import('../engine/v3-production-runner')
     const runner = new V3ProductionRunner(adapters, { workspaceId, agentModule: 'varixcenter' })
     getCollector()?.setRespondingAgentId('varixcenter')
     engineOutput = await runner.processMessage({ ... })  // mismo shape
   }
   ```
5. **agentModule branch** — `v3-production-runner.ts` líneas 157-161: copiar el branch godentist-fb-ig:
   ```typescript
   } else if (this.config.agentModule === 'varixcenter') {
     const { processMessage } = await import('../varixcenter')
     output = await processMessage(v3Input as any) as unknown as V3AgentOutput
   }
   ```

### VAL tag side-effect (Pitfall 4)
**Fuente:** `v3-production-runner.ts:605` + `:609`.
**Aplica a:** el guard del runner.
**Dos cambios obligatorios:**
1. Extender el compound check (línea 605) — actualmente:
   ```typescript
   if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig') return
   ```
   → agregar `&& this.config.agentModule !== 'varixcenter'`. **Gate:** `grep -cE "agentModule.*!== 'varixcenter'" .../v3-production-runner.ts` = 1.
2. ⚠️ **CRITICAL_FIELDS divergentes** (línea 609): godentist usa `['nombre','telefono','sede_preferida']`. Varixcenter usa `['nombre','telefono','cedula']` (D-05). El bloque actual hardcodea los campos godentist — el planner debe parametrizar por `agentModule` o el guard verificará el campo equivocado (`sede_preferida` nunca existe en varixcenter → el tag VAL nunca se asignaría). Este es un riesgo NO trivial del clon que el planner debe resolver explícitamente.

### Migración de templates (Regla 5 — Wave BLOCKING)
**Fuente:** `supabase/migrations/20260505220000_godentist_fb_ig_template_catalog.sql`.
**Aplica a:** los ~44 templates `agent_id='varixcenter'` (PLANTILLAS.md).
Patrón del header (líneas 1-48): documentar workspace, idempotencia (`DELETE FROM agent_templates WHERE agent_id='varixcenter'` antes del INSERT — líneas 50-53), rollback, y la nota Regla 5 (apply en prod ANTES del push del código; si no, `getTemplatesForIntents` retorna Map vacío → `templates_not_found_in_catalog`).
**Bloqueante de contenido (Open Question 3):** el cliente debe escoger 1 de los 5 saludos de PLANTILLAS.md antes de generar este SQL.

### Fail-open en disponibilidad/booking (Pitfall 8)
**Fuente:** `godentist-agent.ts:343` (`availabilityFallback = true` en catch).
**Aplica a:** `varixcenter-agent.ts` + el domain module.
Si la conexión cross-project a varix-clinic falla (env vars ausentes, red), el agente cae a template `sin_disponibilidad` + handoff — NUNCA crashea.

### Detección de día TZ-safe (Regla 2)
**Fuente:** `dentos-availability.ts:86` + `godentist/constants.ts:247`.
**Aplica a:** `varix-clinic/availability.ts` + `constants.ts`.
Siempre `new Date(Date.UTC(y, m-1, d)).getUTCDay()`, NUNCA `new Date(fecha).getDay()` (drift por TZ del lambda).

---

## Sin Analog Directo

| Archivo | Rol | Data Flow | Razón |
|---------|-----|-----------|-------|
| `varix-clinic/availability.ts` (generación de grilla 20min + merge de 2 agendas) | service | transform | godentist recibe slots ya hechos del robot; generar la grilla + fusionar 2 agendas de doctores es código nuevo. Analogs parciales: helpers de tiempo de dentos-availability.ts (`parseTimeToMinutes`/`minutesToTime`) + `date-fns`. |
| `varix-clinic/booking.ts` (write real cross-project) | service | CRUD write | Ningún agente MorfX escribe en DB externa. Analog de error-handling: `varix-clinic/src/app/(protected)/citas/actions.ts:88` (23P01), repo VECINO no MorfX. Schema verificado en migraciones varix-clinic 006/007/041/052. |

> RESEARCH §Code Examples ya provee el esqueleto de ambos archivos — el planner debe referenciar esos ejemplos verbatim para el código sin analog.

---

## Metadata

**Scope de búsqueda de analogs:** `src/lib/agents/{godentist,godentist-fb-ig}/`, `src/lib/agents/production/`, `src/lib/agents/engine/`, `src/lib/domain/`, `src/lib/supabase/`, `supabase/migrations/`, `scripts/`.
**Archivos escaneados:** ~30.
**Fecha de extracción:** 2026-06-11.
