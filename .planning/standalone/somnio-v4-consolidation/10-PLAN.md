---
phase: somnio-v4-consolidation
plan: 10
type: execute
wave: 7
depends_on: ["09"]
files_modified:
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts
  - src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts
autonomous: true
requirements: [D-04, D-05]
must_haves:
  truths:
    - "v4-production-runner.ts es un wrapper delgado: threading de lock fields desde EngineInput + adapters de producción + mapeo TurnResult→EngineOutput — el restart loop vive SOLO en el core"
    - "Las suites de caracterización (restart + pathb) pasan con asserts INTACTOS — solo cambios de vi.mock/setup sancionados por A13/D-09"
    - "El retry de VersionConflictError (máx 3) queda en el wrapper ALREDEDOR del core (B9) — el release doble es safe por owner-check"
    - "webhook-processor.ts NO cambió — sigue instanciando el runner con la misma firma pública (cambio interno)"
  artifacts:
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "wrapper prod: adapters TurnCoreAdapters de producción + runTurn del core"
      contains: "runTurn"
  key_links:
    - from: "src/lib/agents/engine/v4-production-runner.ts"
      to: "src/lib/agents/somnio-v4/core/turn-orchestrator.ts"
      via: "runTurn(input, prodAdapters)"
      pattern: "runTurn"
    - from: "prodAdapters.send"
      to: "V4MessagingAdapter (CKPT-7.N interno)"
      via: "contrato send() existente {messagesSent, interrupted?, interruptedAtIndex?}"
      pattern: "messagesSent"
---

<objective>
Wave 2, paso 4b: reescribir el runner de producción como wrapper del core. La suite del runner verde = el core reproduce producción (la dirección D-04 queda demostrada).

Purpose: primer consumidor del core; las suites de caracterización del runner se convierten de facto en la suite del core.
Output: runner ~300 líneas (era 1295), comportamiento byte-equivalente.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-04, D-05)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (§Divergence Map B1-B11 — qué implementa cada adapter prod; Pitfall 8; A13)
@.planning/standalone/somnio-v4-consolidation/09-SUMMARY.md (firma final de runTurn/TurnCoreAdapters)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)

DECLARACIÓN CARVE-OUT D-09 (A13/Pitfall 8): este plan ACTUALIZA vi.mock paths en v4-production-runner-pathb.test.ts (el mock `vi.mock('@/lib/agents/somnio-v4')` del agente debe apuntar al specifier que el core usa: `@/lib/agents/somnio-v4/somnio-v4-agent`). Es cambio de SETUP, no de asserts — sancionado explícitamente. Cualquier assert que pida cambiar = regresión, parar.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reescribir v4-production-runner.ts como wrapper + adapters de producción</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (COMPLETO — todo lo que NO se movió al core debe quedar en los adapters/wrapper: sesión, commit B7, pending-templates B3, crash-recovery B2 con comentarios D-18, no-rep B5, preload B4, debug B8, VersionConflict B9, EngineOutput+agent_routed B11, contrato de error prod success:false)
    - src/lib/agents/somnio-v4/core/types.ts + core/turn-orchestrator.ts (los contratos contra los que se implementa)
    - src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts (SOLO LECTURA salvo necesidad mínima de wiring — CKPT-7.N intacto)
    - src/lib/whatsapp/webhook-processor.ts (~:847-931 — SOLO LECTURA: la firma pública del runner que NO debe cambiar)
  </read_first>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <action>
    1. Construir dentro del runner los `TurnCoreAdapters` de producción (closures sobre this.adapters/this.config existentes):
       - `send`: delega al messaging adapter actual (V4MessagingAdapter hace CKPT-7.N internamente) — mismo block shape que hoy.
       - `getSeedState`: el fetch de sesión per-iteración actual (B1) incluyendo `setSessionId` del timer adapter si aplica.
       - `commitTurn`: el bloque post-send completo (B7): saveState + emisión ledger (kb_topic_registered/crm_action_recorded/turn_ledger_committed) + templates_enviados + state_committed + updateMode + timer signals + addTurn user/assistant (incluye `confidence` legacy — intacto D-15) + handoff.
       - `getPendingTemplates`/`savePendingTemplates`/`clearPendingTemplates`: del storage actual (B3).
       - `getLegacyPendingMessage`/`savePathARollback`: los sites `_v3:pendingUserMessage` (B2) — CONSERVAR los comentarios D-18 del Plan 03 moviéndolos junto al código.
       - `filterOutbound`: el filtro no-repetición `USE_NO_REPETITION_V4` + registry + minifrases (B5).
       - `preloadOnce`: preload data + `_v3:agent_module` marker (B4).
       - `recordDebug`: los records del debug adapter (B8).
       - NO implementar: beforeAgentInvoke, onResultReady (sandbox-only — su ausencia salta esas ramas).
    2. `processMessage` del runner queda: validación/threading de lock fields desde EngineInput → retry-wrapper de `VersionConflictError` (máx 3, B9 — re-entra `runTurn` con el MISMO lockHandle; el release doble es safe porque releaseLockIfOwner es owner-checked) → `runTurn(coreInput, prodAdapters)` → mapeo `TurnResult` → `EngineOutput` + evento `agent_routed` (B11): 'completed'→success:true como hoy; 'zombie_exit'→`{success:false, error:{code:'V4_ZOMBIE_LAMBDA_EXIT', ...}}`; 'error'→success:false + code (contrato prod C5).
    3. BORRAR del runner todo lo extraído (loop, drains, ckpts, heartbeat, finally) — el archivo debe quedar sin `while (`, sin `drainPendingAndCombine`, sin `runCheckpointGate`, sin `startHeartbeat`.
    4. La firma pública del runner (constructor + processMessage) NO cambia — webhook-processor.ts no se toca.
    5. Gate D-09 (typecheck — la suite se arregla en Task 2 si los mocks viejos fallan): `npx tsc --noEmit`. Commit: `refactor(somnio-v4-consolidation 10): runner reescrito como wrapper del core (D-04) — adapters prod B1-B11`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "runTurn" src/lib/agents/engine/v4-production-runner.ts && grep -c "while (" src/lib/agents/engine/v4-production-runner.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "runTurn" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 y `grep -cE "while \(|drainPendingAndCombine|runCheckpointGate|startHeartbeat" src/lib/agents/engine/v4-production-runner.ts` = 0
    - `grep -c "VersionConflictError" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (B9 en el wrapper, NO en el core)
    - `grep -c "agent_routed" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (B11 en el wrapper)
    - `grep -c "D-18" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (comentarios crash-recovery conservados)
    - `wc -l src/lib/agents/engine/v4-production-runner.ts` < 700 (era 1295)
    - `git diff --name-only` NO incluye webhook-processor.ts ni messaging.ts
  </acceptance_criteria>
  <done>Runner = wrapper delgado; todo el mecanismo vive en el core.</done>
</task>

<task type="auto">
  <name>Task 2: Actualizar setup de mocks (sancionado A13) + suite completa verde con asserts intactos</name>
  <read_first>
    - src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts (vi.mock('@/lib/agents/somnio-v4') ~:78 — mockea el INDEX porque el runner viejo hacía import dinámico '../somnio-v4'; el core ahora importa '@/lib/agents/somnio-v4/somnio-v4-agent' estático)
    - src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts (mockea comprehension/threshold/sub-loop — usa el agente REAL; verificar si también mockea el index)
    - src/lib/agents/somnio-v4/core/turn-orchestrator.ts (specifier exacto del import del agente)
  </read_first>
  <files>src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts, src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts</files>
  <action>
    1. En `v4-production-runner-pathb.test.ts`: cambiar `vi.mock('@/lib/agents/somnio-v4', ...)` → `vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', ...)` conservando la factory (verificar que la factory mockea `processMessage` — ajustar el shape del módulo si el index exportaba más cosas). CAMBIO DE SETUP SANCIONADO (A13/D-09) — los `expect(...)` no se tocan.
    2. En `v4-production-runner-restart.test.ts`: verificar si sus mocks (comprehension/threshold/sub-loop/unknown-cases — interceptan DENTRO del agente real) siguen funcionando con el import estático del core. Los specifiers `@/lib/agents/somnio-v4/*` no cambiaron → deberían interceptar sin tocar. Solo ajustar si vitest reporta módulo no mockeado.
    3. Correr las 2 suites + SUITE_CMD completo. REGLA DURA: si un `expect(` necesita cambiar → regresión del core o del wrapper; PARAR, arreglar el código (no el test), re-correr.
    4. Gate D-09 + Regla 6 rápida: `npx vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` verde.
    5. Commit: `test(somnio-v4-consolidation 10): vi.mock del agente apunta al specifier del core (setup sancionado A13) — asserts intactos`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - Ambas suites del runner verdes (8 its de caracterización Path A/B)
    - `git diff` de los 2 archivos de test contiene SOLO cambios en líneas `vi.mock(`/factory — cero líneas `expect(` modificadas (verificable: `git diff -U0 -- '*.test.ts' | grep "^[+-].*expect(" | wc -l` = 0)
    - SUITE_CMD completo verde
  </acceptance_criteria>
  <done>El core reproduce producción — demostrado por la suite de caracterización sin un assert cambiado.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Webhook → runner (input no confiable indirecto) | La firma pública y la validación de lock fields se conservan; el throw A1 vive ahora en el core |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-14 | T (Tampering) | retry VersionConflict re-entrando al core con lock liberado | mitigate | Patrón actual conservado: releaseLockIfOwner es owner-checked → release doble es no-op; retry máx 3 idéntico a hoy (B9) |
| T-cons-15 | I (Info Disclosure) | commitTurn mueve persistencia a closure | accept | Mismo código, mismo workspace_id scoping vía storage adapter existente — solo cambia dónde vive |
</threat_model>

<verification>
- SUITE_CMD verde; asserts intactos (gate duro — única excepción: paths de vi.mock declarados).
- Gate D-11: diff = {v4-production-runner.ts, 2 archivos de test del runner}.
- Regla 6: webhook-processor.ts, messaging.ts, v3-production-runner.ts fuera del diff.
</verification>

<success_criteria>
- Runner wrapper <700 líneas consumiendo runTurn; capabilities prod B1-B11 implementadas como métodos del adapter.
- Suites de caracterización del runner = suite de facto del core, verdes sin asserts cambiados.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/10-SUMMARY.md`.
</output>
