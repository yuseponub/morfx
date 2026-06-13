---
phase: v4-observability-completeness
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/observability.ts
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/somnio-v4/crm-gate.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/core/turn-orchestrator.ts
  - src/lib/agents/somnio-v4/observability.test.ts
autonomous: true
requirements: [D-01, D-03, D-04]
user_setup: []

must_haves:
  truths:
    - "El helper dual-emission recordV4Event existe y es no-throw (un fallo de logging nunca tumba un turno — Regla 6)"
    - "Todos los eventos del pipeline pueden llevar restart_iteration uniforme en el payload (separar iter 1 / iter 2 / iter N de un restart Path A)"
    - "El campo restartIteration viaja del RestartContext del core al V4AgentInput del agente, y los tipos de args del gate + sub-loop lo aceptan"
    - "El agente puede reportar en qué stage reventó (errorStage en V4AgentOutput) para que el runner construya un mensaje limpio"
    - "D-04: la emisión es SOLO capa de datos — recordV4Event escribe a agent_observability_events vía el collector; NO se añade ninguna superficie de UI (el debug panel del sandbox es follow-up deferido)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/observability.ts"
      provides: "Helper recordV4Event (dual-emission, no-throw global, inyecta restart_iteration)"
      contains: "export function recordV4Event"
      min_lines: 20
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "Campos opcionales restartIteration (V4AgentInput) + errorStage (V4AgentOutput)"
      contains: "restartIteration?: number"
    - path: "src/lib/agents/somnio-v4/observability.test.ts"
      provides: "Unit tests del helper (no-throw, restart_iteration, category pipeline_decision)"
      contains: "recordV4Event"
  key_links:
    - from: "src/lib/agents/somnio-v4/core/turn-orchestrator.ts"
      to: "V4AgentInput.restartIteration"
      via: "v4Input builder asigna ctx.restartIteration"
      pattern: "restartIteration: ctx.restartIteration"
    - from: "src/lib/agents/somnio-v4/observability.ts"
      to: "getCollector().recordEvent"
      via: "import { getCollector } from '@/lib/observability'"
      pattern: "getCollector\\(\\)\\?\\.recordEvent"
---

<objective>
Crear la base de la instrumentación v4: el helper dual-emission `recordV4Event` (modelo `emitLockEvent`, no-throw global, inyecta `restart_iteration` uniforme — D-03), añadir TODOS los campos de tipo opcionales que el resto de los planes consume (`restartIteration?` en `V4AgentInput`, `RunCrmGateArgs` y `SubLoopContext`; `errorStage?` en `V4AgentOutput`), y threadear `restartIteration` desde el `RestartContext` del core al `v4Input` builder + al evento `agent_routed` del send-loop.

Purpose: Estos artefactos son prerequisito de TODA la instrumentación downstream (Planes 02/03/04). Centralizar los campos de tipo aquí (wave 1) rompe el acoplamiento same-wave: Plan 02 (que pasa los valores en las CALLS del agente) y Plan 03 (que consume los valores en gate/sub-loop) dependen SOLO de este plan, no entre sí.

Output: `observability.ts` (helper nuevo) + `observability.test.ts` (suite nueva) + 4 campos opcionales de tipo (en types.ts, crm-gate.ts, sub-loop/index.ts) + threading en `core/turn-orchestrator.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-observability-completeness/RESEARCH.md
@.planning/standalone/v4-observability-completeness/PATTERNS.md
@.planning/standalone/v4-observability-completeness/CONTEXT.md

<interfaces>
<!-- Contratos a replicar — capturados del codebase this session, NO explorar de nuevo. -->

Analog del helper — src/lib/agents/interruption-system-v2/observability.ts:77-86 (emitLockEvent):
```typescript
import { getCollector } from '@/lib/observability'

export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void {
  const collector = getCollector()
  if (collector) {
    collector.recordEvent('pipeline_decision', label, payload)
  }
  console.log(`[interruption-v2] ${label}`, payload)
}
```
DIFERENCIAS del nuevo helper: (a) `label: string` LIBRE (NO LockEventLabel — Pitfall 1); (b) envolver TODO el cuerpo en try/catch global (el console.log de un payload circular podría tirar — Pitfall 6; recordEvent ya es no-throw internamente, NO doble-envolver eso); (c) inyectar `restart_iteration` uniforme (D-03, snake_case para igualar drain.ts:62); (d) aceptar opcional `durationMs`.

Firma del emisor canónico — src/lib/observability/collector.ts:153 (recordEvent, ya no-throw):
```typescript
recordEvent(category: EventCategory, label: string | undefined, payload: Record<string, unknown>, durationMs?: number): void
```
`getCollector()` (src/lib/observability/context.ts:82) retorna `ObservabilityCollector | null` → el `?.` lo hace no-op fuera de turno.

Threading analog — src/lib/agents/somnio-v4/core/turn-orchestrator.ts:174-176 (lock fields ya threadeados en el v4Input builder, :158-189):
```typescript
lockHandle: input.lockHandle ?? null,
lockChannel: input.lockChannel ?? null,
lockIdentifier: input.lockIdentifier ?? null,
```
`ctx.restartIteration` ya existe en RestartContext (restart-context.ts:46, arranca 0, se incrementa en drain.ts).

Campos opcionales backward-compat analog:
- src/lib/agents/somnio-v4/types.ts: `sessionId?: string` (:168) en V4AgentInput; `errorMessage?: string` (:221) en V4AgentOutput. interface V4AgentInput :142, interface V4AgentOutput :209.
- src/lib/agents/somnio-v4/crm-gate.ts: RunCrmGateArgs (:135-157) ya tiene `lockHandle?`/`lockChannel?`/`lockIdentifier?` opcionales — añadir restartIteration? con el mismo patrón.
- src/lib/agents/somnio-v4/sub-loop/index.ts: SubLoopContext (:81) extends SubLoopToolsContext + lock fields opcionales — añadir restartIteration?.

Test analog — src/lib/agents/interruption-system-v2/__tests__/observability.test.ts:22-28,69-76:
```typescript
const recordEvent = vi.fn()
vi.mock('@/lib/observability', () => ({
  getCollector: () => (collectorPresent ? { recordEvent } : null),
}))
// ...
expect(recordEvent).toHaveBeenCalledWith('pipeline_decision', label, payload)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Crear el helper recordV4Event + suite de tests</name>
  <read_first>
    - src/lib/agents/interruption-system-v2/observability.ts (analog emitLockEvent — copiar la forma dual-emission)
    - src/lib/agents/interruption-system-v2/__tests__/observability.test.ts (analog del test: spy de recordEvent + vi.mock '@/lib/observability')
    - src/lib/agents/shared/crm-mutation-tools/helpers.ts:32-56 (bodyTruncate/idSuffix — import path para downstream; este plan NO los usa aún pero confirma el specifier)
    - src/lib/observability/collector.ts:153-171 (firma recordEvent, ya no-throw)
  </read_first>
  <behavior>
    - Test 1: recordV4Event('engine_error', { stage: 'crm-gate' }, { restartIteration: 2 }) llama getCollector().recordEvent con ('pipeline_decision', 'engine_error', objectContaining({ stage: 'crm-gate', restart_iteration: 2 }), undefined).
    - Test 2: Sin opts.restartIteration el payload lleva restart_iteration: 0 (default).
    - Test 3: opts.durationMs se pasa como 4º arg a recordEvent.
    - Test 4: Si getCollector() retorna null, NO tira (no-op vía ?.).
    - Test 5 (no-throw Regla 6): si recordEvent/console.log tira (mock que throw), recordV4Event NO propaga la excepción.
  </behavior>
  <action>
    Crear `src/lib/agents/somnio-v4/observability.ts` con EXACTAMENTE este contenido (copiado verbatim de RESEARCH Code Example + PATTERNS §observability.ts):

    ```typescript
    import { getCollector } from '@/lib/observability'

    /**
     * Standalone v4-observability-completeness.
     * Stages del pipeline v4 (D-02) — usado para tipar el campo `stage` de los
     * eventos del spine y del errorStage del catch externo del agente.
     */
    export type V4Stage =
      | 'comprehension'
      | 'guards'
      | 'sales-track'
      | 'crm-gate'
      | 'response-track'
      | 'sub-loop-slot'
      | 'send'

    /**
     * Dual-emission no-throw (modelo emitLockEvent). Inyecta `restart_iteration`
     * uniforme en el payload (D-03, snake_case para igualar drain.ts:62).
     * El try/catch global protege el console.log de un payload circular (Pitfall 6):
     * recordEvent ya es no-throw internamente (collector.ts:159) — NO se doble-envuelve.
     * Regla 6: un fallo de observabilidad NUNCA puede tumbar un turno productivo.
     */
    export function recordV4Event(
      label: string,
      payload: Record<string, unknown>,
      opts: { restartIteration?: number; durationMs?: number } = {},
    ): void {
      try {
        const enriched = { ...payload, restart_iteration: opts.restartIteration ?? 0 }
        getCollector()?.recordEvent('pipeline_decision', label, enriched, opts.durationMs)
        console.log(`[v4-spine] ${label}`, enriched)
      } catch {
        // Regla 6: a logging failure NEVER takes down a productive turn.
      }
    }
    ```

    Reglas CRÍTICAS:
    - El import del collector DEBE ser el specifier absoluto `'@/lib/observability'` (idéntico a emitLockEvent) para que el `vi.mock('@/lib/observability')` de `engine-v4-lock.test.ts:54` lo intercepte (Pitfall 3). NO usar rutas relativas.
    - `label` es `string` LIBRE — NUNCA importar ni extender `LockEventLabel` (Pitfall 1).
    - category SIEMPRE `'pipeline_decision'` — NO añadir EventCategory nueva.

    Crear `src/lib/agents/somnio-v4/observability.test.ts` modelando `interruption-system-v2/__tests__/observability.test.ts`: declarar `const recordEvent = vi.fn()` + `let collectorPresent = true` + `let throwOnRecord = false`, `vi.mock('@/lib/observability', () => ({ getCollector: () => (collectorPresent ? { recordEvent: (...a) => { if (throwOnRecord) throw new Error('boom'); recordEvent(...a) } } : null) }))`. Implementar los 5 tests del bloque <behavior> con `recordEvent.mockClear()` en beforeEach. Test 5 setea `throwOnRecord = true` y asserta `expect(() => recordV4Event('x', {})).not.toThrow()`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/observability.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function recordV4Event" src/lib/agents/somnio-v4/observability.ts` retorna match
    - `grep -n "restart_iteration: opts.restartIteration ?? 0" src/lib/agents/somnio-v4/observability.ts` retorna match
    - `grep -n "import { getCollector } from '@/lib/observability'" src/lib/agents/somnio-v4/observability.ts` retorna match (specifier absoluto)
    - `grep -c "LockEventLabel" src/lib/agents/somnio-v4/observability.ts` == 0 (Pitfall 1)
    - `grep -c "createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/observability.ts` == 0 (Regla 3)
    - `grep -c "'pipeline_decision'" src/lib/agents/somnio-v4/observability.ts` >= 1 y `grep -c "addEventCategory\|EventCategory =" src/lib/agents/somnio-v4/observability.ts` == 0
    - `npx vitest run src/lib/agents/somnio-v4/observability.test.ts` exit 0 (5 tests verdes)
  </acceptance_criteria>
  <done>El helper recordV4Event existe, es no-throw probado, inyecta restart_iteration, usa category pipeline_decision y NO toca LockEventLabel. Suite de 5 tests verde.</done>
</task>

<task type="auto">
  <name>Task 2: Añadir TODOS los campos de tipo (restartIteration en V4AgentInput/RunCrmGateArgs/SubLoopContext + errorStage en V4AgentOutput)</name>
  <read_first>
    - src/lib/agents/somnio-v4/types.ts:142-232 (interface V4AgentInput desde :142, V4AgentOutput desde :209; analog sessionId? :168, errorMessage? :221)
    - src/lib/agents/somnio-v4/crm-gate.ts:135-157 (RunCrmGateArgs — analog lockHandle?/lockChannel?/lockIdentifier?)
    - src/lib/agents/somnio-v4/sub-loop/index.ts:81-100 (SubLoopContext — analog lock fields opcionales)
  </read_first>
  <action>
    Añadir CUATRO campos de tipo opcionales (`?`), todos backward-compat. NO cambiar campos existentes.

    1. `src/lib/agents/somnio-v4/types.ts` — dentro de `interface V4AgentInput` (~tras :200):
    ```typescript
      /**
       * Standalone v4-observability-completeness (D-03): RestartContext.restartIteration,
       * threadeado por el core para que TODOS los eventos del pipeline (agente + sub-loop
       * + gate) lo lleven uniforme en el payload. Optional/default 0 — backward-compat con
       * sandbox/tests que arman V4AgentInput a mano.
       */
      restartIteration?: number
    ```

    2. `src/lib/agents/somnio-v4/types.ts` — dentro de `interface V4AgentOutput` (junto a `errorMessage?: string` :221):
    ```typescript
      /**
       * Standalone v4-observability-completeness (D-01): el stage donde reventó el catch
       * externo de processUserMessage ('comprehension' | 'guards' | ... | 'send'). El runner
       * lo lee para construir un mensaje limpio `V4_AGENT_ERROR @ {stage}: {reason}`.
       * Optional — undefined cuando success.
       */
      errorStage?: string
    ```

    3. `src/lib/agents/somnio-v4/crm-gate.ts` — dentro de `RunCrmGateArgs` (:135-157, junto a los lock fields):
    ```typescript
      /** Standalone v4-observability-completeness (D-03): iteración del restart loop para etiquetar los eventos del gate. */
      restartIteration?: number
    ```

    4. `src/lib/agents/somnio-v4/sub-loop/index.ts` — dentro de `SubLoopContext` (:81, junto a los lock fields):
    ```typescript
      /** Standalone v4-observability-completeness (D-03): iteración del restart loop para etiquetar los eventos del sub-loop. */
      restartIteration?: number
    ```

    NINGÚN otro cambio en crm-gate.ts ni sub-loop/index.ts en este plan (la instrumentación de esos archivos es de Plan 03; aquí SOLO se añade el campo de tipo opcional). Esto crea una dependencia secuencial cross-wave limpia: Plan 03 (wave 2) depende de este plan (wave 1) para los tipos.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "restartIteration?: number" src/lib/agents/somnio-v4/types.ts` retorna match dentro de interface V4AgentInput
    - `grep -n "errorStage?: string" src/lib/agents/somnio-v4/types.ts` retorna match dentro de interface V4AgentOutput
    - `grep -c "restartIteration?: number" src/lib/agents/somnio-v4/crm-gate.ts` >= 1 (en RunCrmGateArgs)
    - `grep -c "restartIteration?: number" src/lib/agents/somnio-v4/sub-loop/index.ts` >= 1 (en SubLoopContext)
    - `npx tsc --noEmit` exit 0 (memory build_subprojects_break_next_build: tsc=0 predice Vercel verde)
  </acceptance_criteria>
  <done>Los 4 campos opcionales existen (V4AgentInput.restartIteration?, V4AgentOutput.errorStage?, RunCrmGateArgs.restartIteration?, SubLoopContext.restartIteration?), tsc verde.</done>
</task>

<task type="auto">
  <name>Task 3: Threadear restartIteration en el v4Input builder + restart_iteration en agent_routed (core, COMPARTIDO)</name>
  <read_first>
    - src/lib/agents/somnio-v4/core/turn-orchestrator.ts:140-235 (v4Input builder :158-189, lock fields threading :174-176, agent_routed event :221)
    - src/lib/agents/somnio-v4/core/restart-context.ts:38-92 (RestartContext.restartIteration :46)
    - src/lib/agents/somnio-v4/observability.ts (helper recordV4Event creado en Task 1)
  </read_first>
  <action>
    NOTA DE CAPA (PARITY): `core/turn-orchestrator.ts` es COMPARTIDO por el prod runner Y el sandbox engine. Estos cambios aparecen en AMBOS lados — eso es DESEABLE (paridad de observabilidad) e inofensivo (sandbox mockea getCollector a no-op). Documentar esto en el SUMMARY.

    En `src/lib/agents/somnio-v4/core/turn-orchestrator.ts`:

    1. En el objeto `v4Input` (builder :158-189), junto a los lock fields (:174-176), añadir una línea:
    ```typescript
        restartIteration: ctx.restartIteration,   // D-03 — RestartContext (restart-context.ts:46)
    ```
    `ctx.restartIteration` ya existe en scope (es el RestartContext del loop). NO crear contador nuevo.

    2. Al evento `agent_routed` existente (:221, `getCollector()?.recordEvent('pipeline_decision', 'agent_routed', {...})`), añadir `restart_iteration: ctx.restartIteration` al payload (campo plano, snake_case). NO migrar este call al helper (mantener cambio mínimo en core); solo añadir el campo al objeto payload existente para que el send-loop quede etiquetado por iteración (D-03 cobertura del send).

    NO cambiar el comportamiento del loop, ni el orden de send, ni los discriminadores de drain. Cambio puramente aditivo de payload (Regla 6).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "restartIteration: ctx.restartIteration" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` retorna match (en el v4Input builder)
    - `grep -c "restart_iteration: ctx.restartIteration" src/lib/agents/somnio-v4/core/turn-orchestrator.ts` >= 1 (en agent_routed)
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` exit 0 (asserts filter-based no se rompen — Pitfall 2)
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <done>El v4Input builder pasa ctx.restartIteration al campo restartIteration, agent_routed lleva restart_iteration, y la suite engine-v4-lock sigue verde.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| pipeline v4 → agent_observability_events (DB) | Datos del turno (que pueden contener PII del mensaje del usuario) cruzan hacia la tabla de observabilidad |
| pipeline v4 → Vercel console.log | El helper hace console.log dual; payloads circulares o con PII podrían filtrarse a logs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-obs01-01 | Information Disclosure | recordV4Event console.log | mitigate | El helper solo recibe payloads planos de los callers (este plan no embebe PII; los planes downstream redactan vía bodyTruncate/idSuffix antes de pasar al helper). Documentar contrato: "emitir solo datos planos/redactados". |
| T-obs01-02 | Denial of Service | recordV4Event (console.log payload circular) | mitigate | try/catch global en el cuerpo del helper — un throw de serialización NO propaga al pipeline (Pitfall 6 + Regla 6). Probado por Test 5. |
| T-obs01-03 | Tampering | EventCategory / LockEventLabel union | accept | No se añaden categorías ni labels tipados; labels son string libre. Sin cambio de superficie tipada (Pitfall 1). Riesgo nulo confirmado por RESEARCH. |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/observability.test.ts` exit 0
- `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` exit 0
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` exit 0 (toHaveLength(11) intacto)
- `npx tsc --noEmit` exit 0
</verification>

<success_criteria>
- recordV4Event existe, no-throw, inyecta restart_iteration, category pipeline_decision, sin LockEventLabel
- Los 4 campos de tipo opcionales existen (V4AgentInput/V4AgentOutput/RunCrmGateArgs/SubLoopContext)
- core threadea ctx.restartIteration al v4Input + agent_routed
- Todas las suites existentes verdes (paridad intacta)
</success_criteria>

<output>
Tras completar, crear `.planning/standalone/v4-observability-completeness/01-SUMMARY.md`. Documentar: la nota de PARITY (turn-orchestrator compartido prod+sandbox), el contrato del helper (solo payloads planos/redactados), que los 4 campos de tipo son opcionales backward-compat, y que centralizar los tipos aquí rompe el acoplamiento same-wave entre Plan 02 y Plan 03.
</output>
