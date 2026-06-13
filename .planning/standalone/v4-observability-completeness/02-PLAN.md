---
phase: v4-observability-completeness
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts
autonomous: true
requirements: [D-01, D-02, D-03]
user_setup: []

must_haves:
  truths:
    - "Cuando el agente revienta, emite un evento engine_error a agent_observability_events con el errorMessage REAL, stack truncado (3-5 frames) y EN QUÉ STAGE reventó (cierra el agujero negro del turno 1b561aaf)"
    - "El errorStage viaja en V4AgentOutput para que el runner construya un mensaje limpio para el chat del operador"
    - "Cada stage del agente lleva restart_iteration en su payload (iter 1 vs iter 2 del restart Path A separables)"
    - "El mensaje de usuario embebido en el error está truncado/redactado (PII-safe)"
    - "El agente threadea restartIteration a las llamadas runCrmGate/runSubLoop para que el gate y el sub-loop puedan etiquetar sus eventos (D-03)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "Var currentStage + emit engine_error en el catch + restart_iteration en eventos del pipeline + errorStage en el output + restartIteration en calls runCrmGate/runSubLoop"
      contains: "recordV4Event('engine_error'"
    - path: "src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts"
      provides: "Test del error path (engine_error con stage+restart_iteration; errorStage en output)"
      contains: "engine_error"
  key_links:
    - from: "src/lib/agents/somnio-v4/somnio-v4-agent.ts (catch :1014)"
      to: "agent_observability_events"
      via: "recordV4Event('engine_error', { stage: currentStage, errorMessage: bodyTruncate(...) })"
      pattern: "recordV4Event\\('engine_error'"
    - from: "currentStage var"
      to: "V4AgentOutput.errorStage"
      via: "el return del catch setea errorStage: currentStage"
      pattern: "errorStage: currentStage"
---

<objective>
Cerrar el agujero negro del error path (D-01) e instrumentar el spine del agente (D-02 + D-03) en `somnio-v4-agent.ts`. Mantener una var local `currentStage: V4Stage` actualizada al entrar a cada stage; en el catch externo (`:1014`) emitir un evento `engine_error` con el `errorMessage` REAL, stack truncado (3-5 frames) y el `stage` donde reventó (PII-safe vía `bodyTruncate`); retornar `errorStage: currentStage` en el `V4AgentOutput` para que el runner (Plan 04) construya un mensaje limpio. Consumir `input.restartIteration` y propagarlo a los eventos del pipeline + a las llamadas `runCrmGate({...})` y `runSubLoop({...})` (cuyos tipos ya aceptan el campo gracias a Plan 01), para que el gate y el sub-loop (Plan 03) lo reciban.

Purpose: Es el corazón de D-01 — el turno `1b561aaf` falló con `V4_AGENT_ERROR` y no pudimos ver *qué* porque el motivo real se descartaba. Este plan lo emite a observabilidad con stage + iteración.

Output: `somnio-v4-agent.ts` instrumentado + suite `somnio-v4-error-path.test.ts` nueva.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-observability-completeness/RESEARCH.md
@.planning/standalone/v4-observability-completeness/PATTERNS.md

<interfaces>
<!-- Capturado this session — NO explorar de nuevo. -->

Helper a usar (creado en Plan 01) — src/lib/agents/somnio-v4/observability.ts:
```typescript
export type V4Stage = 'comprehension' | 'guards' | 'sales-track' | 'crm-gate' | 'response-track' | 'sub-loop-slot' | 'send'
export function recordV4Event(label: string, payload: Record<string, unknown>, opts?: { restartIteration?: number; durationMs?: number }): void
```

Campos de tipo (añadidos por Plan 01 — YA existen al ejecutar este plan): `V4AgentInput.restartIteration?`, `V4AgentOutput.errorStage?`, `RunCrmGateArgs.restartIteration?`, `SubLoopContext.restartIteration?`.

PII helpers — src/lib/agents/shared/crm-mutation-tools/helpers.ts:32-56:
```typescript
export function bodyTruncate(s: string, max = 200): string   // s.slice(0, max) + '…' si excede
export function idSuffix(uuid: string): string                // últimos 8 chars
```
Import path: `@/lib/agents/shared/crm-mutation-tools/helpers`.

Catch externo ACTUAL — src/lib/agents/somnio-v4/somnio-v4-agent.ts:1014-1021 (frames hoy = 4, ampliar a 5):
```typescript
} catch (error) {
  const errMsg = error instanceof Error ? error.message : String(error)
  const errStack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : undefined
  console.error('[SomnioV4] Error processing message:', errMsg, errStack ?? '')
  return {
    success: false, messages: [],
    errorMessage: errStack ? `${errMsg} :: ${errStack}` : errMsg,   // KEEP — discriminador de drain depende de esto
    // ...passthrough...
  }
}
```

Stages existentes (reusar como "completed"; SOLO añadir restart_iteration / actualizar currentStage):
- comprehension: recordEvent 'comprehension_completed_v4' :420
- guards: recordEvent 'guard' :443/:506 (category 'guard')
- sales-track: recordEvent 'sales_track_result' :566
- crm-gate: runCrmGate(...) :594 (mudo a nivel orquestador — Plan 03)
- response-track: recordEvent 'response_track_result' :630
- slot/sub-loop: runSubLoop(...) :697

Llamada runCrmGate — somnio-v4-agent.ts:594-612 (objeto con workspaceId, sessionId, accion, ..., lockHandle/lockChannel/lockIdentifier ya threadeados). Llamada runSubLoop — :697-712 (objeto { reason, ctx: { workspaceId, conversationId, ..., lockHandle, lockChannel, lockIdentifier, ... } }).

Early-returns de interrupción (NO son errores — NO emitir engine_error): errorMessage 'interrupted_at_ckpt_1_post_comprehension' :363, 'interrupted_at_ckpt_2_post_state_machine' :537 (el orchestrator los rutea a drain).

SOMNIO_V4_AGENT_ID — import :54 desde './config'.

Test mock analog — src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts:95 mockea '@/lib/observability' a no-op. Para TESTEAR engine_error crear suite nueva que mockee getCollector con spy (NO reutilizar el no-op).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: currentStage var + emit engine_error en el catch + errorStage en el output (D-01)</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts:130-200 (inicio de processUserMessage — dónde leer input.restartIteration + declarar currentStage)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts:405-700 (stages: comprehension :420, guards :443, sales-track :566, crm-gate :594, response-track :630, slot :697 — puntos de actualización de currentStage)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts:1014-1036 (catch externo a augmentar)
    - src/lib/agents/somnio-v4/observability.ts (helper recordV4Event + V4Stage)
    - src/lib/agents/shared/crm-mutation-tools/helpers.ts:32-56 (bodyTruncate)
  </read_first>
  <behavior>
    - Test 1: cuando processUserMessage tira en sales-track (mockear sales-track para throw), el spy de recordEvent recibe ('pipeline_decision', 'engine_error', objectContaining({ stage: 'sales-track', restart_iteration: 0 })).
    - Test 2: el evento engine_error lleva errorMessage truncado (no el stack crudo en ese campo) + stackFrames (string con frames separados por ' | ').
    - Test 3: el V4AgentOutput retornado lleva errorStage: 'sales-track' y success: false; errorMessage (el campo del output) sigue siendo `${errMsg} :: ${errStack}` (discriminador intacto).
    - Test 4: con input.restartIteration = 2, el engine_error lleva restart_iteration: 2.
    - Test 5 (Pitfall 2): un early-return de interrupción (errorMessage 'interrupted_at_ckpt_*') NO emite engine_error.
  </behavior>
  <action>
    En `src/lib/agents/somnio-v4/somnio-v4-agent.ts`:

    1. Import: añadir `import { recordV4Event, type V4Stage } from './observability'` y `import { bodyTruncate } from '@/lib/agents/shared/crm-mutation-tools/helpers'`.

    2. Al inicio de `processUserMessage` (~:130-165, antes del primer stage): declarar
    ```typescript
    const restartIteration = input.restartIteration ?? 0
    let currentStage: V4Stage = 'comprehension'
    ```

    3. Actualizar `currentStage` al ENTRAR a cada stage (una asignación antes de cada bloque):
       - antes de comprehension: `currentStage = 'comprehension'` (ya es el default, opcional)
       - antes de guards (~:440): `currentStage = 'guards'`
       - antes de sales-track (~:520): `currentStage = 'sales-track'`
       - antes de `runCrmGate(...)` (:594): `currentStage = 'crm-gate'`
       - antes de response-track (~:618): `currentStage = 'response-track'`
       - antes de `runSubLoop(...)` slot (~:678/:697): `currentStage = 'sub-loop-slot'`
       (El send vive en el core; aquí no aplica.)

    4. Ampliar el slice del stack a 5 frames en el catch (:1016): `.slice(0, 5)` (D-01 dice 3-5; usar 5).

    5. En el catch externo (:1014), ANTES del `return`, emitir:
    ```typescript
    recordV4Event('engine_error', {
      stage: currentStage,
      errorMessage: bodyTruncate(errMsg, 200),   // PII-safe (D-01)
      stackFrames: errStack ?? null,
      agent: SOMNIO_V4_AGENT_ID,
    }, { restartIteration })
    ```

    6. Añadir `errorStage: currentStage` al objeto del `return` del catch (junto a `success: false`). El campo `errorMessage` del output NO se toca (`${errMsg} :: ${errStack}` — discriminador de drain).

    CRÍTICO Pitfall 2: los early-returns de interrupción (`errorMessage: 'interrupted_at_ckpt_*'`, :363/:537) NO son errores y NO pasan por el catch externo → NO emiten engine_error (no tocarlos). Solo el catch externo emite engine_error.

    Crear suite `src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts` modelando el setup de mocks de `somnio-v4-agent.test.ts` PERO con `vi.mock('@/lib/observability', () => ({ getCollector: () => ({ recordEvent }) }))` donde `const recordEvent = vi.fn()` (spy, NO no-op). Forzar el throw mockeando sales-track para que tire, y assertear los 5 tests del bloque <behavior>.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "recordV4Event('engine_error'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna match
    - `grep -n "errorStage: currentStage" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna match
    - `grep -c "currentStage = '" src/lib/agents/somnio-v4/somnio-v4-agent.ts` >= 5 (actualizaciones por stage)
    - `grep -n "bodyTruncate(errMsg, 200)" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna match (PII)
    - `grep -n "slice(0, 5)" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna match (3-5 frames → 5)
    - `git diff src/lib/agents/somnio-v4/somnio-v4-agent.ts | grep '^+' | grep -c "createAdminClient\|@supabase/supabase-js"` == 0 (Regla 3)
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts` exit 0 (5 tests)
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` exit 0 (suite existente verde — no-op mock inofensivo)
  </acceptance_criteria>
  <done>El catch emite engine_error con stage+errorMessage(redactado)+stackFrames+restart_iteration; el output lleva errorStage; los early-returns de interrupción NO emiten engine_error; suites verdes.</done>
</task>

<task type="auto">
  <name>Task 2: restart_iteration en los eventos del agente + threading a runCrmGate/runSubLoop calls (D-02/D-03)</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts:420-700 (eventos *_result existentes :420/:443/:506/:566/:630 + llamadas runCrmGate :594-612 / runSubLoop :697-712)
    - src/lib/agents/somnio-v4/observability.ts (recordV4Event)
  </read_first>
  <action>
    En `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (var `restartIteration` ya declarada en Task 1). Los tipos `RunCrmGateArgs.restartIteration?` y `SubLoopContext.restartIteration?` YA existen (Plan 01) → este plan SOLO pasa los valores; tsc queda verde.

    1. Añadir `restart_iteration: restartIteration` (campo plano snake_case) al payload de los 4 eventos *_result existentes que NO usan el helper, de forma mínima-invasiva (NO migrar al helper, solo añadir el campo al objeto payload existente):
       - `comprehension_completed_v4` (:420)
       - `guard` blocked/passed (:443/:506)
       - `sales_track_result` (:566)
       - `response_track_result` (:630)
       (Estos ya emiten "completed"; D-02 admite reusar los *_result como completed del stage — RESEARCH §B estrategia mínima-invasiva. NO añadir stage_entered redundante.)

    2. Threadear `restartIteration` a la llamada `runCrmGate({...})` (:594-612): añadir la propiedad `restartIteration,` al objeto de args (junto a los lock fields `lockHandle/lockChannel/lockIdentifier`). El campo lo acepta `RunCrmGateArgs` (Plan 01). Esto permite que Plan 03 etiquete los eventos del gate.

    3. Threadear `restartIteration` a la llamada `runSubLoop({...})` (:697-712): añadir `restartIteration,` DENTRO del objeto `ctx: {...}` (junto a los lock fields del ctx — `SubLoopContext.restartIteration?` lo acepta por Plan 01). Esto permite que Plan 03 etiquete los eventos del sub-loop de slot.

    NOTA: la otra entrada al sub-loop (vision, :189 `runSubLoop({...})`) también puede recibir `restartIteration` en su ctx por consistencia (opcional, mismo patrón) — si el objeto ctx de esa llamada es trivial de extender, hacerlo; si no, dejar el default `?? 0`.

    Cambio puramente aditivo (Regla 6): no se altera el comportamiento del gate ni del sub-loop, solo se les pasa un campo de telemetría opcional.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "restart_iteration: restartIteration" src/lib/agents/somnio-v4/somnio-v4-agent.ts` >= 4 (comprehension, guard, sales_track_result, response_track_result)
    - `grep -c "restartIteration," src/lib/agents/somnio-v4/somnio-v4-agent.ts` >= 2 (threadeado a la call runCrmGate + al ctx de runSubLoop slot)
    - `npx tsc --noEmit` exit 0
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` exit 0
    - `git diff src/lib/agents/somnio-v4/somnio-v4-agent.ts | grep '^+' | grep -c "createAdminClient\|@supabase/supabase-js"` == 0 (Regla 3)
  </acceptance_criteria>
  <done>Los 4 eventos *_result del agente llevan restart_iteration; las calls runCrmGate y runSubLoop(slot) threadean restartIteration; tsc verde; suite del agente verde.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| error del agente → agent_observability_events | errorMessage + stack pueden contener PII (mensaje del usuario, datos) |
| error del agente → V4AgentOutput.errorStage → runner → chat operador | el stage + reason limpio llegan al chat |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-obs02-01 | Information Disclosure | engine_error payload (errorMessage) | mitigate | `bodyTruncate(errMsg, 200)` redacta/trunca el mensaje embebido antes de emitir (D-01 PII). El stack va a stackFrames (DB), NUNCA al chat. |
| T-obs02-02 | Information Disclosure | stack frames en agent_observability_events | accept | El stack (3-5 frames) es necesario para diagnóstico y vive solo en la DB de observabilidad (no en el chat del operador — Pitfall 5). Acceso a la tabla ya está acotado por workspace. |
| T-obs02-03 | Tampering | comportamiento del agente (Regla 6) | mitigate | Cambios puramente aditivos: currentStage es var local, engine_error es recordV4Event (no-throw), errorStage es campo opcional, restartIteration es telemetría opcional. errorMessage del output (discriminador de drain) NO se toca. Suite del agente verde lo confirma. |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts` exit 0
- `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` exit 0
- `npx tsc --noEmit` exit 0
- `grep -n "errorStage: currentStage" src/lib/agents/somnio-v4/somnio-v4-agent.ts` match
</verification>

<success_criteria>
- engine_error se emite en el catch con stage + errorMessage redactado + stackFrames + restart_iteration
- V4AgentOutput lleva errorStage (consumible por el runner en Plan 04)
- Los 4 eventos *_result del agente llevan restart_iteration
- Las calls runCrmGate/runSubLoop threadean restartIteration (consumido por Plan 03)
- Early-returns de interrupción NO emiten engine_error (Pitfall 2)
- Suites verdes, tsc verde, sin admin client nuevo
</success_criteria>

<output>
Tras completar, crear `.planning/standalone/v4-observability-completeness/02-SUMMARY.md`. Documentar: el contrato de errorStage para que Plan 04 (runner) lo lea; que el threading de restartIteration a las CALLS runCrmGate/runSubLoop quedó hecho aquí (los tipos los proveyó Plan 01); y la confirmación de que el agente corre idéntico (Regla 6).
</output>
