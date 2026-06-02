---
phase: quick-031
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/godentist/constants.ts
  - src/lib/agents/godentist/types.ts
  - src/lib/agents/godentist/comprehension-schema.ts
  - src/lib/agents/godentist/comprehension-prompt.ts
  - src/lib/agents/godentist/state.ts
  - src/lib/agents/godentist/godentist-agent.ts
  - src/lib/agents/godentist/response-track.ts
  - src/lib/agents/godentist/transitions.ts
autonomous: true

must_haves:
  truths:
    - "Fechas vagas (solo mes, 'en vacaciones') se extraen como fecha_vaga, NO como fecha_preferida"
    - "Fechas relativas concretas ('la proxima semana', 'el martes') SI se extraen como fecha_preferida"
    - "Cuando hay fecha_vaga y se pide fecha, el bot sugiere el martes de la primera semana de ese mes"
    - "Cuando el robot devuelve 0 slots, se muestran horarios generales de la sede en vez de 'sin disponibilidad'"
    - "L4 retoma_horario solo se dispara si mostrar_disponibilidad fue exitoso (con slots reales)"
    - "Horarios en comprehension-prompt.ts reflejan jornada partida real por sede"
  artifacts:
    - path: "src/lib/agents/godentist/constants.ts"
      provides: "HORARIOS_GENERALES_SEDE map"
      contains: "HORARIOS_GENERALES_SEDE"
    - path: "src/lib/agents/godentist/types.ts"
      provides: "fecha_vaga field in DatosCliente"
      contains: "fecha_vaga"
    - path: "src/lib/agents/godentist/comprehension-schema.ts"
      provides: "fecha_vaga in extracted_fields"
      contains: "fecha_vaga"
  key_links:
    - from: "src/lib/agents/godentist/godentist-agent.ts"
      to: "src/lib/agents/godentist/constants.ts"
      via: "HORARIOS_GENERALES_SEDE import for 0-slot fallback"
      pattern: "HORARIOS_GENERALES_SEDE"
    - from: "src/lib/agents/godentist/godentist-agent.ts"
      to: "src/lib/agents/godentist/response-track.ts"
      via: "availabilityFallback flag passed to response track"
      pattern: "availabilityFallback"
---

<objective>
Fix 5 issues in the GoDentist agent: vague date handling, 0-slot fallback to real sede schedules, L4 guard for failed availability, correct real schedules in comprehension prompt, and fecha_vaga suggestion in pedir_fecha.

Purpose: Prevent bad UX when dates are too far out (0 slots) or vague, and correct inaccurate schedule info being given to patients.
Output: Updated agent files with all 5 fixes working together.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/godentist/constants.ts
@src/lib/agents/godentist/types.ts
@src/lib/agents/godentist/comprehension-schema.ts
@src/lib/agents/godentist/comprehension-prompt.ts
@src/lib/agents/godentist/state.ts
@src/lib/agents/godentist/godentist-agent.ts
@src/lib/agents/godentist/response-track.ts
@src/lib/agents/godentist/transitions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add fecha_vaga field + real schedules constant + comprehension changes</name>
  <files>
    src/lib/agents/godentist/constants.ts
    src/lib/agents/godentist/types.ts
    src/lib/agents/godentist/comprehension-schema.ts
    src/lib/agents/godentist/comprehension-prompt.ts
    src/lib/agents/godentist/state.ts
  </files>
  <action>
**constants.ts** — Add `HORARIOS_GENERALES_SEDE` map with real schedules:
```typescript
export const HORARIOS_GENERALES_SEDE: Record<string, string> = {
  cabecera: 'Lunes a Viernes 8:00am-12:30pm y 1:30pm-6:30pm. Sabados 8:00am-5:00pm jornada continua',
  mejoras_publicas: 'Lunes a Viernes 8:30am-12:00pm y 2:00pm-6:30pm. Sabados 8:00am-12:00pm',
  floridablanca: 'Lunes a Viernes 8:00am-12:00pm y 2:00pm-6:00pm. Sabados 8:00am-12:00pm',
  canaveral: 'Lunes a Viernes 8:30am-12:00pm y 2:00pm-6:30pm. Sabados 8:00am-12:00pm',
}
```

**types.ts** — Add `fecha_vaga: string | null` to `DatosCliente` interface (after `fecha_preferida`).

**comprehension-schema.ts** — Add `fecha_vaga` to `extracted_fields` in `MessageAnalysisSchema`:
```typescript
fecha_vaga: z.string().nullable().describe(
  'If date is vague (only month name like "en abril", "en vacaciones", "para mayo", "despues de semana santa") ' +
  'put the month/reference here and leave fecha_preferida null. ' +
  'Do NOT use for concrete relative dates like "la proxima semana", "el martes", "manana" — those go to fecha_preferida.'
),
```
Place it right after `fecha_preferida`.

**comprehension-prompt.ts** — Two changes:
1. Replace the incorrect `HORARIOS:` line (line 38, currently "Lunes a Viernes 8:00am a 6:30pm...") with real per-sede schedules:
```
HORARIOS POR SEDE:
- Cabecera: L-V 8:00am-12:30pm y 1:30pm-6:30pm. Sab 8:00am-5:00pm continua
- Mejoras Publicas: L-V 8:30am-12:00pm y 2:00pm-6:30pm. Sab 8:00am-12:00pm
- Floridablanca: L-V 8:00am-12:00pm y 2:00pm-6:00pm. Sab 8:00am-12:00pm
- Canaveral (Jumbo): L-V 8:30am-12:00pm y 2:00pm-6:30pm. Sab 8:00am-12:00pm
No domingos ni festivos.
```
2. Add a fecha_vaga extraction rule after the existing fecha normalization rules (after line 58):
```
  - Si la fecha es VAGA (solo mes como "en abril", "para mayo", "en vacaciones", "despues de semana santa") → fecha_preferida = null, fecha_vaga = el mes o referencia temporal
  - Si es relativa pero concreta ("la proxima semana", "el martes", "manana", "en 3 dias") → fecha_preferida = fecha calculada en YYYY-MM-DD, fecha_vaga = null
```

**state.ts** — Three changes:
1. In `createInitialState()`: add `fecha_vaga: null` to the `datos` object.
2. In `mergeAnalysis()`: add merge logic for `fecha_vaga` after `fecha_preferida` merge (same pattern — merge if non-null, non-empty, track in newFields). IMPORTANT: if `fecha_preferida` is being set (non-null from comprehension), clear `fecha_vaga` to null. If `fecha_vaga` is being set, clear `fecha_preferida` to null. They are mutually exclusive.
3. In `serializeState`/`deserializeState`: `fecha_vaga` is already handled by the generic loop over `state.datos` entries since it's a simple string field — no special handling needed. But verify the `deserializeState` function's `state.datos` restoration works for the new field (it should, since it iterates over `datosCapturados` and checks `if (key in state.datos)`).
4. In `buildResumenContext()`: add `fecha_vaga: state.datos.fecha_vaga ?? ''` to the returned record.
  </action>
  <verify>
Run `npx tsc --noEmit` — no type errors. Grep for `fecha_vaga` across all modified files to confirm it's wired through schema, types, state merge, and serialization.
  </verify>
  <done>
fecha_vaga field exists in DatosCliente, comprehension schema, comprehension prompt extraction rules. Real per-sede schedules in both constants.ts and comprehension-prompt.ts. State merge handles mutual exclusivity of fecha_preferida/fecha_vaga.
  </done>
</task>

<task type="auto">
  <name>Task 2: 0-slot fallback + L4 guard + pedir_fecha suggestion</name>
  <files>
    src/lib/agents/godentist/godentist-agent.ts
    src/lib/agents/godentist/response-track.ts
    src/lib/agents/godentist/transitions.ts
  </files>
  <action>
**godentist-agent.ts** — In `processUserMessage()`, modify the availability lookup block (lines ~285-298). After the `checkDentosAvailability` call, detect the 0-slot case and pass a flag to the response track:

```typescript
// After getting availabilitySlots...
let availabilityFallback = false
if (salesResult.accion === 'mostrar_disponibilidad' && mergedState.datos.fecha_preferida && mergedState.datos.sede_preferida) {
  try {
    const result = await checkDentosAvailability(
      mergedState.datos.fecha_preferida,
      mergedState.datos.sede_preferida,
    )
    if (result.success) {
      availabilitySlots = result.slots
      // Check if 0 slots returned (date too far out)
      const totalSlots = (result.slots?.manana?.length ?? 0) + (result.slots?.tarde?.length ?? 0)
      if (totalSlots === 0) {
        availabilityFallback = true
      }
    }
  } catch (err) {
    console.error('[GoDentist] Availability lookup failed (fail-open):', err)
    availabilityFallback = true // fail-open: show general schedules
  }
}
```

Pass `availabilityFallback` to `resolveResponseTrack`:
```typescript
const responseResult = await resolveResponseTrack({
  salesAction: salesResult.accion,
  // ... existing params ...
  availabilitySlots,
  availabilityFallback,
})
```

CRITICAL for L4 guard: When `availabilityFallback` is true, override the timer signal. The L4 timer was already set by the transition table's resolve function (inside `salesResult.timerSignal`). We need to REMOVE that L4 signal so retoma_horario doesn't fire for a 0-slot response. Replace the timer signal with L3 (re-ask for a different date):
```typescript
if (availabilityFallback && timerSignals.length > 0) {
  // Replace L4 with L3 — we showed general schedules, not real slots
  // So the retoma should ask for a new date, not retoma_horario
  timerSignals.length = 0
  timerSignals.push({ type: 'start', level: 'L3', reason: '0 slots — fallback to general schedules, re-ask date' })
}
```
Place this AFTER the response track call but BEFORE registering the action.

**response-track.ts** — Two changes:

1. Add `availabilityFallback?: boolean` to the input type of `resolveResponseTrack`.

2. In `resolveSalesActionTemplates`, modify the `mostrar_disponibilidad` case. The current code already checks `!slots?.manana?.length && !slots?.tarde?.length` and returns `sin_disponibilidad` intent. Change this to detect the `availabilityFallback` param and return a NEW template intent `horarios_generales_sede` with the sede's real schedule as context:

Update the function signature to accept `availabilityFallback`:
```typescript
function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
  availabilitySlots?: { manana: string[]; tarde: string[] },
  availabilityFallback?: boolean,
): { intents: string[]; extraContext?: Record<string, string> }
```

In the `mostrar_disponibilidad` case, replace the 0-slot check:
```typescript
case 'mostrar_disponibilidad': {
  const sedeDisplay = state.datos.sede_preferida
    ? (SEDE_DISPLAY_NAMES[state.datos.sede_preferida] ?? state.datos.sede_preferida)
    : ''

  const slots = availabilitySlots

  // 0-slot fallback: show general sede schedules instead of "sin disponibilidad"
  if (availabilityFallback || (!slots?.manana?.length && !slots?.tarde?.length)) {
    const sedeKey = state.datos.sede_preferida ?? ''
    const horarioGeneral = HORARIOS_GENERALES_SEDE[sedeKey] ?? 'Lunes a Viernes 8:00am-6:30pm'
    return {
      intents: ['horarios_generales_sede'],
      extraContext: {
        fecha: state.datos.fecha_preferida ?? '',
        sede_preferida: sedeDisplay,
        horario_general: horarioGeneral,
      },
    }
  }
  // ... rest of the existing slot rendering code stays the same ...
}
```

Import `HORARIOS_GENERALES_SEDE` from `./constants` in response-track.ts.

Also pass `availabilityFallback` through from `resolveResponseTrack` to `resolveSalesActionTemplates`:
```typescript
const resolved = resolveSalesActionTemplates(salesAction, state, input.availabilitySlots, input.availabilityFallback)
```

3. In the `pedir_fecha` case of `resolveSalesActionTemplates`, add fecha_vaga context so the template can suggest a specific date:
```typescript
case 'pedir_fecha': {
  const extraCtx: Record<string, string> = { nombre: state.datos.nombre ?? '' }
  // If fecha_vaga exists, compute suggestion (first Tuesday of that month)
  if (state.datos.fecha_vaga) {
    const suggestion = computeFechaVagaSuggestion(state.datos.fecha_vaga)
    if (suggestion) {
      extraCtx.fecha_sugerida = suggestion
      extraCtx.fecha_vaga = state.datos.fecha_vaga
    }
  }
  return {
    intents: state.datos.fecha_vaga ? ['pedir_fecha_con_sugerencia'] : ['pedir_fecha'],
    extraContext: extraCtx,
  }
}
```

Add helper function `computeFechaVagaSuggestion` at bottom of response-track.ts:
```typescript
/**
 * Given a vague date reference (month name like "abril", "mayo"),
 * compute the first Tuesday of that month as YYYY-MM-DD suggestion.
 * Returns formatted string like "martes 1 de abril" or null if unparseable.
 */
function computeFechaVagaSuggestion(fechaVaga: string): string | null {
  const meses: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  }

  const lower = fechaVaga.toLowerCase().trim()
  let monthIndex: number | null = null

  for (const [name, idx] of Object.entries(meses)) {
    if (lower.includes(name)) {
      monthIndex = idx
      break
    }
  }

  if (monthIndex === null) return null

  const now = new Date()
  let year = now.getFullYear()
  // If month is in the past this year, use next year
  if (monthIndex < now.getMonth()) year++

  // Find first Tuesday of that month
  const firstDay = new Date(year, monthIndex, 1)
  const dayOfWeek = firstDay.getDay() // 0=Sun, 2=Tue
  const daysUntilTuesday = (2 - dayOfWeek + 7) % 7
  const tuesday = new Date(year, monthIndex, 1 + daysUntilTuesday)

  const mesName = Object.entries(meses).find(([, v]) => v === monthIndex)?.[0] ?? ''
  return `martes ${tuesday.getDate()} de ${mesName}`
}
```

**transitions.ts** — NO changes needed. The L4 timer override is handled in godentist-agent.ts, not in the transition table. The transition table still emits L4 for mostrar_disponibilidad, but the agent overrides it when 0 slots are detected.

**NOTE on templates**: The new template intents `horarios_generales_sede` and `pedir_fecha_con_sugerencia` need to be created in the database (agent_templates table). This is a DB operation — add a SQL migration or script. Create a template for each:

For `horarios_generales_sede`:
- intent: `horarios_generales_sede`
- content: `Para la fecha {{fecha}} no encontramos citas disponibles en {{sede_preferida}}.\n\nNuestro horario de atencion en esa sede es:\n{{horario_general}}\n\nTe gustaria probar con otra fecha mas cercana?`
- priority: CORE, orden: 0

For `pedir_fecha_con_sugerencia`:
- intent: `pedir_fecha_con_sugerencia`
- content: `Para {{fecha_vaga}}, te parece el {{fecha_sugerida}}? O si prefieres otra fecha, me dices cual te queda bien`
- priority: CORE, orden: 0

Create these via SQL in a migration file `supabase/migrations/20260324_godentist_fecha_vaga_templates.sql`. Use the GoDentist agent ID from `src/lib/agents/godentist/config.ts` — read it first to get the UUID. The workspace_id for GoDentist is needed too — query from agent_configs table where agent name matches.

Actually, SIMPLER approach: create a script `scripts/godentist-fecha-vaga-templates.sql` with the INSERT statements using subqueries to find the agent_id and workspace_id. The user will apply manually per Regla 5.
  </action>
  <verify>
1. `npx tsc --noEmit` passes with no errors
2. Grep for `availabilityFallback` in godentist-agent.ts and response-track.ts to confirm wiring
3. Grep for `horarios_generales_sede` in response-track.ts and the SQL script
4. Grep for `pedir_fecha_con_sugerencia` in response-track.ts and the SQL script
5. Grep for `computeFechaVagaSuggestion` to confirm helper exists
6. Verify the L4 timer override logic: search for `timerSignals.length = 0` in godentist-agent.ts
  </verify>
  <done>
When robot returns 0 slots, agent shows general sede schedules (from HORARIOS_GENERALES_SEDE constant) instead of "sin disponibilidad". L4 retoma_horario is replaced with L3 retoma_fecha when 0 slots detected. When fecha_vaga is set and pedir_fecha triggers, bot suggests first Tuesday of the referenced month. SQL script ready for user to apply before deploy.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. All 5 fixes verifiable:
   - fecha_vaga field: grep `fecha_vaga` across types, schema, state, prompt
   - Horarios reales: grep `HORARIOS_GENERALES_SEDE` in constants.ts, response-track.ts
   - Comprehension prompt: visual inspection of horarios section (no longer "8:00am a 6:30pm" single line)
   - 0-slot fallback: grep `availabilityFallback` in godentist-agent.ts, response-track.ts
   - L4 guard: grep `timerSignals.length = 0` in godentist-agent.ts (timer replacement logic)
   - pedir_fecha_con_sugerencia: grep in response-track.ts
3. SQL script exists at `scripts/godentist-fecha-vaga-templates.sql`
</verification>

<success_criteria>
- TypeScript compiles cleanly
- Vague dates extracted as fecha_vaga (not fecha_preferida) via updated comprehension schema + prompt
- 0-slot responses show real sede schedules via horarios_generales_sede template
- L4 retoma_horario never fires after 0-slot response (replaced with L3)
- pedir_fecha with fecha_vaga context suggests first Tuesday of referenced month
- Comprehension prompt shows correct per-sede jornada partida schedules
- SQL migration script ready for manual application
</success_criteria>

<output>
After completion, create `.planning/quick/031-fix-godentist-fecha-vaga-0slots-horarios/031-SUMMARY.md`
</output>
