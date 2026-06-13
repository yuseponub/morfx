---
phase: v4-observability-completeness
plan: 04
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts
autonomous: false
requirements: [D-01]
user_setup: []

must_haves:
  truths:
    - "El chat del operador ya NO muestra el genérico 'V4 agent processing failed' — muestra V4_AGENT_ERROR @ {stage}: {motivo limpio} (cierra la mitad-chat de D-01)"
    - "El motivo limpio NO contiene stack (Pitfall 5 — el operador no quiere frames en la conversación)"
    - "El code V4_AGENT_ERROR se mantiene IDÉNTICO (Regla 6 / Pitfall 4 — cero behavior change downstream)"
    - "Una sola fuente: el mismo fix de la línea 599 alimenta chat + webhook (las 2 superficies que hoy muestran el genérico)"
  artifacts:
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "buildCleanErrorMessage + propagación de output.errorMessage redactado (sin stack) al error.message; code V4_AGENT_ERROR intacto"
      contains: "buildCleanErrorMessage"
    - path: "src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts"
      provides: "Test: mensaje limpio con stage, sin stack; code intacto; success no se rompe"
      contains: "V4_AGENT_ERROR"
  key_links:
    - from: "src/lib/agents/engine/v4-production-runner.ts (mapResult :597)"
      to: "EngineOutput.error.message → chat [ERROR AGENTE] {code}: {message}"
      via: "buildCleanErrorMessage(output) usando output.errorStage + primeraLínea(output.errorMessage)"
      pattern: "buildCleanErrorMessage"
---

<objective>
Cerrar la mitad-chat de D-01 ("una sola fuente"): reescribir `v4-production-runner.ts:597-600` para propagar el motivo REAL (`output.errorMessage`) — redactado, truncado y SIN stack — al `error.message`, en formato `V4_AGENT_ERROR @ {stage}: {motivo limpio}` usando el `output.errorStage` que Plan 02 añadió al `V4AgentOutput`. Mantener el `code: 'V4_AGENT_ERROR'` IDÉNTICO (Regla 6 / Pitfall 4). El chat del operador es `[ERROR AGENTE] {code}: {message}`, así que mejorar `message` mejora chat + webhook de un solo cambio. Cambio RUNNER-ONLY (el sandbox engine tiene su propio mapeo de error — paridad de error limpio en sandbox es follow-up deferible, NO en este plan).

Purpose: el turno `1b561aaf` mostraba al operador `[ERROR AGENTE] V4_AGENT_ERROR: V4 agent processing failed` (genérico inútil). Plan 02 ya emite el motivo real a observabilidad (evento engine_error); este plan lo hace visible también en el chat, limpio y sin stack.

Output: `v4-production-runner.ts` con el fix + helper `buildCleanErrorMessage` + suite nueva. Cierra el wave con push a Vercel (Regla 1).
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
<!-- Capturado this session — NO explorar de nuevo. -->

El agujero ACTUAL — src/lib/agents/engine/v4-production-runner.ts:597-600 (en mapResult, rama kind==='completed'):
```typescript
error: output.success ? undefined : {
  code: 'V4_AGENT_ERROR',
  message: 'V4 agent processing failed',   // ← hardcodeado; output.errorMessage real DESCARTADO
},
```
`output` es `result.output` (V4AgentOutput, :574). Plan 02 añadió `output.errorStage?: string` y `output.errorMessage?: string` (este último ya existía; es `${errMsg} :: ${errStack}`).

Ramas hermanas que YA propagan result.message (analog) — :546-556 (zombie), :558-568 (V4_ENGINE_ERROR). La rama V4_AGENT_ERROR es la ÚNICA que hardcodea.

PII — src/lib/agents/shared/crm-mutation-tools/helpers.ts: `bodyTruncate(s, max=200)`. Import: `@/lib/agents/shared/crm-mutation-tools/helpers`.

Chat surface (NO tocar — mejora vía message): `[ERROR AGENTE] {code}: {message}` truncado a 500 — webhook-processor.ts:665-668. Una sola fuente.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: buildCleanErrorMessage + fix de la línea 599 (D-01 una sola fuente, RUNNER-ONLY)</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts:540-602 (mapResult completo — ramas zombie/error/completed, el agujero :597-600)
    - src/lib/agents/shared/crm-mutation-tools/helpers.ts:38-44 (bodyTruncate)
    - src/lib/agents/somnio-v4/types.ts (V4AgentOutput.errorStage? + errorMessage? — añadidos por Plan 01/02)
  </read_first>
  <behavior>
    - Test 1: con output { success:false, errorStage:'crm-gate', errorMessage:'boom reason :: at foo (x.ts:1) | at bar (y.ts:2)' }, mapResult retorna error.message === 'V4_AGENT_ERROR @ crm-gate: boom reason' (stage incluido, stack STRIPPED en el `::`).
    - Test 2: el message NO contiene ' | ' ni 'at ' (sin frames de stack — Pitfall 5).
    - Test 3: error.code === 'V4_AGENT_ERROR' SIEMPRE (Pitfall 4 — intacto).
    - Test 4: con output.success === true, error es undefined (sin regresión).
    - Test 5: con errorMessage ausente, fallback a 'V4 agent processing failed' (sin reventar); con errorStage ausente, formato 'V4_AGENT_ERROR: {motivo}' (sin ' @ undefined').
    - Test 6: el motivo se trunca a ~150 chars (bodyTruncate).
  </behavior>
  <action>
    En `src/lib/agents/engine/v4-production-runner.ts`:

    1. Import: `import { bodyTruncate } from '@/lib/agents/shared/crm-mutation-tools/helpers'` (si no está ya).

    2. Añadir un helper privado (función módulo o método estático — Claude's Discretion; modelar como función pura a nivel módulo para testearla directo):
    ```typescript
    /**
     * Standalone v4-observability-completeness (D-01): construye el motivo LIMPIO para el chat
     * del operador a partir de output.errorMessage (que es `errMsg :: errStack`). SIN stack
     * (Pitfall 5). Formato: `V4_AGENT_ERROR @ {stage}: {motivo}` o `V4_AGENT_ERROR: {motivo}`
     * si no hay stage. PII-safe vía bodyTruncate.
     */
    function buildCleanErrorMessage(output: V4AgentOutput): string {
      const raw = output.errorMessage ?? 'V4 agent processing failed'
      // strip stack: el errorMessage es `errMsg :: errStack` — quedarnos con errMsg (antes del ::).
      const firstSegment = raw.split(' :: ')[0]
      const reason = bodyTruncate(firstSegment, 150)
      const stage = output.errorStage
      return stage ? `V4_AGENT_ERROR @ ${stage}: ${reason}` : `V4_AGENT_ERROR: ${reason}`
    }
    ```

    3. Reemplazar el bloque `:597-600`:
    ```typescript
    error: output.success ? undefined : {
      code: 'V4_AGENT_ERROR',                      // UNCHANGED — Pitfall 4 / Regla 6
      message: buildCleanErrorMessage(output),     // D-01: motivo real, limpio, SIN stack
    },
    ```

    CRÍTICO:
    - El `code` queda EXACTAMENTE `'V4_AGENT_ERROR'` (Pitfall 4). NO tocar `success`/`messages`/`newMode`/`orderCreated`/etc.
    - El stack NUNCA va al `message` del chat (Pitfall 5) — el stack ya está en observabilidad vía el evento engine_error de Plan 02.
    - RUNNER-ONLY: NO replicar en el sandbox engine (engine-v4.ts) — es follow-up deferible. Documentar en SUMMARY.

    Crear `src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts` que pruebe `buildCleanErrorMessage` directamente (si se exporta como función módulo, exportarla con `export` para testear) con los 6 tests del bloque <behavior>. Si se prefiere no exportar, testear vía mapResult con un TurnResult completed mockeado. Preferir exportar la función pura (más simple de testear).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "buildCleanErrorMessage" src/lib/agents/engine/v4-production-runner.ts` retorna match
    - `grep -n "V4 agent processing failed" src/lib/agents/engine/v4-production-runner.ts` retorna SOLO el fallback dentro de buildCleanErrorMessage (NO en el objeto error.message hardcodeado). Verificar: `grep -c "message: 'V4 agent processing failed'" src/lib/agents/engine/v4-production-runner.ts` == 0
    - `grep -n "code: 'V4_AGENT_ERROR'" src/lib/agents/engine/v4-production-runner.ts` SIGUE retornando match (Pitfall 4 — code intacto)
    - `grep -n "split(' :: ')" src/lib/agents/engine/v4-production-runner.ts` retorna match (strip stack — Pitfall 5)
    - `git diff src/lib/agents/engine/v4-production-runner.ts | grep '^+' | grep -c "createAdminClient\|@supabase/supabase-js"` == 0 (Regla 3)
    - `npx vitest run src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts` exit 0 (6 tests)
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <done>El runner propaga el motivo limpio (con stage, sin stack) al chat manteniendo code V4_AGENT_ERROR; el genérico hardcodeado eliminado del objeto error; suite verde; tsc verde.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verificación final + push a Vercel (Regla 1)</name>
  <what-built>
    Toda la instrumentación v4 (Planes 01-04): helper recordV4Event, campos de tipo restartIteration/errorStage, threading del core, error path del agente (engine_error), spine restart_iteration, CRM gate (crm_gate_skipped/completed), sub-loop (tooling/generation/error), y el fix del chat del operador (motivo limpio con stage, sin stack).
  </what-built>
  <how-to-verify>
    Antes del push, el ejecutor corre la batería completa y confirma verde:
    1. `npx tsc --noEmit` → exit 0 (memory build_subprojects_break_next_build: tsc=0 predice Vercel verde)
    2. `npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/interruption-system-v2/__tests__/observability.test.ts src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts` → exit 0 (todas las suites v4 + observability de interruption + runner error message)
    3. Grep de regresión de las 3 superficies del agujero negro:
       - `grep -c "message: 'V4 agent processing failed'" src/lib/agents/engine/v4-production-runner.ts` == 0
       - `grep -c "recordV4Event('engine_error'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` >= 1
       - `grep -c "crm_gate_completed\|subloop_tooling_completed" src/lib/agents/somnio-v4/crm-gate.ts src/lib/agents/somnio-v4/sub-loop/index.ts` >= 2
    4. Confirmar Regla 6 (cero behavior change): `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` verde — el agente corre idéntico, solo "ilumina".

    Tras verde, commit + push a origin/main (Regla 1, mensaje en español, Co-authored-by Claude):
    `git add src/lib/agents/somnio-v4/ src/lib/agents/engine/v4-production-runner.ts src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts && git commit -m "feat(v4-observability): instrumentación aditiva completa del pipeline v4 (error path + spine + CRM gate + RAG sub-loop + restart_iteration)" && git push origin main`

    El operador confirma en Vercel que el deploy quedó verde (sin errores de build).
  </how-to-verify>
  <resume-signal>Escribe "aprobado" tras confirmar deploy verde en Vercel, o describe cualquier fallo de build/test.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| runner → EngineOutput.error.message → chat del operador | el motivo del error (con posible PII del usuario) llega a la conversación visible del operador |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-obs04-01 | Information Disclosure | error.message en el chat (stack) | mitigate | buildCleanErrorMessage hace `split(' :: ')[0]` → SOLO el errMsg, NUNCA el stack (Pitfall 5). El stack vive solo en el evento engine_error (DB de observabilidad). |
| T-obs04-02 | Information Disclosure | error.message en el chat (PII del mensaje de usuario) | mitigate | bodyTruncate(reason, 150) trunca el motivo (D-01 PII). El reason proviene del errMsg del agente, no del mensaje crudo del usuario. |
| T-obs04-03 | Tampering | downstream del code V4_AGENT_ERROR (webhook-processor, handoff) | mitigate | `code` se mantiene IDÉNTICO (Pitfall 4); solo cambia `message`. success/messages/newMode/orderCreated NO se tocan. engine-v4-lock + somnio-v4-agent suites verdes lo confirman (Regla 6). |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts` exit 0
- `npx tsc --noEmit` exit 0
- `grep -c "message: 'V4 agent processing failed'" src/lib/agents/engine/v4-production-runner.ts` == 0
- `grep -n "code: 'V4_AGENT_ERROR'" src/lib/agents/engine/v4-production-runner.ts` match
- Batería completa de Task 2 verde antes del push
</verification>

<success_criteria>
- El chat del operador muestra V4_AGENT_ERROR @ {stage}: {motivo limpio} en vez del genérico
- code V4_AGENT_ERROR intacto, sin stack en el chat, PII redactada
- Una sola fuente (fix de 599) alimenta chat + webhook
- Todas las suites v4 + observability verdes, tsc verde, deploy Vercel verde
</success_criteria>

<output>
Tras completar, crear `.planning/standalone/v4-observability-completeness/04-SUMMARY.md`. Documentar: que el fix es RUNNER-ONLY (paridad de error limpio en sandbox engine-v4.ts es follow-up deferido); el formato del mensaje del chat; y el cierre del agujero negro (las 2 superficies — chat + observabilidad — ahora muestran el motivo real con stage). Recordar al usuario el LEARNINGS.md del standalone al cerrar (Regla 0 / CLAUDE.md).
</output>
