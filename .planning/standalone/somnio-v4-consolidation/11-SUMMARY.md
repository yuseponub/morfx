---
phase: somnio-v4-consolidation
plan: 11
subsystem: somnio-v4
tags: [D-04, D-05, D-07, wave-8, engine-wrapper, sandbox-adapters, core-consumer, C1-C6, parity-by-construction]

# Dependency graph
requires:
  - phase: somnio-v4-consolidation/09
    provides: "core/turn-orchestrator.ts (runTurn) + core/types.ts (TurnCoreAdapters/TurnResult/CoreSeedState) — el engine sandbox los consume"
  - phase: somnio-v4-consolidation/10
    provides: "v4-production-runner.ts como WRAPPER del core (B1-B11) — reference implementation del wrapper sandbox; contrato getSeedState(carry) + CoreSeedState.visionContext pinneados"
provides:
  - "engine-v4.ts reescrito como WRAPPER del core (768→330 líneas): construye los TurnCoreAdapters de memoria (createSandboxAdapters) + mapea TurnResult → V4EngineOutput. SEGUNDO consumidor del core (D-04 demostrado por construcción — el bug-class 2026-05-28 dropOwnEntry/carryState es estructuralmente imposible: el mecanismo es código único)"
  - "sandbox-adapters.ts (createSandboxAdapters): send sintético NDJSON (loop CKPT-7.N + pacing + onMessage progressive-reveal) + getSeedState memoria + carryState + beforeAgentInvoke timing + onResultReady (write sandbox-result ANTES del release). NO implementa los métodos prod-only → el core salta esas ramas = paridad actual exacta (D-07)"
  - "Paridad prod↔sandbox POR CONSTRUCCIÓN: ambos lados corren el MISMO runTurn parametrizado solo por TurnCoreAdapters. INTERRUPTION-PARITY.md deja de ser contrato de disciplina (su reducción es el Plan 12)"
affects: [Plan 12 reducción de INTERRUPTION-PARITY.md a "solo diferencias de adapters" + docs sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "wrapper-over-core (sandbox side): el engine sandbox NO contiene mecanismo (restart loop / Path A/B / heartbeat / finally / loop sintético CKPT-7.N) — todo vive en runTurn + sandbox-adapters. El engine solo construye adapters de memoria + mapea TurnResult → V4EngineOutput"
    - "mapResult-as-callback: createSandboxAdapters recibe mapResult(TurnResult): SandboxResultPayload; onResultReady lo aplica sobre el TurnResult FINAL para escribir sandbox-result ANTES del release; el wrapper usa EL MISMO mapper para su retorno → lo escrito == lo retornado (sin setter chicken-and-egg)"
    - "send-prep template synthesis: cuando output.templates está vacío pero output.messages no (forma sandbox del outbound), el core sintetiza un template por mensaje (ids sandbox-msg:* excluidos de templates_enviados como rag:*) → el MISMO send-loop funciona en ambos lados sin tocar el agente. En prod inalcanzable (templates siempre presente) = byte-equivalente"
    - "carryState Path B = unión dedup (seed ∪ actuallySentIds ∪ output.templatesEnviados): cubre prod (señal vía actuallySentIds, agent mock no setea output.templatesEnviados) y sandbox (señal vía output.templatesEnviados, ids sintéticos filtrados de actuallySentIds) sin re-saludo"

key-files:
  created:
    - src/lib/agents/somnio-v4/sandbox-adapters.ts
    - .planning/standalone/somnio-v4-consolidation/11-SUMMARY.md
  modified:
    - src/lib/agents/somnio-v4/engine-v4.ts
    - src/lib/agents/somnio-v4/core/turn-orchestrator.ts

key-decisions:
  - "mapResult callback en vez de setResult setter: el payload final del sandbox-result depende del TurnResult que runTurn retorna, pero onResultReady corre DENTRO de runTurn (antes del release). Pasar un mapper (TurnResult → V4EngineOutput) a createSandboxAdapters resuelve el chicken-and-egg: onResultReady mapea el TurnResult neutral, el wrapper usa el mismo mapper para su retorno. Garantiza escrito == retornado"
  - "Template synthesis en el core (no en el adapter): el agente sandbox surface output.messages SIN output.templates (forma histórica del engine-v4). El core es quien construye el SendBlock desde output.templates → si NO hay templates pero SÍ messages, sintetiza un template por mensaje. Vive en el core (no en el adapter) porque es el core quien arma el block; en prod es inalcanzable (templates siempre presente) → cero impacto. NO contradice D-14 (que borró el fallback que enviaba SIN pasar por el send-adapter; aquí los sintéticos SÍ pasan por adapters.send con CKPT-7.N)"
  - "El test engine-v4-lock.test.ts NO necesitó ningún cambio de setup: los vi.mock interceptan por los MISMOS specifiers absolutos que el core reusa (redis-client/observability/checkpoints/somnio-v4-agent). Task 3 quedó solo como verificación (sin commit) — 0 asserts cambiados, 0 setup cambiado"

requirements-completed: [D-04, D-05]

# Metrics
duration: ~25min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 11: engine-v4 → wrapper del core (D-04/D-05) Summary

**One-liner:** `engine-v4.ts` pasa de 768 a 330 líneas reescrito como SEGUNDO consumidor del core de turno v4 — construye los `TurnCoreAdapters` de memoria vía `createSandboxAdapters` (nuevo `sandbox-adapters.ts`, 259 líneas: `send` sintético NDJSON que absorbe el loop CKPT-7.N + pacing per-template + `onMessage` progressive-reveal y retorna el MISMO contrato `{messagesSent, interrupted, interruptedAtIndex}` que prod → el core maneja el interrupted POST-HOC en UN solo lugar; `getSeedState(carry)` desde `input.state` en memoria + carryState aplicado; `beforeAgentInvoke` = thinking-sleep `simulateProdTimingMs` solo en iteration 0; `onResultReady` = write `sandbox-result:{id}` a Redis ANTES del release, Pitfall 5; NO implementa `commitTurn`/pending-templates/`getLegacyPendingMessage`/`savePathARollback`/`filterOutbound`/`preloadOnce`/`recordDebug` → el core salta esas ramas = paridad actual exacta sin CKPT-6a/crash-recovery/no-rep, D-07) y mapea el `TurnResult` neutral a `V4EngineOutput` (C2 build SandboxState + limpieza keys `_v3:` stale, C3 build DebugTurn completo con `shouldCreateOrder:false` literal, C5 contrato error sandbox INTENCIONAL `success:true` + `[Error v4]`); tras este plan la **paridad prod↔sandbox es POR CONSTRUCCIÓN** (ambos lados corren el MISMO `runTurn`, el bug-class 2026-05-28 dropOwnEntry/carryState es estructuralmente imposible) — suite canónica **353 passed | 7 skipped | 0 failed con asserts INTACTOS**, tsc exit 0, firma pública de `SomnioV4Engine` sin cambios → `app/api/sandbox/process/route.ts` intacto.

## Lo que se hizo

### Task 1 — sandbox-adapters.ts (commit `119e95c1`)

- **`createSandboxAdapters(args): { adapters: TurnCoreAdapters }`** — el "lado falso" de producción como adapters del mismo contrato:
  - `send(block)`: loop sintético CKPT-7.N (`runCheckpointGate` con `lostLockLabel: ckpt_7_pre_template_${i}`) + pacing per-template `simulateProdTimingMs` (skip i=0) + `onMessage` progressive-reveal post-checkpoint. Retorna `{messagesSent, interrupted, interruptedAtIndex}` — el adapter NO drena ni setea carryState (el core lo hace post-hoc, A12). `lostLock` → `LostLockError` burbujea al catch externo del core (zombie_exit).
  - `getSeedState(carry)`: `input.state` en memoria mapeado a `CoreSeedState` + `carry ?? state` (Path B reprocess) — resuelve la deuda heredada 08/09 (builder de carryState parametrizado vía getSeedState).
  - `beforeAgentInvoke(iter)`: thinking-sleep `simulateProdTimingMs` SOLO en iteration 0 (paridad actual — no doblar la latencia past la ventana del follower).
  - `onResultReady(result)`: aplica `args.mapResult(result)` (V4EngineOutput) y escribe `sandbox-result:{id}` (TTL 60s, try/catch + console.error) ANTES del release del core.
- Gate: tsc exit 0; `ckpt_7_pre_template`≥1 (3); prod-only capabilities=0; `sandbox-result`≥1 (8); `createAdminClient`/`@supabase`=0 (Regla 3).

### Task 2 — engine-v4 wrapper + fixes de paridad en el core (commit `2cfd867e`)

- **`SomnioV4Engine.processMessage`** = build `coreInput` (TurnCoreInput, SIN tipos de WhatsApp) → `createSandboxAdapters({..., mapResult})` → `runTurn(coreInput, adapters)` → `mapResult` (mismo mapper que onResultReady).
- **`mapResult(result, input, timestamp)`** (privado): `zombie_exit` → `{success:false, code:V4_ZOMBIE_LAMBDA_EXIT}`; `error` → C5 `{success:true, messages:['[Error v4] '+msg], code:V4_ENGINE_ERROR}`; `completed` → V4EngineOutput (C2 SandboxState con casts de frontera + delete `_v3:` keys + C3 DebugTurn completo intent/tokens=`result.totalTokens`/orchestration `shouldCreateOrder:false`/salesTrack/responseTrack/subLoop/timerSignals).
- BORRADO del engine: `while`, drains, ckpts, heartbeat, finally, write sandbox-result inline, loop sintético — todo vive en el core / sandbox-adapters.
- Gate: tsc exit 0; runTurn=6; forbidden(`while`/drain/ckptGate/heartbeat/release)=0; `[Error v4]`≥1 (4); wc=330 (<450); diff sin `src/lib/sandbox/types.ts` ni `route.ts`.

### Task 3 — suite de paridad verde con asserts intactos (verificación, sin commit)

- `engine-v4-lock.test.ts` (E1..E10) + `restart-loop.test.ts` verdes SIN tocar — los vi.mock interceptan por los MISMOS specifiers absolutos que el core reusa (Pitfall 8). **0 cambios al archivo de test** (ni asserts ni setup).
- SUITE_CMD completo: **353 passed | 7 skipped | 0 failed**; tsc exit 0.

## Deviations from Plan

### Auto-fixed Issues (todas en core/turn-orchestrator.ts — gaps de paridad que la extracción del Plan 09/10 introdujo, fijados preservando byte-equivalencia prod)

**1. [Rule 1 - Parity] at_step del send-loop derivado de interruptedAtIndex**
- **Found during:** Task 1 (las suites E5/E6/E10 asertan `at_step: ckpt_7_pre_template_${i}`)
- **Issue:** el core hardcodeaba `atStep: 'send_loop_ckpt7'` en el drain del send-loop. Las suites de paridad sandbox asertan el discriminador per-template (`ckpt_7_pre_template_0` / `_1`). Ningún test de prod aserta este at_step (la extracción del Plan 09/10 lo dropeó sin que ningún gate lo detectara).
- **Fix:** `atStep = \`ckpt_7_pre_template_${sendResult.interruptedAtIndex ?? sendResult.messagesSent}\`` — el send-adapter (prod `messaging.send` + sandbox loop sintético) ya retorna `interruptedAtIndex`; el core lo deriva.
- **Files:** core/turn-orchestrator.ts
- **Commit:** 119e95c1

**2. [Rule 1/2 - Parity] send-prep sintetiza templates de output.messages cuando output.templates vacío**
- **Found during:** Task 2 (8 fails: result.messages vacío — el agente sandbox surface output.messages SIN output.templates; el core solo enviaba output.templates)
- **Issue:** el core construye el SendBlock desde `output.templates`. El agente sandbox surface `output.messages` SIN templates estructurados (forma histórica del engine-v4 que iteraba output.messages directo). Con templates vacío, el core no enviaba nada → result.messages vacío.
- **Fix:** si `output.templates` vacío pero `output.messages` no, el core sintetiza un template por mensaje (ids `sandbox-msg:${i}` excluidos de templates_enviados como `rag:*`). En PROD inalcanzable (templates siempre presente post rag:* passthrough) → byte-equivalente. NO contradice D-14 (que borró el fallback que enviaba SIN pasar por el send-adapter; aquí los sintéticos SÍ pasan por adapters.send con CKPT-7.N).
- **Files:** core/turn-orchestrator.ts
- **Commit:** 2cfd867e

**3. [Rule 1 - Parity] CKPT-6b at_step emitido 'ckpt_6_pre_send_loop' (sin sufijo _main)**
- **Found during:** Task 2 (E4 aserta `at_step === 'ckpt_6_pre_send_loop'`; el core emitía `_main`)
- **Issue:** el core emitía `atStep: 'ckpt_6_pre_send_loop_main'` en el drain de CKPT-6b (sufijo del runner para disambiguar de 6a). El engine sandbox viejo emitía `'ckpt_6_pre_send_loop'` (sin 6a). Ningún test de prod aserta este at_step; sandbox E4 lo exige.
- **Fix:** at_step EMITIDO = `'ckpt_6_pre_send_loop'` (CheckpointId canónico); el sufijo `_main` se conserva SOLO en `lostLockLabel` (zombie at_step, independiente del emit del drain, disambigua 6a `_pending_templates` vs 6b `_main`).
- **Files:** core/turn-orchestrator.ts
- **Commit:** 2cfd867e

**4. [Rule 1 - Parity] Path B carryState.templatesEnviados = unión dedup de 3 fuentes**
- **Found during:** Task 2 (E10 aserta iter2 `templatesEnviados:['saludo_core']`; prod pathb aserta `toContain('t-saludo')`)
- **Issue:** el core usaba `[...seed.templatesEnviados, ...actuallySentIds]`. Para sandbox los ids sintéticos `sandbox-msg:*` se filtran de actuallySentIds → carryState vacío → re-saludo. Para prod el agent mock no setea output.templatesEnviados → actuallySentIds es la única señal. Las dos formas son irreconciliables con una sola fuente.
- **Fix:** unión dedup `Set([...seed.templatesEnviados, ...actuallySentIds, ...output.templatesEnviados])`. Cubre prod (`['t-saludo']` vía actuallySentIds) y sandbox (`['saludo_core']` vía output.templatesEnviados) sin re-saludo. Solo en carrySource='output' (send-loop); el de CKPT-6b carrySource='seed' queda intacto (A14).
- **Files:** core/turn-orchestrator.ts
- **Commit:** 2cfd867e

---

**Total deviations:** 4 (todas Rule 1/2 — gaps de paridad sandbox que la extracción del Plan 09/10 introdujo, fijados en el core preservando byte-equivalencia prod verificada por las suites del runner). Cero scope creep. **Cero asserts cambiados** en ningún test (ni sandbox ni prod). El archivo `engine-v4-lock.test.ts` listado en el plan NO se tocó (los mocks interceptan por specifier absoluto sin ajuste).

## must_haves — truths verificadas

- ✅ "engine-v4.ts es un wrapper del MISMO core que producción — el sandbox es 'producción con adapters falsos' por construcción" → 330 líneas, runTurn=6, 0 mecanismo (while/drain/ckptGate/heartbeat/release).
- ✅ "El loop sintético CKPT-7.N + pacing + onMessage viven en el send-adapter sandbox y retornan el MISMO contrato {messagesSent, interrupted, interruptedAtIndex} que prod" → sandbox-adapters.ts `send`.
- ✅ "El sandbox NO implementa getPendingTemplates/getLegacyPendingMessage/filterOutbound/commitTurn → esas ramas del core se saltan = paridad actual exacta" → grep prod-only=0 en sandbox-adapters.ts.
- ✅ "El write sandbox-result:{id} ocurre vía onResultReady ANTES del release del lock (Pitfall 5)" → el core invoca onResultReady en el try externo, antes del finally-release (verificado Plan 09); E1/E7 verdes.
- ✅ "El contrato de error sandbox (success:true + '[Error v4] ...') se conserva — C5 INTENCIONAL" → `[Error v4]`≥1 en engine-v4.ts; mapResult kind:'error' → success:true.
- ✅ "Suite engine-v4-lock (paridad E1..E10) verde con asserts intactos" → 11 tests verdes, 0 expect modificados.

## Verificación

- `npx tsc --noEmit` exit 0 tras cada task.
- SUITE_CMD: **353 passed | 7 skipped | 0 failed** (= baseline canónico Plan 09/10). Cero asserts cambiados (`git diff -U0 engine-v4-lock.test.ts | grep expect( | wc -l` = 0; el archivo NO se tocó).
- Parity cross-check: las 4 suites de paridad (sandbox engine-v4-lock E1..E10 + prod runner restart/pathb + restart-loop) corren contra el MISMO `runTurn` y pasan juntas (25/25) — D-04 demostrado por construcción.
- Regla 3: `grep -rn "createAdminClient\|@supabase" src/lib/agents/somnio-v4/sandbox-adapters.ts` = 0.
- Regla 6 (Gate D-11): mis 2 commits tocan EXACTAMENTE {engine-v4.ts, sandbox-adapters.ts, core/turn-orchestrator.ts}. AUSENTES del diff: webhook-processor.ts, messaging.ts, v3-production-runner.ts, godentist/recompra/pw-confirmation, v4-messaging-adapter.ts, route.ts, src/lib/sandbox/types.ts, interruption-system-v2/. 11 event labels gate verde.
- Firma pública de `SomnioV4Engine.processMessage(input: V4EngineInput): Promise<V4EngineOutput>` sin cambios → route.ts intacto.

## Commits

| Commit | Tipo | Descripción |
|--------|------|-------------|
| `119e95c1` | feat | sandbox-adapters.ts — send sintético CKPT-7.N + memoria + onResultReady (C1-C6) + Rule 1 at_step per-template en el core |
| `2cfd867e` | refactor | engine-v4 reescrito como wrapper del core — paridad por construcción + Rule 1/2 (synthesis + 6b at_step + carryState unión) |

## Next Phase Readiness

- **Plan 12 (reducción de INTERRUPTION-PARITY.md + docs sync, D-07):** la paridad de mecanismo ahora es código único (`runTurn`) — INTERRUPTION-PARITY.md deja de ser contrato de disciplina de paridad y debe reducirse a documentar SOLO las diferencias legítimas de adapters (envío real vs stream NDJSON, DB vs memoria, timing real vs simulado, CKPT-6a/crash-recovery/no-rep prod-only que el sandbox no implementa). El §6 caveat RAG-send ya está marcado OBSOLETO. ARCHITECTURE.md sync pendiente.
- **Nota:** un commit concurrente de otra sesión (`95591f6c` vivificacion-v3 CSS, fuera de scope) landeó en el branch DESPUÉS de mis 2 commits — no toca mis archivos ni afecta este plan.

## Self-Check: PASSED

- 2/2 archivos clave del artifact existen (sandbox-adapters.ts con createSandboxAdapters; engine-v4.ts con runTurn)
- 2/2 commits verificados en git log (`119e95c1`, `2cfd867e`)
- key_links verificados: engine-v4.ts → core/turn-orchestrator.ts vía `runTurn` (grep=6); sandbox-adapters onResultReady → redis `sandbox-result` (grep≥1)
- 0 deletions de archivos en los 2 commits (engine-v4.ts reescrito in-place; sandbox-adapters.ts creado; core editado)

---
*Phase: somnio-v4-consolidation*
*Plan: 11*
*Completed: 2026-06-10*
