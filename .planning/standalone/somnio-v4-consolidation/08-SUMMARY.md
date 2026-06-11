---
phase: somnio-v4-consolidation
plan: 08
subsystem: somnio-v4
tags: [D-03, drain-consolidation, restart-context, wave-5, core, refactor, Pitfall-6, Pitfall-7]

# Dependency graph
requires:
  - phase: somnio-v4-consolidation/07
    provides: "core/checkpoint-gate.ts (runCheckpointGate + CHECKPOINT_PLACEMENTS) adoptado por los 4 consumidores; inventario de los 8 checkpoint sites + 12 drain sites"
provides:
  - "core/restart-context.ts — struct ÚNICO RestartContext (acumuladores cross-iteración) + createRestartContext + dropOwnEntry; carrySource dual codificado (Pitfall 6)"
  - "core/drain.ts — drainPendingAndCombine() consolida los 12 drain-sites (7 runner + 5 engine) en UN solo lugar; invariantes lockeadas (clearInterrupt SIEMPRE, orden cronológico, restartIteration++, shouldRestart)"
  - "Runner + engine drenan por un único camino; el bug-fix tipo 2026-05-28 se toca en UN lugar (no dos)"
  - "core/__tests__/drain.test.ts — 7 tests unitarios ADITIVOS del drain"
affects: [Plan 09 turn-orchestrator extraction, Plan 10 engine-v4 rewrite as sandbox wrapper, Plan 11-12 de somnio-v4-consolidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Struct-de-acumuladores: ~7 variables locales `let` duplicadas byte-por-byte en runner+engine → 1 struct RestartContext con factory zero-value (createRestartContext)"
    - "drain-único-con-mode: drainPendingAndCombine(mode 'path_a' | 'path_b_solo') — los sites con drain físico compartido entre Path A/B (runner send-loop, engine CKPT-7.N) eligen el mode dinámicamente → 1 llamada física por drain compartido"
    - "carrySource explícito en el tipo (Pitfall 6): 'seed' (CKPT-6b — output de msg1 NO se envió) vs 'output' (send-loop/CKPT-7.N — msg1 parcialmente enviado). El drain NO toca carryState; el CALLER setea la fuente correcta"
    - "pathBEmitExtra param: replica byte-exacto los payloads extra del site (templates_sent_before_abort) sin que el helper conozca la semántica de cada site"

key-files:
  created:
    - src/lib/agents/somnio-v4/core/restart-context.ts
    - src/lib/agents/somnio-v4/core/drain.ts
    - src/lib/agents/somnio-v4/core/__tests__/drain.test.ts
    - .planning/standalone/somnio-v4-consolidation/08-SUMMARY.md
  modified:
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/somnio-v4/engine-v4.ts

key-decisions:
  - "D-03/D-04: core extraído del runner (fuente de verdad). Nombres de campo del struct copiados del runner; el engine renombra accumulatedSentMessages → ctx.accumulatedSentContents (A6 — shape idéntico)"
  - "RestartContext.carryState usa el shape del runner (CarryState). El engine MANTIENE su carryState local como SandboxState (shape sandbox-específico con PackSelection + ingestStatus) — los shapes difieren genuinamente; solo ctx.carrySource viaja al struct para registrar la intención de paridad (Pitfall 6). Esto NO viola D-03: el acumulador de tokens/iteration/effectiveMessage/accumulatedSentContents SÍ se consolida; carryState es el único campo con shape divergente legítimo"
  - "12 drain-sites lógicos → 10 llamadas físicas a drainPendingAndCombine (6 runner + 4 engine). Razón: 2 sites con drain FÍSICO compartido entre Path A y Path B (runner send-loop, engine CKPT-7.N) ya tenían UN solo readAndClearPending+clearInterrupt que servía a ambos branches; colapsarlos a 1 llamada con mode dinámico es la representación byte-correcta (no se puede ni se debe duplicar el drain). El plan contaba 7+5=12 sitios LÓGICOS; el código tenía 10 drains FÍSICOS"
  - "carrySource se setea SOLO en los 2 Path B reales del runner (seed en CKPT-6b, output en send-loop) + el 1 Path B del engine (output en CKPT-7.N). Los Path A no tocan carrySource (queda null)"

requirements-completed: [D-03]

# Metrics
duration: ~50min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 08: drain consolidation (D-03) Summary

**One-liner:** `core/restart-context.ts` (struct ÚNICO de acumuladores cross-iteración con `carrySource` dual codificado) + `core/drain.ts` (`drainPendingAndCombine()` que consolida la secuencia repetida 12 veces de drenar-pending+consumir-interrupt+emitir+recombinar) reemplazan in-place ~7 variables locales duplicadas y 10 drains copy-paste en runner+engine; tras este plan el bug-fix tipo 2026-05-28 (dropOwnEntry/carryState) se toca en UN solo lugar — suite canónica 353 passed | 7 skipped | 0 failed (346 baseline + 7 drain tests aditivos), cero asserts de comportamiento cambiados.

## Lo que se hizo

### Task 1 — core/restart-context.ts + core/drain.ts + drain.test.ts (commit `c09f1889`)

- **`restart-context.ts`**: `RestartContext` (totalTokensAcrossRestarts, restartIteration, effectiveMessage, templatesSentCount, carryState, **carrySource** 'seed'|'output'|null, accumulatedSentContents, shouldRestart, ownEntryUuid) + `createRestartContext(ownPendingEntryJson?)` (parse try/catch byte-copy del runner; `shouldRestart: true` zero-value que matchea el `while` inicial) + `dropOwnEntry(ctx, entries)` (filtro por entry_uuid). `CarryState` interface = shape del runner (D-04). Pitfall 6 codificado en `carrySource` + el comentario del tipo.
- **`drain.ts`**: `drainPendingAndCombine({ ctx, lockCtx, atStep, priorMsg, mode, pathBEmitExtra? })`. Secuencia EXACTA lockeada: (a) `dropOwnEntry(readAndClearPending)`, (b) `clearInterrupt` SIEMPRE (bug-fix 2026-05-28), (c) `restartIteration++`, (d) emit + combine cronológico priorMsg-primero (path_a) o solo-lo-nuevo (path_b_solo), (e) `shouldRestart=true`. Path B emite `msg_aborted_path_b_solo` SIEMPRE + `pending_list_combined` SOLO si pending>0 (gate que los 3 sites reales ya tenían). Specifiers absolutos `@/lib/agents/interruption-system-v2/*` (Pitfall 8). NO toca carryState/carrySource (el caller lo hace).
- **`drain.test.ts`**: 7 tests aditivos (orden cronológico priorMsg-primero, clearInterrupt SIEMPRE tras read vía invocationCallOrder, dropOwnEntry filtra own-entry, path_b sin prior, restartIteration++/shouldRestart, ambos eventos path_a, path_b pending-vacío no reinicia). Mock de los mismos specifiers absolutos.
- Gate D-09: tsc exit 0 + drain.test 7/7 verde. Regla 3 en core/: 0 createAdminClient/@supabase.

### Task 2 — runner adopta el core (commit `655850ef`)

- Variables locales → `const ctx = createRestartContext(input.ownPendingEntryJson)`; `while (ctx.shouldRestart)`; todas las referencias a `ctx.*`.
- 5 sites Path A + 2 sites Path B consolidados (ver mapa abajo). El send-loop (drain físico compartido A/B) usa 1 llamada con `mode` elegido por `sendResult.messagesSent`.
- Pitfall 7 preservado: el drain de CKPT-0 usa `priorMsg: ctx.effectiveMessage ?? input.message` ANTES del combine legacy `_v3:pendingUserMessage` (no reordenado).
- Pitfall 6 preservado: `ctx.carrySource = 'seed'` en CKPT-6b Path B, `'output'` en send-loop Path B; carryState seteado en el caller con la fuente correcta.
- Gate D-09: tsc exit 0; v4-production-runner-restart (3) + pathb (5) verdes sin asserts cambiados; SUITE_CMD 353 passed.

### Task 3 — engine adopta el core (commit `1af5c49c`)

- Mismo procedimiento: `createRestartContext`, `ctx.*`, `accumulatedSentMessages → ctx.accumulatedSentContents` (A6).
- 4 sites Path A + 1 site Path B consolidados. El CKPT-7.N (drain físico compartido A/B) usa 1 llamada con `mode` elegido por `i` (i===0 → path_a, i>0 → path_b_solo).
- `carrySource = 'output'` (engine SOLO tiene la variante output — A14; no se inventa la seed). `carryState` local queda como `SandboxState` (shape sandbox-específico — los campos extra PackSelection/ingestStatus difieren del CarryState del runner; consolidar el shape rompería el cast de frontera v4→SandboxState de Regla 6).
- Gate D-09: tsc exit 0; engine-v4-lock (11) + restart-loop (6) verdes sin asserts cambiados; SUITE_CMD 353 passed.

## Mapa final site → mode → carrySource (insumo Plan 09)

| # | Lado | Site | at_step | mode | carrySource | priorMsg | Llamada física |
|---|------|------|---------|------|-------------|----------|----------------|
| 1 | runner | CKPT-0 | `ckpt_0_post_acquire` | path_a | — (null) | `ctx.effectiveMessage ?? input.message` (Pitfall 7) | drain #1 |
| 2 | runner | discriminator | `output.errorMessage` | path_a | — | `turnEffectiveMessage` | drain #2 |
| 3 | runner | CKPT-6a | `ckpt_6_pre_send_loop_pending_templates` | path_a | — | `turnEffectiveMessage` | drain #3 (extra `templates_sent_before_abort:0`) |
| 4 | runner | CKPT-6b Path A | `ckpt_6_pre_send_loop_main` | path_a | — | `turnEffectiveMessage` | drain #4 (extra `:0`) |
| 5 | runner | CKPT-6b Path B | `ckpt_6_pre_send_loop_main` | path_b_solo | **seed** | `turnEffectiveMessage` | drain #5 (extra `templates_sent_before_abort:sentCount`) |
| 6 | runner | send-loop Path A | `send_loop_ckpt7` | path_a | — | `turnEffectiveMessage` | drain #6 (mode dinámico) |
| 7 | runner | send-loop Path B | `send_loop_ckpt7` | path_b_solo | **output** | `turnEffectiveMessage` | drain #6 (MISMA llamada, mode dinámico por `sendResult.messagesSent`) |
| 8 | engine | CKPT-0 | `ckpt_0_post_acquire` | path_a | — | `turnEffectiveMessage` | drain #7 |
| 9 | engine | discriminator | `output.errorMessage` | path_a | — | `turnEffectiveMessage` | drain #8 |
| 10 | engine | CKPT-6 | `ckpt_6_pre_send_loop` | path_a | — | `turnEffectiveMessage` | drain #9 (extra `:0`) |
| 11 | engine | CKPT-7.0 (i===0) | `ckpt_7_pre_template_0` | path_a | — | `turnEffectiveMessage` | drain #10 (mode dinámico) |
| 12 | engine | CKPT-7.N (i>0) | `ckpt_7_pre_template_${i}` | path_b_solo | **output** (A14) | `turnEffectiveMessage` | drain #10 (MISMA llamada, mode dinámico por `i`) |

**12 sitios lógicos → 10 llamadas físicas a `drainPendingAndCombine` (6 runner + 4 engine).** Los pares (6,7) en el runner y (11,12) en el engine comparten UN drain físico (un solo `readAndClearPending`+`clearInterrupt` que ya servía a ambos branches Path A/B en el código original) → 1 llamada con `mode` dinámico cada uno. Cero `readAndClearPending` directo fuera de `core/drain.ts` en runner/engine (verificado: las 4 menciones restantes son comentarios).

**Notas para Plan 09 (turn-orchestrator):**
- El while-loop del runner ya está delgado: `while (ctx.shouldRestart) { ctx.shouldRestart = false; ...; continue }`. La extracción del orquestador es ahora un MOVE del cuerpo, no un rewrite.
- `carryState` es el único campo NO consolidado al struct (shape divergente runner CarryState vs engine SandboxState). Plan 09/10 debe decidir si el orquestador genérico parametriza el shape de carryState vía el adapter (el engine pasa su builder SandboxState, el runner el CarryState). `carrySource` SÍ vive en el struct para que el orquestador sepa la fuente sin conocer el shape.
- El `at_step` `send_loop_ckpt7` (runner) NO es un `CheckpointId` (vive en el send-adapter `V4MessagingAdapter.shouldAbortBeforeTemplate`); el drain lo emite verbatim. Igual `ckpt_7_pre_template_${i}` en el engine (loop sintético).

## Deviations from Plan

### Auto-fixed Issues / decisiones de implementación

**1. [Rule 3 - Blocking] 12 sitios LÓGICOS → 10 llamadas FÍSICAS (send-loop + CKPT-7.N comparten drain)**
- **Found during:** Task 2 (runner send-loop) + Task 3 (engine CKPT-7.N)
- **Issue:** el acceptance literal pedía `grep -c "drainPendingAndCombine" runner = 7` y `engine = 5`. Pero el código original tiene en el runner send-loop UN solo `readAndClearPending`+`clearInterrupt` (línea ~756-759) que servía a AMBOS branches (Path A si `messagesSent===0`, Path B si `≥1`); idéntico en el engine CKPT-7.N (un drain en línea ~400, branches `i===0`/`i>0`). Duplicar el drain para tener 2 llamadas separadas re-leería la pending list dos veces (incorrecto).
- **Fix:** 1 llamada con `mode` elegido dinámicamente (`sendResult.messagesSent===0 ? 'path_a' : 'path_b_solo'` en el runner; `i===0 ? 'path_a' : 'path_b_solo'` en el engine). Resultado: 6 llamadas runner + 4 engine = 10. La intención semántica (12 sitios consolidados, cero drain copy-paste, 0 `readAndClearPending` directo) se cumple 100%; el número literal "7"/"5" del acceptance contaba sitios lógicos, no llamadas físicas.
- **Files:** v4-production-runner.ts, engine-v4.ts
- **Commits:** 655850ef, 1af5c49c

**2. [Rule 1 - Type] carryState del engine queda como SandboxState local, no en el struct**
- **Found during:** Task 3
- **Issue:** `RestartContext.carryState` usa el shape del runner (`CarryState`: packSeleccionado string|null, turnLedgerDims requerido). El engine usa `carryState: SandboxState | null` (PackSelection, turnLedgerDims opcional, ingestStatus). Forzar el engine a usar `ctx.carryState` rompería el cast de frontera v4→SandboxState (Regla 6 — SandboxState es compartido con sandbox v3).
- **Fix:** el engine MANTIENE `carryState` como variable local SandboxState; consolida al struct todo lo demás (tokens/iteration/effectiveMessage/templatesSentCount/accumulatedSentContents/shouldRestart/ownEntryUuid). `ctx.carrySource = 'output'` SÍ viaja al struct para registrar la intención de paridad. D-03 se cumple (los acumuladores se consolidan); carryState es el único campo con shape divergente legítimo (documentado para Plan 09).
- **Files:** engine-v4.ts
- **Commit:** 1af5c49c

---

**Total deviations:** 2 (ambas decisiones de implementación que preservan la semántica byte-equivalente; cero scope creep, cero asserts cambiados).
**Impact:** 12 drain-sites consolidados (10 llamadas físicas), 0 `readAndClearPending` directo en runner/engine, struct único para los acumuladores, carrySource dual codificado.

## Verificación

- `npx tsc --noEmit` exit 0 tras cada task.
- SUITE_CMD: **353 passed | 7 skipped | 0 failed** (= 346 baseline canónico Wave 1 + 7 drain tests aditivos), cero asserts de comportamiento cambiados.
- Task 1: drain.test 7/7 verde; restart-context exports=4, drain export=1 (artifact declara 1 — `drainPendingAndCombine`); `clearInterrupt` DESPUÉS de `readAndClearPending` en el flujo; `priorMsg, ...pending`=1; `carrySource`=2 (codificado); Regla 3 en core/=0.
- Task 2: `await drainPendingAndCombine` runner=6; `readAndClearPending` directo (no-comentario)=0; `createRestartContext` call=1; `carrySource = 'seed'`=1; `carrySource = 'output'`=1; restart+pathb verdes sin asserts.
- Task 3: `await drainPendingAndCombine` engine=4; `readAndClearPending` directo=0; `accumulatedSentMessages` (variable)=0; engine-v4-lock + restart-loop verdes sin asserts.
- Gate D-11: `git diff --name-only c09f1889~1..HEAD -- src/` = exactamente los 5 archivos del plan (core/restart-context + core/drain + core/__tests__/drain.test + v4-production-runner + engine-v4). messaging.ts / v3-production-runner / godentist / recompra / pw-confirmation ausentes (Regla 6).

## Commits

| Commit | Tipo | Descripción |
|--------|------|-------------|
| `c09f1889` | feat | core/restart-context + core/drain — consolida la secuencia de 12 drain-sites |
| `655850ef` | refactor | runner adopta RestartContext + drainPendingAndCombine (7 sites lógicos, semántica idéntica) |
| `1af5c49c` | refactor | engine adopta RestartContext + drainPendingAndCombine (5 sites lógicos) |

## Next Phase Readiness

- D-03 implementado: 12 drain-sites consolidados en `drainPendingAndCombine()`; el bug-fix tipo 2026-05-28 se toca en UN lugar. RestartContext es el struct único de acumuladores.
- El while-loop del runner queda delgado (`while (ctx.shouldRestart)` + drains via core) — la extracción del `turn-orchestrator.ts` (Plan 09) es un MOVE del cuerpo, no un rewrite.
- Deuda explícita para Plan 09/10: `carryState` shape divergente (runner CarryState vs engine SandboxState) — el orquestador genérico debe parametrizar el builder de carryState vía adapter; `carrySource` ya vive en el struct para que el orquestador conozca la fuente (seed/output) sin conocer el shape.

## Self-Check: PASSED

- 4/4 archivos clave existen en disco (restart-context.ts + drain.ts + drain.test.ts + este SUMMARY)
- 3/3 commits verificados en git log (`c09f1889`, `655850ef`, `1af5c49c`)
- 0 deletions de archivos en los 3 commits (solo borrado a nivel de líneas/boilerplate consolidado)

---
*Phase: somnio-v4-consolidation*
*Plan: 08*
*Completed: 2026-06-10*
