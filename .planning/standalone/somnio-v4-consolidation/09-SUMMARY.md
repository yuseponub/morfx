---
phase: somnio-v4-consolidation
plan: 09
subsystem: somnio-v4
tags: [D-03, D-04, D-05, turn-orchestrator, core, interface-first, wave-6, extraction, OQ1, Pitfall-7, Pitfall-8]

# Dependency graph
requires:
  - phase: somnio-v4-consolidation/07
    provides: "core/checkpoint-gate.ts (runCheckpointGate) — el orquestador lo usa en CKPT-0/6a/6b"
  - phase: somnio-v4-consolidation/08
    provides: "core/restart-context.ts (RestartContext + createRestartContext) + core/drain.ts (drainPendingAndCombine) — el orquestador los consume; mapa site→modo→carrySource"
provides:
  - "core/types.ts — contratos del core: TurnCoreAdapters (send/getSeedState obligatorios + 11 capabilities opcionales), TurnCoreInput, TurnResult (discriminado neutral), CoreSeedState, SendBlock, SendResult, CommittedTurn"
  - "core/turn-orchestrator.ts — runTurn(input, adapters): el MECANISMO ÚNICO de turno v4 (restart loop + Path A/B + heartbeat + finally OQ1) extraído del runner de producción (D-04). Compila SIN consumidores"
  - "El sandbox PUEDE ser 'producción con adapters falsos' por construcción: prod y sandbox correrán el MISMO runTurn parametrizado solo por TurnCoreAdapters (Plans 10/11)"
affects: [Plan 10 runner→wrapper delgado, Plan 11 engine-v4→wrapper sandbox]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "interface-first: los contratos (types.ts) se pinnean ANTES que la implementación (orchestrator.ts) — Plan 10/11 implementan contra esto sin re-interpretar"
    - "optional-method adapter (D-05, cero flags de entorno): capabilities prod-only/sandbox-only son métodos `?:`; el core gatea por `if (adapters.metodo)` (patrón del runner :499/:580). Cero `if (isProd)`/`NODE_ENV`"
    - "TurnResult discriminado NEUTRAL (C5): el core retorna `{ kind: 'completed'|'zombie_exit'|'error' }`; los wrappers mapean a EngineOutput/V4EngineOutput (incl. la divergencia intencional del error prod success:false vs sandbox success:true)"
    - "Open Question 1 RESUELTA (A16/C4): loopBody() computa el resultado → onResultReady ANTES del finally-release → finally libera el lock. El follower del sandbox long-pollea sandbox-result y DEBE verlo antes de poder adquirir"

key-files:
  created:
    - src/lib/agents/somnio-v4/core/types.ts
    - src/lib/agents/somnio-v4/core/turn-orchestrator.ts
    - .planning/standalone/somnio-v4-consolidation/09-SUMMARY.md
  modified: []

key-decisions:
  - "D-05 (agnosticidad): types.ts y turn-orchestrator.ts NO importan canales de mensajería/NDJSON/DB. ÚNICA excepción: `LostLockError` se importa de `engine-adapters/production/v4-messaging-adapter` (donde la clase vive — Plan 07 ya lo documentó; el sibling core/checkpoint-gate.ts ya lo hace). Es un import de error-class puro (no lógica de canal), no del shape de WhatsApp. El grep literal `engine-adapters=0` del acceptance es incompatible con la realidad del código — misma deviation que Plan 07 #1"
  - "TurnCoreInput +phoneNumber +messageTimestamp (campos neutrales del send que el runner consume :721-722). NO son tipos de WhatsApp — un teléfono string + un ISO timestamp"
  - "getLegacyPendingMessage modelado como MÉTODO opcional del adapter (no campo de CoreSeedState): prod lo implementa (lee _v3:pendingUserMessage de DB), sandbox no → undefined → el core usa input.message directo. Match con el contrato sugerido del RESEARCH/PATTERNS y con el grep de la Task 2"
  - "carryState del orquestador usa el shape del runner (CarryState del struct RestartContext, Plan 08). El engine wrapper (Plan 11) seguirá teniendo su SandboxState local (shape divergente — PackSelection/ingestStatus); el orquestador solo conoce carrySource (seed/output). Deuda explícita heredada de 08-SUMMARY: el Plan 11 parametriza el builder de carryState vía el adapter getSeedState"

requirements-completed: [D-03, D-04, D-05]

# Metrics
duration: ~55min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 09: turn-orchestrator extraction (D-04/D-05) Summary

**One-liner:** `core/types.ts` pinnea los contratos del core (`TurnCoreAdapters` con `send`/`getSeedState` obligatorios + 11 capabilities opcionales en patrón optional-method, `TurnResult` discriminado neutral, `CoreSeedState`/`SendBlock`/`CommittedTurn`) y `core/turn-orchestrator.ts` extrae el `runTurn()` — el MECANISMO ÚNICO de turno v4 (restart loop A7 + Path A/B + heartbeat A2 + finally Open-Question-1) desde el while-loop del runner de producción (D-04, fuente de verdad), codificando los 7 invariantes críticos (throw A1, orden Pitfall 7, dual carryState A14, post-hoc send-interrupt A12, continue-sin-persistir A15, finally A16, onResultReady-antes-de-release); el orquestador compila SIN consumidores (el rewire del runner es Plan 10, el del engine Plan 11) — suite canónica 353 passed | 7 skipped | 0 failed, tsc exit 0, comportamiento del sistema sin cambios.

## Lo que se hizo

### Task 1 — core/types.ts (commit `5fd72b27`)

Contratos interface-first (D-05):
- **`TurnCoreAdapters`**: `send(block): Promise<SendResult>` + `getSeedState(): Promise<CoreSeedState>` obligatorios; opcionales prod-only `commitTurn?` (B7), `getPendingTemplates?/savePendingTemplates?/clearPendingTemplates?` (B3), `getLegacyPendingMessage?` + `savePathARollback?` (B2/D-18), `filterOutbound?` (B5), `preloadOnce?` (B4), `recordDebug?` (B8); opcionales sandbox-only `beforeAgentInvoke?` (C1), `onResultReady?` (C4). Todos `?:` — cero flags de entorno.
- **`TurnCoreInput`**: message/conversationId/contactId/workspaceId/phoneNumber/messageTimestamp + lockHandle/lockChannel/lockIdentifier/ownPendingEntryJson (derivado de EngineInput SIN tipos de WhatsApp).
- **`TurnResult`** (C5 — discriminado neutral): `{ kind: 'completed', output, sessionId, templatesSentCount, allSentContents, totalTokens, wasInterruptedWithZeroSends } | { kind: 'zombie_exit', ckptId, message } | { kind: 'error', message, cause? }`.
- **`CoreSeedState`/`SendBlock`/`SendResult`/`CommittedTurn`**: derivados de lo que el runner real consume (SendBlock = lo que pasa a messaging.send hoy; CommittedTurn = insumos del bloque commit post-send B7; SendResult = contrato existente de messaging.ts).
- Gate: tsc exit 0; optional-methods=8 (≥7); forbidden imports=0; exports=6; Regla 3=0.

### Task 2 — core/turn-orchestrator.ts shell (commit `b5a16ad2`)

Primera mitad extraída del runner (D-04):
- **A1** lockCtx con THROW defensivo del runner (`'[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated'`), NO el null silencioso del engine.
- **A2** `startHeartbeat(input.lockHandle)` fuera del loop; stop en finally provisional.
- **A3-A6** `createRestartContext(input.ownPendingEntryJson)`.
- **A7** restart loop `while (ctx.shouldRestart) { ctx.shouldRestart = false; ... }`.
- **A8** CKPT-0 via runCheckpointGate → en interrupt `drainPendingAndCombine` path_a con `priorMsg = ctx.effectiveMessage ?? input.message` + continue.
- **B1** `getSeedState()` per-iteración; **B2/D-18** combine legacy `getLegacyPendingMessage?()` DESPUÉS del seed (orden Pitfall 7, comentario D-18 conservado). **B4** `preloadOnce?`; **C1** `beforeAgentInvoke?`.
- Construcción del `V4AgentInput` desde el seed; stub marcado `throw new Error('task 3 pending: ...')` al cierre del loop (compilable e incompleto).
- Gate: tsc exit 0; runTurn export=1; webhook-contract-violated=1; startHeartbeat≥1; getSeedState≥1; getLegacyPendingMessage≥1; task-3-pending=1; forbidden imports=0.

### Task 3 — core/turn-orchestrator.ts completo + OQ1 (commit `2e32ed83`)

Segunda mitad + reestructuración del cierre (D-04):
- Loop encapsulado en `loopBody(): Promise<TurnResult>` para la estructura de Open Question 1.
- **d.** invocación del agente vía import estático `processMessage as runAgentTurn` (A13 — specifier que engine-v4-lock.test.ts mockea) + acumulación de tokens en ctx (Pitfall 2).
- **e.** discriminator A9 (`output.errorMessage.startsWith('interrupted_at_ckpt_')`) → throw si !lockCtx, drain path_a + continue.
- **f.** CKPT-6a + envío de pending-templates GATED en `if (adapters.getPendingTemplates)` (B3 — sandbox no implementa → rama saltada = paridad). Path A en interrupt.
- **g.** CKPT-6b (A10) con `hasSentAnything: actuallySentIds.length > 0`; Path B desde CKPT-6b con `carrySource = 'seed'` (A11/A14 — output de msg1 NO se envió); Path B sin pending → return 'completed'.
- **h.** send-prep: `filterOutbound?` (B5 — no-rep prod-only) + warning D-14 `v4_messages_without_templates` (B10 — viaja al core) + filtro `rag:*` fuera de templates_enviados (T-7).
- **i.** send + manejo POST-HOC del interrupted A12 (UN solo lugar): 0 sent → path_a; ≥1 sent → path_b_solo + `carrySource = 'output'` (A14); edge wasInterruptedWithZeroSends. `if (ctx.shouldRestart) continue` SIN persistir (A15).
- **j.** commit: `commitTurn?` (B7) + `savePathARollback?` en el edge Path A (B2/D-18) + `recordDebug?` (B8); construye TurnResult 'completed'.
- **Cierre OQ1**: `loopBody()` → catch LostLockError → `{ kind: 'zombie_exit' }` (else `{ kind: 'error' }`) → `await adapters.onResultReady?.(result)` envuelto en try/catch (T-cons-13) → return; **finally**: stopHeartbeat + releaseLockIfOwner verbatim del runner (A16, T-cons-12) con `lock_released_normal` / `redis_unavailable_fallback_failed`.
- Gate: tsc exit 0; SUITE_CMD 353 passed | 7 skipped | 0 failed; interrupted_at_ckpt_≥1; onResultReady presente; task-3-pending=0; adapters.getPendingTemplates≥1; env-gating=0; carrySource=3 (≥2); v4_messages_without_templates=1; **onResultReady@585 < releaseLockIfOwner@597** (orden OQ1 verificado); Regla 3=0.

## Contrato para los Planes 10/11 (firma final)

```typescript
// src/lib/agents/somnio-v4/core/turn-orchestrator.ts
export async function runTurn(
  input: TurnCoreInput,
  adapters: TurnCoreAdapters,
): Promise<TurnResult>
```

```typescript
// src/lib/agents/somnio-v4/core/types.ts
export interface TurnCoreAdapters {
  // OBLIGATORIOS
  send(block: SendBlock): Promise<SendResult>
  getSeedState(): Promise<CoreSeedState>
  // OPCIONALES prod-only (capability gate, no flag)
  commitTurn?(turn: CommittedTurn): Promise<void>
  getPendingTemplates?(sessionId: string): Promise<unknown[]>
  savePendingTemplates?(sessionId: string, templates: unknown[]): Promise<void>
  clearPendingTemplates?(sessionId: string): Promise<void>
  getLegacyPendingMessage?(): string | undefined
  savePathARollback?(turn: { sessionId; message; intentsVistos; datosCapturados; packSeleccionado; accionesEjecutadas }): Promise<void>
  filterOutbound?(templates: ProcessedMessage[], ctx: { sessionId; conversationId; intent; inputTemplatesEnviados }): Promise<ProcessedMessage[]>
  preloadOnce?(sessionId: string): Promise<void>
  recordDebug?(args: { output: V4AgentOutput; turnNumber: number; totalTokens: number }): void
  // OPCIONALES sandbox-only
  beforeAgentInvoke?(iteration: number): Promise<void>
  onResultReady?(result: TurnResult): Promise<void>
}
```

**Mapeo que cada wrapper debe implementar (Plan 10/11):**
- **Plan 10 (runner):** `getSeedState` = fetch sesión per-iteración + extracción `_v3:` keys + carryState aplicado; `send` = V4MessagingAdapter; `commitTurn` = saveState+addTurn+ledger emit; `getPendingTemplates`/`savePendingTemplates`/`clearPendingTemplates` = storage adapter; `getLegacyPendingMessage`/`savePathARollback` = `_v3:pendingUserMessage`; `filterOutbound` = NoRepetitionFilter (gated USE_NO_REPETITION_V4); `preloadOnce` = preloadedData+agent_module marker; `recordDebug` = debug adapter. Mapea `TurnResult` → `EngineOutput` (zombie → success:false code V4_ZOMBIE_LAMBDA_EXIT; error → success:false). VersionConflictError retry queda EN EL WRAPPER (B9 — el core no lo conoce).
- **Plan 11 (engine):** `getSeedState` = `input.state` memoria + carryState SandboxState local; `send` = recoge en memoria (loop sintético CKPT-7.N absorbido en el adapter); `beforeAgentInvoke` = sleep simulateProdTimingMs; `onResultReady` = `redis.set(sandbox-result:{id})`. Mapea `TurnResult` → `V4EngineOutput` (build SandboxState + DebugTurn; error → success:true `[Error v4]` — divergencia INTENCIONAL C5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] LostLockError vive en engine-adapters; el grep literal `engine-adapters=0` es incompatible**
- **Found during:** Task 3 (cierre OQ1 — necesita `instanceof LostLockError`)
- **Issue:** el acceptance de la Task 3 pide `grep -cE "from '.*(whatsapp|engine-adapters|ndjson|supabase)" = 0`, pero `LostLockError` SOLO está definida en `engine-adapters/production/v4-messaging-adapter.ts` (verificado por grep: único `class LostLockError`). El sibling `core/checkpoint-gate.ts` (shipped Plan 07) YA la importa de ahí y pasó los gates de Plan 07/08. Moverla tocaría el adapter (Regla 6 forbidden file).
- **Fix:** importar `LostLockError` del adapter (import de error-class puro, NO lógica de canal/WhatsApp). El espíritu D-05 (cero lógica de canal/NDJSON/DB) se cumple. Misma deviation que Plan 07 #1 (el stub del plan asumía que vivía en interruption-system-v2).
- **Files:** src/lib/agents/somnio-v4/core/turn-orchestrator.ts
- **Commit:** 2e32ed83

**2. [Rule 3 - Blocking] TurnCoreInput +phoneNumber +messageTimestamp (campos del send que faltaban)**
- **Found during:** Task 3 (typecheck — el SendBlock del send principal usa input.phoneNumber/messageTimestamp)
- **Issue:** el runner pasa `phoneNumber` + `triggerTimestamp` (de `input.messageTimestamp`) al messaging.send (:721-722). El TurnCoreInput de la Task 1 no los tenía.
- **Fix:** añadir `phoneNumber?: string` + `messageTimestamp?: string` a TurnCoreInput (campos neutrales — un string de teléfono + un ISO timestamp, NO tipos de WhatsApp). Ambos en `files_modified` del plan.
- **Files:** src/lib/agents/somnio-v4/core/types.ts
- **Commit:** 2e32ed83

---

**Total deviations:** 2 (ambas Rule 3 — discrepancias entre el literal del acceptance y la realidad del código, resueltas preservando la intención D-05/D-04). Cero scope creep, cero asserts cambiados.

## Verificación

- `npx tsc --noEmit` exit 0 tras cada task.
- SUITE_CMD: **353 passed | 7 skipped | 0 failed** (= baseline canónico Plan 08: 346 + 7 drain tests). Cero asserts cambiados. Orquestador sin consumidores → comportamiento del sistema sin cambios.
- `grep -rn "createAdminClient\|@supabase" src/lib/agents/somnio-v4/core/` = 0 (Regla 3).
- Gate D-11: `git diff --name-only 5fd72b27~1..HEAD -- src/` = exactamente {core/types.ts, core/turn-orchestrator.ts}. Cero diff fuera de los 2 archivos del plan (Regla 6: runner/engine/messaging/v3/godentist/recompra/pw-confirmation ausentes).
- Orden OQ1 verificado: `onResultReady` (línea 585) ANTES de `releaseLockIfOwner` (línea 597).
- turn-orchestrator.ts = 613 líneas (≥300 min_lines del artifact).

## Commits

| Commit | Tipo | Descripción |
|--------|------|-------------|
| `5fd72b27` | feat | core/types.ts — contratos TurnCoreAdapters/TurnResult (D-05, interface-first) |
| `b5a16ad2` | feat | core/turn-orchestrator.ts — shell del restart loop (lockCtx + heartbeat + CKPT-0 + seed/legacy) |
| `2e32ed83` | feat | core/turn-orchestrator.ts — invoke + CKPT-6a/6b + send post-hoc + finally OQ1 |

## Next Phase Readiness

- D-04/D-05 implementados: `runTurn()` es el mecanismo único, codifica A1-A18 + B1-B8 + las capabilities opcionales, y compila sin consumidores. Los contratos (types.ts) están pinneados.
- **Plan 10 (runner→wrapper):** implementa `TurnCoreAdapters` con los adapters de producción, llama `runTurn`, mapea `TurnResult` → `EngineOutput`. El VersionConflictError retry (B9) + el shape EngineOutput + agent_routed (B11) quedan EN EL WRAPPER (el core no los conoce).
- **Plan 11 (engine→wrapper sandbox):** implementa `TurnCoreAdapters` con adapters de memoria + el loop sintético CKPT-7.N absorbido en el send-adapter; `onResultReady` = sandbox-result write; mapea `TurnResult` → `V4EngineOutput` (build SandboxState/DebugTurn; error divergente C5). **Deuda heredada (08-SUMMARY):** parametrizar el builder de carryState vía `getSeedState` (el engine arma su SandboxState local; el core solo conoce carrySource).

## Self-Check: PASSED

- 3/3 archivos clave existen en disco (core/types.ts + core/turn-orchestrator.ts + este SUMMARY)
- 3/3 commits verificados en git log (`5fd72b27`, `b5a16ad2`, `2e32ed83`)
- 0 deletions de archivos en los 3 commits (solo creación + edición de líneas)

---
*Phase: somnio-v4-consolidation*
*Plan: 09*
*Completed: 2026-06-10*
