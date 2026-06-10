---
phase: somnio-v4-consolidation
plan: 11
type: execute
wave: 8
depends_on: ["10"]
files_modified:
  - src/lib/agents/somnio-v4/engine-v4.ts
  - src/lib/agents/somnio-v4/sandbox-adapters.ts
  - src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts
autonomous: true
requirements: [D-04, D-05]
must_haves:
  truths:
    - "engine-v4.ts es un wrapper del MISMO core que producción — el sandbox es 'producción con adapters falsos' por construcción (motivación verbatim del usuario)"
    - "El loop sintético CKPT-7.N + pacing + onMessage progressive-reveal viven en el send-adapter sandbox y retornan el MISMO contrato {messagesSent, interrupted, interruptedAtIndex} que prod"
    - "El sandbox NO implementa getPendingTemplates/getLegacyPendingMessage/filterOutbound/commitTurn → esas ramas del core se saltan = paridad actual exacta (sin CKPT-6a, sin crash-recovery, sin no-rep)"
    - "El write sandbox-result:{id} a Redis ocurre vía onResultReady ANTES del release del lock (Pitfall 5 del standalone sandbox-integration preservado)"
    - "El contrato de error sandbox (success:true + '[Error v4] ...') se conserva — divergencia C5 INTENCIONAL, mapeada en el wrapper"
    - "Suite engine-v4-lock (paridad E1..E10) verde con asserts intactos"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sandbox-adapters.ts"
      provides: "TurnCoreAdapters sandbox: send sintético NDJSON + memoria + timing simulado + onResultReady"
      exports: ["createSandboxAdapters"]
    - path: "src/lib/agents/somnio-v4/engine-v4.ts"
      provides: "wrapper sandbox: adapters + runTurn + mapeo TurnResult→V4EngineOutput (SandboxState + DebugTurn)"
      contains: "runTurn"
  key_links:
    - from: "src/lib/agents/somnio-v4/engine-v4.ts"
      to: "core/turn-orchestrator.ts"
      via: "runTurn(input, sandboxAdapters)"
      pattern: "runTurn"
    - from: "sandbox-adapters onResultReady"
      to: "redis sandbox-result:{id}"
      via: "write antes del finally-release del core"
      pattern: "sandbox-result"
---

<objective>
Wave 2, paso 5: reescribir `engine-v4.ts` como segundo consumidor del core. Tras este plan, el bug-class del 2026-05-28 (fix doble dropOwnEntry/carryState) es estructuralmente imposible: el mecanismo es código único.

Purpose: paridad por construcción — INTERRUPTION-PARITY.md deja de ser contrato de disciplina (su reducción es el Plan 12).
Output: engine wrapper + sandbox-adapters.ts; suite de paridad verde sin asserts cambiados.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-04, D-05, D-07)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (§Divergence Map C1-C6 — qué absorbe cada pieza sandbox; A10/A12)
@.planning/standalone/somnio-v4-consolidation/PATTERNS.md (§engine-v4.ts rewrite — los 4 pasos + snippets sandbox-result y error contract)
@.planning/standalone/somnio-v4-consolidation/09-SUMMARY.md (contratos) + 10-SUMMARY.md
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear sandbox-adapters.ts (send sintético + memoria + timing + onResultReady)</name>
  <read_first>
    - src/lib/agents/somnio-v4/engine-v4.ts (COMPLETO post-Plan-08 — el material fuente: loop sintético per-template con CKPT-7.N ~:404-512, pacing simulateProdTimingMs ~:411-422, thinking-sleep iter 0 ~:267-273, onMessage ~:509-511, write sandbox-result ~:645-657 y ~:696-706)
    - src/lib/agents/somnio-v4/core/types.ts (TurnCoreAdapters — el contrato a implementar)
    - src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts (SOLO LECTURA — referencia del contrato send que el adapter sandbox debe igualar, incl. lanzar LostLockError)
  </read_first>
  <files>src/lib/agents/somnio-v4/sandbox-adapters.ts</files>
  <action>
    Crear `src/lib/agents/somnio-v4/sandbox-adapters.ts` exportando `createSandboxAdapters(args): TurnCoreAdapters` con args = { input del engine (state en memoria, sandboxSessionId, simulateProdTimingMs, onMessage, lock fields), redis }:
    1. `send(block)`: ABSORBE el loop sintético del engine (C1/C6 + resolución estructural A12): iterar las unidades del block; por cada unidad i: checkpoint CKPT-7.N (mismo CheckpointId/semántica que hoy: i=0 interrupt → retornar {messagesSent: 0, interrupted: true, interruptedAtIndex: 0}; i>0 → {messagesSent: i, interrupted: true, interruptedAtIndex: i}; lostLock → throw LostLockError igual que prod); pacing `simulateProdTimingMs` per-template; `onMessage(...)` progressive reveal post-checkpoint. El CORE maneja el interrupted post-hoc en UN solo lugar (forma del runner) — el adapter NO drena ni setea carryState.
    2. `getSeedState()`: retorna el estado de memoria del input mapeado a CoreSeedState (sin DB).
    3. `beforeAgentInvoke(iteration)`: el thinking-sleep de simulateProdTimingMs SOLO en iteration 0 (paridad actual).
    4. `onResultReady(result)`: si `sandboxSessionId && lockHandle` → `redis.set('sandbox-result:'+sandboxSessionId, JSON.stringify(<payload que el route consume hoy>), { ex: 60 })` envuelto en try/catch con console.error (C4 — byte-equivalente al write actual; el core lo invoca ANTES del release).
    5. NO implementar: commitTurn, getPendingTemplates/save/clear, getLegacyPendingMessage, savePathARollback, filterOutbound, preloadOnce, recordDebug → las ramas prod-only del core se saltan = paridad actual exacta (sandbox sin CKPT-6a, D-07).
    6. Imports de interruption-system-v2 con specifier absoluto (Pitfall 8); el redis del sandbox usa el mismo cliente que el engine usa hoy.
    7. Gate: `npx tsc --noEmit`. Commit: `feat(somnio-v4-consolidation 11): sandbox-adapters.ts — send sintético CKPT-7.N + memoria + onResultReady (C1-C6)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "sandbox-result" src/lib/agents/somnio-v4/sandbox-adapters.ts && grep -cE "commitTurn|getPendingTemplates|filterOutbound" src/lib/agents/somnio-v4/sandbox-adapters.ts</automated>
  </verify>
  <acceptance_criteria>
    - sandbox-adapters.ts exporta createSandboxAdapters
    - `grep -c "ckpt_7_pre_template" src/lib/agents/somnio-v4/sandbox-adapters.ts` ≥ 1 (CKPT-7.N sintético vive aquí)
    - `grep -cE "commitTurn|getPendingTemplates|getLegacyPendingMessage|filterOutbound|preloadOnce" src/lib/agents/somnio-v4/sandbox-adapters.ts` = 0 (capabilities prod-only ausentes)
    - `grep -c "sandbox-result" src/lib/agents/somnio-v4/sandbox-adapters.ts` ≥ 1
    - typecheck verde
  </acceptance_criteria>
  <done>El "lado falso" de producción existe como adapter del mismo contrato.</done>
</task>

<task type="auto">
  <name>Task 2: Reescribir engine-v4.ts como wrapper del core</name>
  <read_first>
    - src/lib/agents/somnio-v4/engine-v4.ts (COMPLETO — lo que queda en el wrapper: build SandboxState + limpieza keys _v3: stale ~:521-541 (C2), build DebugTurn ~:547-629 (C3) con shouldCreateOrder:false literal, contrato error sandbox ~:714-742 (C5), mapeo zombie ~:666-708)
    - src/lib/agents/somnio-v4/sandbox-adapters.ts + core/turn-orchestrator.ts + core/types.ts
    - src/app/api/sandbox/process/route.ts (SOLO LECTURA — la firma pública de SomnioV4Engine que NO debe cambiar)
  </read_first>
  <files>src/lib/agents/somnio-v4/engine-v4.ts</files>
  <action>
    1. `SomnioV4Engine.processMessage` queda: construir `createSandboxAdapters(...)` → `runTurn(coreInput, sandboxAdapters)` → mapear TurnResult → V4EngineOutput:
       - 'completed' → build de SandboxState (C2: mapear carry/output a SandboxState + limpiar keys `_v3:` stale, con los casts de frontera existentes hacia src/lib/sandbox/types.ts SIN tocar ese archivo) + build de DebugTurn completo (C3: intent/tokens/orchestration con `shouldCreateOrder: false` literal/subLoop/etc.).
       - 'zombie_exit' → el shape actual del engine para zombie (~:666-708).
       - 'error' → el contrato sandbox INTENCIONAL (C5): `{ success: true, messages: ['[Error v4] ' + msg], newState: input.state, debugTurn: {...}, error: { code: 'V4_ENGINE_ERROR', ... } }` — NO unificar con prod (rompería route/UI).
    2. BORRAR del engine todo lo extraído: loop, drains, ckpts, heartbeat, finally, write sandbox-result inline (ahora vía onResultReady), loop sintético (ahora en el adapter). El archivo no debe contener `while (`, `drainPendingAndCombine`, `runCheckpointGate`, `startHeartbeat`, `releaseLockIfOwner`.
    3. Firma pública de SomnioV4Engine intacta — route.ts no se toca.
    4. Gate: `npx tsc --noEmit`. Commit: `refactor(somnio-v4-consolidation 11): engine-v4 reescrito como wrapper del core — paridad por construcción (D-04/D-05)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "runTurn" src/lib/agents/somnio-v4/engine-v4.ts && grep -cE "while \(|drainPendingAndCombine|releaseLockIfOwner" src/lib/agents/somnio-v4/engine-v4.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "runTurn" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 y `grep -cE "while \(|drainPendingAndCombine|runCheckpointGate|startHeartbeat|releaseLockIfOwner" src/lib/agents/somnio-v4/engine-v4.ts` = 0
    - `grep -c "\[Error v4\]" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (C5 conservado)
    - `git diff --name-only` NO incluye src/lib/sandbox/types.ts ni src/app/api/sandbox/process/route.ts
    - `wc -l src/lib/agents/somnio-v4/engine-v4.ts` < 450 (era 768)
    - typecheck verde
  </acceptance_criteria>
  <done>Dos consumidores, un mecanismo — la paridad es estructural.</done>
</task>

<task type="auto">
  <name>Task 3: Suite de paridad verde con asserts intactos (ajustes de mock solo si vitest lo exige)</name>
  <read_first>
    - src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts (mocks: redis-client/observability/checkpoints/somnio-v4-agent — todos con specifiers absolutos que el core REUSA → deberían interceptar sin tocar)
    - src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts (paridad del restart loop)
  </read_first>
  <files>src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts</files>
  <action>
    1. Correr `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts`. Los mocks usan los MISMOS specifiers absolutos que el core (Pitfall 8) → expectativa: verdes SIN tocar.
    2. Si vitest reporta un módulo no interceptado (ej. el redis del sandbox-adapters con specifier distinto al que mockea el test), ajustar SOLO el path del vi.mock o el import del adapter para alinear specifiers — CAMBIO DE SETUP sancionado (D-09). Cero `expect(` modificados.
    3. Correr SUITE_CMD completo + `npx tsc --noEmit`. REGLA DURA: assert que pida cambiar = regresión del wrapper/adapter → arreglar código, no test.
    4. Commit (si hubo ajuste de setup): `test(somnio-v4-consolidation 11): alinea specifiers de mocks con el core (setup sancionado) — asserts intactos`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - engine-v4-lock.test.ts (E1..E10) + restart-loop.test.ts verdes
    - `git diff -U0 -- 'src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts' | grep "^[+-].*expect(" | wc -l` = 0
    - SUITE_CMD completo verde
  </acceptance_criteria>
  <done>La suite de paridad histórica ahora prueba el core único desde el lado sandbox.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Sandbox route → engine | Firma pública intacta; sandbox-result write conserva TTL 60s y try/catch (no bloquea release) |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-16 | D (DoS) | sandbox-result write después del release (follower se pierde el resultado) | mitigate | onResultReady invocado por el core ANTES del finally (criterio verificado en Plan 09); test de paridad E* cubre el flujo lock sandbox |
| T-cons-17 | S (Spoofing) | unificar el contrato de error C5 por accidente | mitigate | Anti-pattern explícito; acceptance criteria exige '[Error v4]' presente y success:true en el path de error |
</threat_model>

<verification>
- SUITE_CMD verde; asserts intactos (solo setup de mocks si fue necesario, declarado).
- Gate D-11: diff = {engine-v4.ts, sandbox-adapters.ts, engine-v4-lock.test.ts (solo setup)}.
- `grep -rn "createAdminClient\|@supabase" src/lib/agents/somnio-v4/sandbox-adapters.ts` = 0.
</verification>

<success_criteria>
- engine-v4 wrapper <450 líneas consumiendo el mismo runTurn que prod.
- Capabilities sandbox C1-C6 en el adapter; prod-only ausentes (paridad actual exacta: sin 6a/crash-recovery/no-rep en sandbox).
- Suite de paridad E1..E10 verde sin asserts cambiados.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/11-SUMMARY.md`.
</output>
