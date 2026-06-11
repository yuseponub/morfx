---
phase: somnio-v4-consolidation
plan: 07
subsystem: somnio-v4
tags: [D-06, D-03, checkpoint-gate, refactor, factorización, wave-2, helper, colocaciones]

# Dependency graph
requires:
  - phase: somnio-v4-consolidation/06
    provides: "Wave 1 cerrada + pusheada (GATE-W1 D-10 EQUIVALENTE + D-11 verde); baseline operativo 346 passed"
provides:
  - "core/checkpoint-gate.ts — runCheckpointGate helper (D-06) + CHECKPOINT_PLACEMENTS tabla declarativa"
  - "Los 8 sites de checkpoint (CKPT-0..7.N) adoptan el helper; 0 llamadas directas a checkpoint() en los 4 archivos consumidores"
  - "~200 líneas de boilerplate (skip-gate + lostLock throw + emit) eliminadas, semántica byte-equivalente"
  - "Inventario completo de los 8 sites (abajo) — insumo directo para Plan 08 (drainPendingAndCombine) y Plan 09 (extracción del core)"
affects: [Plan 08 drain consolidation, Plan 09 turn-orchestrator extraction, planes 10-11 de somnio-v4-consolidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper-envuelve-single-source: runCheckpointGate ENVUELVE checkpoint() (no lo reemplaza); el caller conserva SU builder de retorno"
    - "lostLockLabel param para preservar sufijos disambiguadores byte-exactos (ckpt_6_pre_send_loop_main, _pending_templates, ckpt_3_post_tooling_legacy_combined, ckpt_7_pre_template_${i})"
    - "interruptEmit opcional: agente/sub-loop emiten msg_aborted_path_a_combined vía el helper; runner/engine NO lo pasan (emiten en su drain)"
    - "Narrowing && lockCtx en interrupt-branches del runner/engine: no-op semántico que restaura el type-narrowing perdido al cambiar de if(lockHandle && lockCtx) a if(typeof gate === 'object')"

key-files:
  created:
    - src/lib/agents/somnio-v4/core/checkpoint-gate.ts
    - .planning/standalone/somnio-v4-consolidation/07-SUMMARY.md
  modified:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/somnio-v4/sub-loop/index.ts
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/somnio-v4/engine-v4.ts

key-decisions:
  - "D-06: helper único runCheckpointGate + CHECKPOINT_PLACEMENTS tabla declarativa; las COLOCACIONES NO se mueven (la posición ES el contrato)"
  - "LostLockError se importa de v4-messaging-adapter (NO de interruption-system-v2) — el stub del plan estaba equivocado; verificado por grep. checkpoint/CheckpointId/CheckpointOptions/LockHandle/LockChannel sí vienen de interruption-system-v2 con specifier absoluto (Pitfall 8)"
  - "El sub-loop tenía 4 sites de checkpoint() (CKPT-3/4/5 + legacy combined), no 3 — el legacy combinado (ckpt_3_post_tooling para el path legacy single-call) DEBE convertirse para satisfacer await checkpoint()=0; usa lostLockLabel ckpt_3_post_tooling_legacy_combined"
  - "El engine CKPT-7.N sintético (paridad sandbox con V4MessagingAdapter) también se convirtió al helper para satisfacer await checkpoint()=0 en engine-v4.ts; usa opts.templateIndex + lostLockLabel dinámico ckpt_7_pre_template_${i}"

requirements-completed: [D-06, D-03]

# Metrics
duration: ~40min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 07: checkpoint-gate helper (D-06) Summary

**One-liner:** `runCheckpointGate` factoriza el boilerplate repetido (~25-30 líneas/site: skip-gate + lostLock throw + emit interrupt) de los 8 checkpoints del pipeline v4 en un helper único + tabla declarativa `CHECKPOINT_PLACEMENTS`; los 4 archivos consumidores lo adoptan con CERO llamadas directas a `checkpoint()` y semántica byte-equivalente (suite canónica 346 passed | 7 skipped | 0 failed, cero asserts cambiados, las colocaciones intactas).

## Lo que se hizo

### Task 1 — core/checkpoint-gate.ts (commit `d2c52de8`)

- `runCheckpointGate(args)`: skip-gate (`no_lock` si faltan lock fields) → `checkpoint()` → lostLock throw (`LostLockError`, SIEMPRE — T-cons-08) → detección de interrupt (emit opcional + `{ interrupted: ckptId }`).
- `CheckpointGateResult = 'no_lock' | 'proceed' | { interrupted: CheckpointId }`.
- `CHECKPOINT_PLACEMENTS`: tabla declarativa `as const` de las 8 colocaciones (id + owner + position) — documentación tipada single-source (D-06, anti T-cons-09).
- Params clave del helper para preservar byte-equivalencia:
  - `interruptEmit?: Record<string, unknown>` — solo agente/sub-loop lo pasan (emiten `msg_aborted_path_a_combined` vía helper); runner/engine NO (emiten en su drain).
  - `lostLockLabel?: string` (default `ckptId`) — preserva los sufijos disambiguadores byte-exactos del `at_step` que el catch emite en `zombie_lambda_exit`.
- Specifiers absolutos `@/lib/agents/interruption-system-v2/*` (Pitfall 8 — los vi.mock interceptan por specifier). `LostLockError` importado de `@/lib/agents/engine-adapters/production/v4-messaging-adapter` (donde realmente vive).

### Task 2 — agente + sub-loop adoptan el helper (commit `b10ae95a`)

- `somnio-v4-agent.ts`: CKPT-1 y CKPT-2 vía `runCheckpointGate` con `interruptEmit { combined_msg_count: 1, total_chars: input.message.length }`; el `V4AgentOutput`-passthrough de retorno (intentsVistos/templatesEnviados/datosCapturados/packSeleccionado/accionesEjecutadas/turnLedgerDims/totalTokens/timerSignals) conservado LITERAL. Imports `checkpoint`/`emitLockEvent`/`LostLockError` borrados (sin uso); helper importado relativo (`./core/checkpoint-gate`).
- `sub-loop/index.ts`: CKPT-3/4/5 vía `buildSubLoopGateArgs(...)` + `runCheckpointGate`; el legacy combined (single-call path) vía `runCheckpointGate` con `lostLockLabel: 'ckpt_3_post_tooling_legacy_combined'`. Los `LoopOutcome` de retorno (no_match + discriminator `interrupted_at_ckpt_N`) byte-iguales. La función privada `ckptInSubLoop` se reemplazó por `buildSubLoopGateArgs` (constructor de args).
- Discriminators `interrupted_at_ckpt_*` intactos en ambos archivos.

### Task 3 — runner + engine adoptan el helper (commit `844203ca`)

- `v4-production-runner.ts`: CKPT-0/6a/6b vía `runCheckpointGate` SIN `interruptEmit`; `lostLockLabel` `_pending_templates`/`_main` preservados; los drains (readAndClearPending + dropOwnEntry + clearInterrupt + emit Path A/B + restart loop) NO se tocaron.
- `engine-v4.ts`: CKPT-0/6 + CKPT-7.N sintético vía helper; opts (`hasSentAnything`/`templateIndex`) + `lostLockLabel` dinámico preservados.
- Narrowing `&& lockCtx` añadido en las interrupt-branches (no-op semántico — el helper garantiza lock fields presentes cuando retorna `{ interrupted }`; restaura el type-narrowing perdido al cambiar de `if (lockHandle && lockCtx)` a `if (typeof gate === 'object')`).
- Suites de paridad (engine-v4-lock + v4-production-runner-restart + pathb + checkpoints) 27/27 verdes sin asserts tocados.

## Inventario de los 8 sites de checkpoint (insumo Plan 08/09)

| Site | Archivo | CheckpointId | skip-gate original | LostLockError label | interrupt emit | post-interrupt |
|------|---------|--------------|--------------------|--------------------|----------------|----------------|
| CKPT-0 | v4-production-runner.ts | `ckpt_0_post_acquire` | `input.lockHandle && lockCtx` | `ckpt_0_post_acquire` | en drain (Path A combined + pending_list_combined) | drain readAndClearPending+dropOwnEntry+clearInterrupt → effectiveMessage combine → `shouldRestart=true; continue` |
| CKPT-1 | somnio-v4-agent.ts | `ckpt_1_post_comprehension` | `lockHandle && lockChannel && lockIdentifier` | `ckpt_1_post_comprehension` | `msg_aborted_path_a_combined {combined_msg_count:1, total_chars: message.length}` | return V4AgentOutput (success:false, errorMessage `interrupted_at_ckpt_1_post_comprehension`, passthrough completo) |
| CKPT-2 | somnio-v4-agent.ts | `ckpt_2_post_state_machine` | idem | `ckpt_2_post_state_machine` | idem | return V4AgentOutput (`interrupted_at_ckpt_2_post_state_machine`) |
| CKPT-3 | sub-loop/index.ts | `ckpt_3_post_tooling` | `ctx.lockHandle && lockChannel && lockIdentifier` (vía ckptInSubLoop) | `ckpt_3_post_tooling` | `msg_aborted_path_a_combined {combined_msg_count:1, total_chars: userMessage.length}` | return LoopOutcome no_match (`interrupted_at_ckpt_3_post_tooling`) |
| CKPT-4 | sub-loop/index.ts | `ckpt_4_post_generation` | idem | `ckpt_4_post_generation` | idem | return LoopOutcome no_match (`interrupted_at_ckpt_4_post_generation`) |
| CKPT-5 | sub-loop/index.ts | `ckpt_5_post_compliance` | idem | `ckpt_5_post_compliance` | idem | return LoopOutcome no_match (`interrupted_at_ckpt_5_post_compliance`) |
| CKPT-3 legacy | sub-loop/index.ts | `ckpt_3_post_tooling` | `ctx.lockHandle && lockChannel && lockIdentifier` | `ckpt_3_post_tooling_legacy_combined` | idem | return `{ outcome: LoopOutcome no_match (`interrupted_at_ckpt_3_post_tooling_legacy_combined`), rawResult }` |
| CKPT-6a | v4-production-runner.ts | `ckpt_6_pre_send_loop` (opts `hasSentAnything:false`) | `lockHandle && lockCtx` | `ckpt_6_pre_send_loop_pending_templates` | en drain | drain → effectiveMessage combine → restart |
| CKPT-6b | v4-production-runner.ts | `ckpt_6_pre_send_loop` (opts `hasSentAnything: actuallySentIds.length>0`) | `lockHandle && lockCtx` | `ckpt_6_pre_send_loop_main` | en drain | Path A (sentCount===0 → drain+restart) vs Path B (sentCount>0 → msg_aborted_path_b_solo + drain new msgs) |
| CKPT-0 (sandbox) | engine-v4.ts | `ckpt_0_post_acquire` | `lockHandle && lockCtx` | `ckpt_0_post_acquire` | en drain | drain → effectiveMessage combine → restart |
| CKPT-6 (sandbox) | engine-v4.ts | `ckpt_6_pre_send_loop` (opts `hasSentAnything:false`) | `lockHandle && lockCtx` | `ckpt_6_pre_send_loop` | en drain | drain → restart (sandbox sentCount siempre 0 aquí) |
| CKPT-7.N (sandbox) | engine-v4.ts | `ckpt_7_pre_template` (opts `templateIndex:i, hasSentAnything:i>0`) | `lockHandle && lockCtx` | `ckpt_7_pre_template_${i}` | en drain | i===0 → Path A (drain+restart, break); i>0 → Path B (msg_aborted_path_b_solo, keep sent, re-run new msgs only) |

**Notas para Plan 08/09:**
- Los 5 drain-sites a consolidar en `drainPendingAndCombine()` (D-03): runner CKPT-0, CKPT-6a, CKPT-6b(Path A); engine CKPT-0, CKPT-6, CKPT-7.N(i===0). Todos comparten el patrón `dropOwnEntry(readAndClearPending(...)) → clearInterrupt → emit Path A combined + pending_list_combined → effectiveMessage = [priorMsg, ...pending].join('\n') → shouldRestart=true`.
- El orden CRÍTICO (Pitfall 7) del crash-recovery `_v3:pendingUserMessage` (D-18, documentado in-situ en Plan 03): el drain de CKPT-0 usa `effectiveMessage ?? input.message` ANTES del combine legacy. Preservar al consolidar.
- CKPT-6b tiene la lógica Path A/B más compleja (sentCount discriminator). CKPT-7.N sandbox replica esa bifurcación per-template. El runner CKPT-7.N real vive en `V4MessagingAdapter.shouldAbortBeforeTemplate` (NO tocado en este plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] LostLockError vive en v4-messaging-adapter, no en interruption-system-v2**
- **Found during:** Task 1 (inventario previo obligatorio)
- **Issue:** el stub del plan importaba `LostLockError` de `@/lib/agents/interruption-system-v2/lock`, pero el grep confirmó que la clase vive en `engine-adapters/production/v4-messaging-adapter.ts` (toma `string`, no `CheckpointId`; su `.ckptId` alimenta el `at_step` de `zombie_lambda_exit`).
- **Fix:** el helper importa `LostLockError` del adapter; solo `checkpoint`/`CheckpointId`/`CheckpointOptions`/`LockHandle`/`LockChannel` de interruption-system-v2 (specifier absoluto, Pitfall 8).
- **Files:** src/lib/agents/somnio-v4/core/checkpoint-gate.ts
- **Commit:** d2c52de8

**2. [Rule 3 - Blocking] El sub-loop tenía 4 sites de checkpoint(), no 3**
- **Found during:** Task 2 (inventario sub-loop)
- **Issue:** además de CKPT-3/4/5 (vía la función privada `ckptInSubLoop`), el path legacy single-call tenía un 4º `checkpoint()` directo (CKPT-3 combinado, con label disambiguador `ckpt_3_post_tooling_legacy_combined`). El acceptance del plan pedía `await checkpoint()=0` Y `runCheckpointGate=3`: incompatible salvo convertir el legacy también (lo que da 4 call sites).
- **Fix:** el legacy combined también adopta `runCheckpointGate` con `lostLockLabel: 'ckpt_3_post_tooling_legacy_combined'`. Resultado: 4 call sites en sub-loop (CKPT-3/4/5 + legacy), 0 `await checkpoint()`. La intención semántica (cero `checkpoint()` directo, todo vía helper, byte-equivalente) se cumple 100%; el número literal "3" del acceptance omitía el legacy.
- **Files:** src/lib/agents/somnio-v4/sub-loop/index.ts
- **Commit:** b10ae95a

**3. [Rule 3 - Blocking] El engine CKPT-7.N sintético también requirió conversión**
- **Found during:** Task 3 (gate `await checkpoint()=0` en engine-v4.ts)
- **Issue:** el plan listaba "CKPT-0 y CKPT-6" para engine-v4.ts (≥2), pero engine tiene además un CKPT-7.N sintético (loop per-template que da paridad con `V4MessagingAdapter.shouldAbortBeforeTemplate` del prod). El acceptance `await checkpoint()=0` forzaba convertirlo también.
- **Fix:** CKPT-7.N sintético adopta `runCheckpointGate` con `opts.templateIndex: i` + `lostLockLabel: ckpt_7_pre_template_${i}`. Resultado: 3 call sites en engine (CKPT-0/6/7.N), supera el mínimo ≥2 del plan. Path A/B break per-template intacto.
- **Files:** src/lib/agents/somnio-v4/engine-v4.ts
- **Commit:** 844203ca

**4. [Rule 1 - Type narrowing] Narrowing && lockCtx en interrupt-branches del runner/engine**
- **Found during:** Task 3 (typecheck post-edición)
- **Issue:** el `if (input.lockHandle && lockCtx)` original narrowaba `lockCtx` a non-null dentro del drain; al cambiarlo a `if (typeof gate === 'object')`, TS perdía el narrowing y los drains (que usan `lockCtx.channel`) daban TS18047 (`'lockCtx' is possibly null`).
- **Fix:** las interrupt-branches usan `if (typeof ckN === 'object' && lockCtx)`. Es un no-op semántico: el helper retorna `'no_lock'` (no `{interrupted}`) cuando faltan lock fields, así que `lockCtx` siempre es non-null al llegar al drain. Restaura el narrowing sin tocar el cuerpo del drain.
- **Files:** v4-production-runner.ts (3 sites), engine-v4.ts (3 sites)
- **Commit:** 844203ca

---

**Total deviations:** 4 auto-fixed (todas Rule 1/3 — discrepancias entre el stub/conteos literales del plan y la realidad del código, resueltas preservando la intención semántica D-06 byte-equivalente).
**Impact:** Cero scope creep. Los 4 archivos consumidores quedan con 0 `checkpoint()` directo; las colocaciones y la semántica byte-equivalentes (suite 346/7/0 sin asserts tocados).

## Verificación

- `npx tsc --noEmit` exit 0 tras cada task.
- SUITE_CMD: **346 passed | 7 skipped | 0 failed** (= baseline canónico Wave 1), cero asserts de comportamiento cambiados.
- Suites de paridad Task 3 (engine-v4-lock + restart + pathb + checkpoints): 27/27 verdes.
- Task 1: `grep -c "from '@/lib/agents/interruption-system-v2/" checkpoint-gate.ts` = 3 (≥2); relativos a interruption = 0; `grep -c "ckpt_"` = 10 (≥8); Regla 3 (createAdminClient en core/) = 0.
- Task 2: `await runCheckpointGate(` agente = 2 (CKPT-1/2); sub-loop = 4 (CKPT-3/4/5 + legacy); `await checkpoint(` agente+sub-loop = 0; `interrupted_at_` agente = 4 (≥2).
- Task 3: `await runCheckpointGate(` runner = 3 (CKPT-0/6a/6b); engine = 3 (CKPT-0/6/7.N); `await checkpoint(` runner+engine = 0.
- Gate D-11: `git diff --name-only 1046b10b..HEAD -- src/` = exactamente los 5 archivos del plan; messaging.ts / v3-production-runner / godentist / recompra / pw-confirmation ausentes (Regla 6).

## Commits

| Commit | Tipo | Descripción |
|--------|------|-------------|
| `d2c52de8` | feat | core/checkpoint-gate.ts — helper D-06 + tabla declarativa de colocaciones |
| `b10ae95a` | refactor | agente y sub-loop adoptan runCheckpointGate (CKPT-1/2/3/4/5, colocaciones intactas) |
| `844203ca` | refactor | runner y engine adoptan runCheckpointGate (CKPT-0/6a/6b, drains intactos) |

## Next Phase Readiness

- D-06 implementado: helper único + tabla declarativa; 0 llamadas directas a `checkpoint()` en los 4 archivos consumidores; colocaciones y semántica idénticas (suites de paridad lo prueban).
- El runner/engine quedan con ~200 líneas menos de boilerplate ANTES de la extracción del core (Planes 08-11). El inventario de drain-sites (tabla arriba) es insumo directo para `drainPendingAndCombine()` (Plan 08) y `turn-orchestrator.ts` (Plan 09).
- `CHECKPOINT_PLACEMENTS` es la referencia canónica de DÓNDE vive cada checkpoint — el core extraído debe respetar esas posiciones.

## Self-Check: PASSED

- 6/6 archivos clave existen en disco (checkpoint-gate.ts + 4 consumidores + este SUMMARY)
- 3/3 commits verificados en git log (`d2c52de8`, `b10ae95a`, `844203ca`)
- 0 deletions de archivos en los 3 commits (solo borrado a nivel de líneas/boilerplate)

---
*Phase: somnio-v4-consolidation*
*Plan: 07*
*Completed: 2026-06-10*
