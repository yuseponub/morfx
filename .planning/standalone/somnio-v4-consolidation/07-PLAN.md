---
phase: somnio-v4-consolidation
plan: 07
type: execute
wave: 4
depends_on: ["06"]
files_modified:
  - src/lib/agents/somnio-v4/core/checkpoint-gate.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/somnio-v4/engine-v4.ts
autonomous: true
requirements: [D-06, D-03]
must_haves:
  truths:
    - "Los 8 checkpoints mantienen EXACTAMENTE su posición y semántica actual — solo el boilerplate (~25-30 líneas/site) está factorizado en un helper único"
    - "Cada módulo conserva SU builder de retorno: el agente retorna V4AgentOutput-passthrough, el sub-loop retorna LoopOutcome, runner/engine sus drains — el helper NO construye returns"
    - "checkpoint-gate.ts importa checkpoint() con el specifier absoluto @/lib/agents/interruption-system-v2/checkpoints (Pitfall 8 — los vi.mock siguen interceptando)"
    - "Suite v4 completa verde con CERO asserts cambiados — los eventos emitidos son byte-equivalentes (label + payload keys)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/core/checkpoint-gate.ts"
      provides: "runCheckpointGate helper + tabla declarativa CHECKPOINT_PLACEMENTS de los 8 ckpts"
      exports: ["runCheckpointGate", "CHECKPOINT_PLACEMENTS"]
      min_lines: 60
  key_links:
    - from: "src/lib/agents/somnio-v4/core/checkpoint-gate.ts"
      to: "@/lib/agents/interruption-system-v2/checkpoints"
      via: "import { checkpoint } — el helper ENVUELVE el single-source-of-truth, no lo reemplaza"
      pattern: "from '@/lib/agents/interruption-system-v2/checkpoints'"
    - from: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      to: "core/checkpoint-gate.ts"
      via: "runCheckpointGate en CKPT-1 y CKPT-2"
      pattern: "runCheckpointGate"
---

<objective>
Wave 2, paso 1 (orden del RESEARCH: de menor a mayor blast radius): crear `core/checkpoint-gate.ts` (D-06) y adoptarlo en los 4 archivos que hoy repiten el boilerplate de ~25-30 líneas (skip-gate + lostLock throw + emit + interrupted-return discriminado). Las COLOCACIONES no se mueven — la posición ES el contrato.

Purpose: cambio más mecánico primero; reduce el cuerpo del runner/engine antes de extraerlos (Planes 08-11) y elimina ~200 líneas duplicadas.
Output: helper único + tabla declarativa de colocaciones + 4 archivos adoptándolo, semántica idéntica.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-03, D-06)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (§Code Examples — boilerplate CKPT-1; Pitfall 8; §Don't Hand-Roll fila 1)
@.planning/standalone/somnio-v4-consolidation/PATTERNS.md (§checkpoint-gate.ts — firma sugerida y boilerplate completo)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)

NOTA: line refs del 2026-06-10 con drift de Wave 1 — localizar SIEMPRE por grep de `ckpt_N_` / `checkpoint(`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear core/checkpoint-gate.ts (helper + tabla declarativa de colocaciones)</name>
  <read_first>
    - src/lib/agents/interruption-system-v2/checkpoints.ts (la función checkpoint() :106-160 que el helper ENVUELVE — firma, shape de retorno {proceed, lostLock, interrupted}, CheckpointId, CheckpointOptions)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (boilerplate CKPT-1 — el patrón canónico: localizar `ckpt_1_post_comprehension`)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (sites CKPT-3/4/5 — payload de emit puede diferir; inventariar ANTES de diseñar)
    - src/lib/agents/engine/v4-production-runner.ts (sites CKPT-0/6a/6b — estos NO retornan, drenan; el helper solo cubre la parte gate+throw+detección)
    - src/lib/agents/somnio-v4/engine-v4.ts (sites CKPT-0/6)
  </read_first>
  <files>src/lib/agents/somnio-v4/core/checkpoint-gate.ts</files>
  <action>
    1. INVENTARIO PREVIO (obligatorio): `grep -n "checkpoint(" src/lib/agents/somnio-v4/somnio-v4-agent.ts src/lib/agents/somnio-v4/sub-loop/index.ts src/lib/agents/engine/v4-production-runner.ts src/lib/agents/somnio-v4/engine-v4.ts` y, por cada site, anotar: ckptId, condición de skip-gate, texto del LostLockError, label+payload del emitLockEvent en interrupt (si emite), y qué hace tras detectar interrupt (return discriminado vs drain). Este inventario define la parametrización del helper — el output emitido debe quedar BYTE-EQUIVALENTE.
    2. Crear `src/lib/agents/somnio-v4/core/checkpoint-gate.ts`:
    ```typescript
    import { checkpoint, type CheckpointId, type CheckpointOptions } from '@/lib/agents/interruption-system-v2/checkpoints'
    import { LostLockError, type LockHandle } from '@/lib/agents/interruption-system-v2/lock'   // ajustar al export real (grep LostLockError)
    import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
    import type { LockChannel } from '@/lib/agents/interruption-system-v2/lock'                 // ajustar al módulo real del union

    export type CheckpointGateResult = 'proceed' | 'no_lock' | { interrupted: CheckpointId }

    /** D-06: factoriza el boilerplate (skip-gate + lostLock throw + emit en interrupt).
     *  El caller conserva SU builder de retorno — las colocaciones NO se mueven. */
    export async function runCheckpointGate(args: {
      ckptId: CheckpointId
      lockHandle: LockHandle | null | undefined
      workspaceId: string
      lockChannel: LockChannel | null | undefined
      lockIdentifier: string | null | undefined
      opts?: CheckpointOptions
      /** Si presente, al detectar interrupt emite msg_aborted_path_a_combined con este payload
       *  (replicar EXACTO el payload del site original; sites que emiten en el drain — runner/engine —
       *  NO pasan esto y emiten en su drain como hoy). */
      interruptEmit?: Record<string, unknown>
    }): Promise<CheckpointGateResult>
    ```
    Cuerpo: si falta lockHandle/lockChannel/lockIdentifier → `'no_lock'` (equivale al skip-gate actual); llamar `checkpoint(ckptId, handle, workspaceId, channel, identifier, opts)`; si `lostLock` → `throw new LostLockError(ckptId)`; si `!proceed && interrupted` → emitir `msg_aborted_path_a_combined` con `interruptEmit` solo si fue provisto, y retornar `{ interrupted: ckptId }`; si pasa → `'proceed'`.
    3. Exportar la tabla declarativa de colocaciones (D-06 — documentación tipada single-source):
    ```typescript
    export const CHECKPOINT_PLACEMENTS = [
      { id: 'ckpt_0_post_acquire',        owner: 'core (hoy runner/engine)', position: 'inicio de cada iteración del restart loop' },
      { id: 'ckpt_1_post_comprehension',  owner: 'somnio-v4-agent.ts',       position: 'tras comprehension, antes de guards' },
      { id: 'ckpt_2_post_state_machine',  owner: 'somnio-v4-agent.ts',       position: 'tras state machine, antes de tracks' },
      { id: 'ckpt_3_post_tooling',        owner: 'sub-loop/index.ts',        position: 'tras tooling-call' },
      { id: 'ckpt_4_post_generation',     owner: 'sub-loop/index.ts',        position: 'tras generation-call' },
      { id: 'ckpt_5_post_compliance',     owner: 'sub-loop/index.ts',        position: 'tras compliance-check' },
      { id: 'ckpt_6_pre_send_loop',       owner: 'core (hoy runner 6a/6b + engine 6)', position: 'antes del send-loop; 6a pending-templates prod-only' },
      { id: 'ckpt_7_pre_template',        owner: 'V4MessagingAdapter / send-adapter sandbox', position: 'per-template dentro del send (NO usa este helper)' },
    ] as const
    ```
    Ajustar `position` a lo observado en el inventario del paso 1.
    4. SPECIFIERS (Pitfall 8): TODOS los imports de interruption-system-v2 con el path absoluto `@/lib/agents/interruption-system-v2/*`. Verificar el módulo real que exporta LostLockError/LockHandle/LockChannel con grep antes de escribir los imports.
    5. Gate D-09: `npx tsc --noEmit` verde (el helper aún sin consumidores compila). Commit: `feat(somnio-v4-consolidation 07): core/checkpoint-gate.ts — helper D-06 + tabla declarativa de colocaciones`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "from '@/lib/agents/interruption-system-v2/" src/lib/agents/somnio-v4/core/checkpoint-gate.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/somnio-v4/core/checkpoint-gate.ts` existe y exporta `runCheckpointGate` y `CHECKPOINT_PLACEMENTS`
    - `grep -c "from '@/lib/agents/interruption-system-v2/" src/lib/agents/somnio-v4/core/checkpoint-gate.ts` ≥ 2 y `grep -c "from '\.\./\.\./interruption" ...` = 0 (cero specifiers relativos a interruption-system-v2)
    - `grep -c "ckpt_" src/lib/agents/somnio-v4/core/checkpoint-gate.ts` ≥ 8 (los 8 ids en la tabla)
    - typecheck verde
  </acceptance_criteria>
  <done>Helper y tabla existen, compilan, con specifiers mock-safe.</done>
</task>

<task type="auto">
  <name>Task 2: Adoptar el helper en somnio-v4-agent.ts (CKPT-1/2) y sub-loop/index.ts (CKPT-3/4/5)</name>
  <read_first>
    - src/lib/agents/somnio-v4/core/checkpoint-gate.ts (el helper recién creado)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (los 2 bloques completos CKPT-1 y CKPT-2 — incluir el shape EXACTO del return interrumpido: passthrough de intentsVistos/templatesEnviados/datosCapturados/packSeleccionado/accionesEjecutadas/turnLedgerDims/totalTokens/timerSignals)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (los 3 bloques CKPT-3/4/5 — shape del LoopOutcome de retorno con reason-discriminator)
  </read_first>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts, src/lib/agents/somnio-v4/sub-loop/index.ts</files>
  <action>
    1. En `somnio-v4-agent.ts`, por cada uno de CKPT-1 y CKPT-2: reemplazar el boilerplate (skip-gate if + checkpoint() + lostLock throw + emit + return) por:
    ```typescript
    const gate = await runCheckpointGate({ ckptId: 'ckpt_1_post_comprehension', lockHandle: input.lockHandle,
      workspaceId: input.workspaceId, lockChannel: input.lockChannel, lockIdentifier: input.lockIdentifier,
      interruptEmit: { combined_msg_count: 1, total_chars: input.message.length } })  // payload EXACTO del site original
    if (typeof gate === 'object') {
      return { success: false, messages: [], errorMessage: `interrupted_at_${gate.interrupted}`, /* MISMO passthrough actual */ }
    }
    ```
    El return interrumpido se conserva LITERAL (mismos campos, mismos valores) — solo desaparece el plumbing del check. Nota: tras Plan 02, el passthrough YA no incluye shouldCreateOrder.
    2. En `sub-loop/index.ts`, ídem para CKPT-3/4/5: el gate via helper; el return sigue siendo el LoopOutcome actual (`no_match` + discriminator `interrupted_at_ckpt_N` donde aplique) construido por el caller, byte-igual al actual.
    3. Verificación de equivalencia semántica por site: comparar `git diff` — por cada site deben desaparecer las llamadas directas a `checkpoint(` y aparecer 1 llamada a `runCheckpointGate`; el discriminator string resultante debe ser idéntico (`interrupted_at_ckpt_1_post_comprehension`, etc.).
    4. Import del helper en ambos archivos: `from './core/checkpoint-gate'` (agente) / `from '../core/checkpoint-gate'` (sub-loop) — el helper es interno a somnio-v4, specifier relativo OK (los mocks de tests interceptan interruption-system-v2, no este helper).
    5. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes con CERO asserts cambiados. Si un assert "pide" cambiar → regresión, parar (D-09 con todo su peso). Commit: `refactor(somnio-v4-consolidation 07): agente y sub-loop adoptan runCheckpointGate (CKPT-1/2/3/4/5, colocaciones intactas)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "runCheckpointGate" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -c "runCheckpointGate" src/lib/agents/somnio-v4/sub-loop/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "runCheckpointGate" src/lib/agents/somnio-v4/somnio-v4-agent.ts` = 2 (CKPT-1 y CKPT-2)
    - `grep -c "runCheckpointGate" src/lib/agents/somnio-v4/sub-loop/index.ts` = 3 (CKPT-3/4/5)
    - `grep -c "await checkpoint(" src/lib/agents/somnio-v4/somnio-v4-agent.ts src/lib/agents/somnio-v4/sub-loop/index.ts` = 0 (boilerplate directo eliminado en estos 2 archivos)
    - Los discriminators siguen presentes: `grep -c "interrupted_at_" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 2
    - SUITE_CMD verde, cero asserts cambiados
  </acceptance_criteria>
  <done>5 de los 8 sites adoptan el helper con semántica byte-equivalente.</done>
</task>

<task type="auto">
  <name>Task 3: Adoptar el helper en v4-production-runner.ts (CKPT-0/6a/6b) y engine-v4.ts (CKPT-0/6)</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (sites CKPT-0, CKPT-6a, CKPT-6b: aquí el interrupt NO retorna — drena y hace continue; el emit vive en el drain, NO pasar interruptEmit al helper)
    - src/lib/agents/somnio-v4/engine-v4.ts (sites CKPT-0 y CKPT-6 — misma estructura)
    - src/lib/agents/somnio-v4/core/checkpoint-gate.ts
  </read_first>
  <files>src/lib/agents/engine/v4-production-runner.ts, src/lib/agents/somnio-v4/engine-v4.ts</files>
  <action>
    1. En el runner, por cada site CKPT-0/6a/6b: reemplazar skip-gate + checkpoint() + lostLock-throw por `runCheckpointGate({...})` SIN `interruptEmit` (el drain del site emite como hoy). El branch de interrupt del site conserva su drain completo actual (que el Plan 08 consolidará en drainPendingAndCombine — aquí NO tocar el drain).
    2. Ídem en engine-v4.ts para CKPT-0 y CKPT-6.
    3. OJO CKPT-6a/6b: el runner distingue 6a (pending-templates) y 6b (pre-send) — conservar exactamente los mismos `CheckpointId`/opts usados hoy en cada site (el inventario del Task 1 los tiene).
    4. Import: runner usa `@/lib/agents/somnio-v4/core/checkpoint-gate` (absoluto — el runner vive fuera de somnio-v4/); engine usa `./core/checkpoint-gate`.
    5. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes, cero asserts (las suites engine-v4-lock + v4-production-runner-restart/pathb son las que más cubren estos sites — deben pasar SIN tocar). Commit: `refactor(somnio-v4-consolidation 07): runner y engine adoptan runCheckpointGate (CKPT-0/6a/6b, drains intactos)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "runCheckpointGate" src/lib/agents/engine/v4-production-runner.ts` ≥ 3 (CKPT-0/6a/6b)
    - `grep -c "runCheckpointGate" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 2 (CKPT-0/6)
    - `grep -rc "await checkpoint(" src/lib/agents/engine/v4-production-runner.ts src/lib/agents/somnio-v4/engine-v4.ts` suma 0
    - Suites de paridad verdes sin un assert cambiado
    - SUITE_CMD completo verde
  </acceptance_criteria>
  <done>Los 8 CKPT (menos 7.N que vive en el adapter) usan el helper; ~200 líneas de boilerplate eliminadas; semántica idéntica.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Fencing-token en checkpoints | El helper ENVUELVE checkpoint() sin alterar el re-check del holder ni el fail-open (Open Question 5 del módulo) |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-08 | E (Elevation) | debilitar el lostLock throw al factorizar | mitigate | El helper SIEMPRE lanza LostLockError en lostLock (sin opción de suprimirlo); suites de paridad assertean zombie_lambda_exit |
| T-cons-09 | T (Tampering) | mover colocaciones "ya que estamos" | mitigate | Anti-pattern explícito de D-06; acceptance criteria cuenta sites por archivo (2+3+3+2) |
</threat_model>

<verification>
- SUITE_CMD verde tras cada task, cero asserts cambiados (sin carve-outs en este plan).
- Gate D-11: diff = {core/checkpoint-gate.ts, somnio-v4-agent.ts, sub-loop/index.ts, v4-production-runner.ts, engine-v4.ts}.
- `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/core/` = 0 matches (Regla 3).
</verification>

<success_criteria>
- D-06 implementado: helper único + tabla declarativa; 0 llamadas directas a checkpoint() fuera del helper en los 4 archivos consumidores; colocaciones y semántica idénticas (suites de paridad lo prueban).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/07-SUMMARY.md` (incluye: inventario de sites del Task 1 — insumo del Plan 08/09).
</output>
