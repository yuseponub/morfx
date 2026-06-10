---
phase: somnio-v4-consolidation
plan: 08
type: execute
wave: 5
depends_on: ["07"]
files_modified:
  - src/lib/agents/somnio-v4/core/restart-context.ts
  - src/lib/agents/somnio-v4/core/drain.ts
  - src/lib/agents/somnio-v4/core/__tests__/drain.test.ts
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/somnio-v4/engine-v4.ts
autonomous: true
requirements: [D-03]
must_haves:
  truths:
    - "Los 12 drain-sites copy-paste (7 runner + 5 engine) están consolidados en drainPendingAndCombine() — la divergencia futura entre sites es imposible"
    - "Cada drain conserva sus invariantes: clearInterrupt SIEMPRE tras readAndClearPending (bug-fix 2026-05-28), orden cronológico priorMsg-primero (commit 494d3bb4), continue sin persistir (R-01)"
    - "Los acumuladores cross-iteración viven en un struct RestartContext único con dropOwnEntry idéntico al actual"
    - "Suite v4 completa verde con CERO asserts cambiados — los eventos emitidos por cada site son byte-equivalentes"
  artifacts:
    - path: "src/lib/agents/somnio-v4/core/restart-context.ts"
      provides: "struct RestartContext + factory + dropOwnEntry"
      exports: ["RestartContext", "createRestartContext"]
    - path: "src/lib/agents/somnio-v4/core/drain.ts"
      provides: "drainPendingAndCombine() — consolida los 12 sites"
      exports: ["drainPendingAndCombine"]
    - path: "src/lib/agents/somnio-v4/core/__tests__/drain.test.ts"
      provides: "tests unitarios ADITIVOS del drain (complemento, nunca reemplazo de las suites de paridad)"
      min_lines: 40
  key_links:
    - from: "src/lib/agents/somnio-v4/core/drain.ts"
      to: "@/lib/agents/interruption-system-v2/pending"
      via: "readAndClearPending + clearInterrupt con specifier absoluto (Pitfall 8)"
      pattern: "from '@/lib/agents/interruption-system-v2/pending'"
    - from: "src/lib/agents/engine/v4-production-runner.ts"
      to: "core/drain.ts"
      via: "drainPendingAndCombine en los 7 sites"
      pattern: "drainPendingAndCombine"
---

<objective>
Wave 2, pasos 2-3 del orden del RESEARCH: crear `core/restart-context.ts` (struct de acumuladores D-03) y `core/drain.ts` (`drainPendingAndCombine()` que consolida la secuencia repetida 12 veces), y adoptarlos IN-PLACE en runner y engine — todavía sin orquestador. El bug del 2026-05-28 (dropOwnEntry/carryState arreglado dos veces) es el caso de prueba mental: tras este plan, ese fix se tocaría en UN lugar.

Purpose: dejar el while-loop del runner tan delgado que la extracción del orquestador (Plan 09-10) sea un move, no un rewrite.
Output: 2 archivos core + 12 sites consolidados + tests unitarios aditivos del drain.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-03)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (§Divergence Map A3-A6 + conteo drain-sites; Pitfalls 6, 7, 8; §Code Examples — drainPendingAndCombine)
@.planning/standalone/somnio-v4-consolidation/PATTERNS.md (§restart-context.ts y §drain.ts — shapes y código fuente verbatim)
@.planning/standalone/somnio-v4-consolidation/07-SUMMARY.md (inventario de sites)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD)

NOTA: line refs con drift de W1+Plan07 — localizar por patrón (`readAndClearPending`, `msg_aborted_path_`).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear core/restart-context.ts + core/drain.ts + tests unitarios del drain</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (acumuladores: totalTokensAcrossRestarts/restartIteration/effectiveMessage/templatesSentCount/carryState/accumulatedSentContents + parse ownEntryUuid + dropOwnEntry; y los 7 drain-sites: 5 Path A localizables por `msg_aborted_path_a_combined`, 2 Path B por `msg_aborted_path_b_solo`)
    - src/lib/agents/somnio-v4/engine-v4.ts (los 5 sites homólogos + accumulatedSentMessages — mismo concepto, nombre distinto A6)
    - .planning/standalone/somnio-v4-consolidation/PATTERNS.md §restart-context.ts + §drain.ts (shapes verbatim — copiar de ahí)
    - src/lib/agents/interruption-system-v2/pending.ts (firmas de readAndClearPending/clearInterrupt y shape de PendingEntry {entry_uuid, content, ...})
  </read_first>
  <files>src/lib/agents/somnio-v4/core/restart-context.ts, src/lib/agents/somnio-v4/core/drain.ts, src/lib/agents/somnio-v4/core/__tests__/drain.test.ts</files>
  <action>
    1. `core/restart-context.ts` — copiar del runner (D-04: el runner manda) los nombres de campos y comentarios:
    ```typescript
    export interface CarryState {
      intentsVistos: string[]
      templatesEnviados: string[]
      datosCapturados: Record<string, string>
      packSeleccionado: string | null
      accionesEjecutadas: unknown[]
      currentMode: string
      turnLedgerDims: TurnLedgerDims   // import del tipo real (grep TurnLedgerDims)
    }
    export interface RestartContext {
      totalTokensAcrossRestarts: number
      restartIteration: number
      effectiveMessage: string | null      // null en iter 1
      templatesSentCount: number
      carryState: CarryState | null
      /** Pitfall 6 — dual semantics: 'seed' (Path B desde CKPT-6b: lo enviado fue del turno PREVIO,
       *  el output de msg1 NO se envió) vs 'output' (Path B desde send-loop: msg1 parcialmente enviado).
       *  Colapsarlas re-registraría/perdería efectos del ledger. */
      carrySource: 'seed' | 'output' | null
      accumulatedSentContents: string[]    // engine lo llamaba accumulatedSentMessages (A6)
      shouldRestart: boolean
      ownEntryUuid: string | null
    }
    export function createRestartContext(ownPendingEntryJson?: string | null): RestartContext
    export function dropOwnEntry<T extends { entry_uuid: string }>(ctx: RestartContext, entries: T[]): T[]
    ```
    `createRestartContext` hace el parse try/catch de `ownPendingEntryJson` → `ownEntryUuid` (byte-copy del runner). `dropOwnEntry` filtra por `entry_uuid !== ctx.ownEntryUuid` (byte-copy).
    2. `core/drain.ts` — implementar con la firma del RESEARCH:
    ```typescript
    import { readAndClearPending, clearInterrupt } from '@/lib/agents/interruption-system-v2/pending'
    import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'

    export async function drainPendingAndCombine(args: {
      ctx: RestartContext
      lockCtx: { workspaceId: string; channel: LockChannel; identifier: string }
      atStep: string
      priorMsg: string
      mode: 'path_a' | 'path_b_solo'
      /** extra payload del emit Path B (ej. templates_sent_before_abort) — replicar el del site */
      pathBEmitExtra?: Record<string, unknown>
    }): Promise<{ pendingCount: number }>
    ```
    Cuerpo (secuencia EXACTA — invariantes lockeadas):
    a. `const pending = dropOwnEntry(ctx, await readAndClearPending(ws, channel, identifier))`
    b. `await clearInterrupt(ws, channel, identifier)` — SIEMPRE (bug-fix 2026-05-28: sin esto el siguiente CKPT-0 relee el interrupt y spinea Path A con pending vacío)
    c. `ctx.restartIteration++`
    d. mode 'path_a': emitir `msg_aborted_path_a_combined` {at_step, combined_msg_count: pending.length+1, total_chars, restart_iteration} + `pending_list_combined` {at_step, entries_count, total_chars, restart_iteration}; `ctx.effectiveMessage = [priorMsg, ...pending.map(p => p.content)].join('\n')` — ORDEN CRONOLÓGICO priorMsg PRIMERO (commit 494d3bb4)
    e. mode 'path_b_solo': emitir `msg_aborted_path_b_solo` {at_step, ...pathBEmitExtra} + `pending_list_combined`; `ctx.effectiveMessage = pending.map(p => p.content).join('\n')` — SOLO lo nuevo, sin prior (el carryState lo setea el CALLER, porque la fuente seed-vs-output depende del site — Pitfall 6). ANTES de implementar: comparar contra los 3 sites Path B reales (runner ×2, engine ×1) y replicar payloads exactos; si un site Path B NO emite pending_list_combined hoy, parametrizarlo para no añadir emisiones nuevas.
    f. `ctx.shouldRestart = true`; retornar `{ pendingCount: pending.length }`
    3. SPECIFIERS (Pitfall 8): pending/observability SOLO con `@/lib/agents/interruption-system-v2/*`.
    4. `core/__tests__/drain.test.ts` (ADITIVO — complemento, no reemplazo): con mocks de los mismos specifiers, cubrir mínimo: (a) orden cronológico priorMsg-primero en path_a; (b) clearInterrupt llamado SIEMPRE tras readAndClearPending; (c) dropOwnEntry filtra la entry propia; (d) path_b_solo no incluye priorMsg; (e) restartIteration incrementa y shouldRestart=true.
    5. Gate D-09: `npx tsc --noEmit` + `npx vitest run src/lib/agents/somnio-v4/core/__tests__/drain.test.ts` verdes. Commit: `feat(somnio-v4-consolidation 08): core/restart-context + core/drain — consolida la secuencia de 12 drain-sites`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/agents/somnio-v4/core/__tests__/drain.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - Ambos archivos core existen con los exports declarados (`grep -c "export" ...` ≥ 2 c/u)
    - `grep -n "clearInterrupt" src/lib/agents/somnio-v4/core/drain.ts` aparece DESPUÉS de readAndClearPending en el flujo (secuencia a→b)
    - `grep -c "priorMsg, ...pending" src/lib/agents/somnio-v4/core/drain.ts` ≥ 1 (orden cronológico)
    - `grep -c "carrySource" src/lib/agents/somnio-v4/core/restart-context.ts` ≥ 1 (Pitfall 6 codificado)
    - drain.test.ts verde con ≥5 casos
    - `grep -rn "createAdminClient\|@supabase" src/lib/agents/somnio-v4/core/` = 0
  </acceptance_criteria>
  <done>Primitivas del core listas, probadas y con invariantes lockeadas en código y tests.</done>
</task>

<task type="auto">
  <name>Task 2: Adoptar RestartContext + drainPendingAndCombine en los 7 sites del runner</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (COMPLETO — los 7 sites + todas las lecturas/escrituras de los acumuladores locales que pasan al struct)
    - src/lib/agents/somnio-v4/core/restart-context.ts + core/drain.ts (recién creados)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 6 (seed-carry CKPT-6b vs output-carry send-loop) y §Pitfall 7 (CKPT-0 drena con effectiveMessage ?? input.message ANTES del combine legacy)
  </read_first>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <action>
    1. Reemplazar las variables locales (totalTokensAcrossRestarts, restartIteration, effectiveMessage, templatesSentCount, carryState, accumulatedSentContents, ownEntryUuid+dropOwnEntry local) por `const ctx = createRestartContext(input.ownPendingEntryJson)` y referencias `ctx.*`. La variable `shouldRestart` del while pasa a `ctx.shouldRestart` (while (ctx.shouldRestart) { ctx.shouldRestart = false; ... }).
    2. Reemplazar cada uno de los 5 sites Path A por `await drainPendingAndCombine({ ctx, lockCtx, atStep: '<el at_step EXACTO del site>', priorMsg: <la expresión EXACTA del site>, mode: 'path_a' }); continue` — CRÍTICO Pitfall 7: en el site CKPT-0, priorMsg = `ctx.effectiveMessage ?? input.message` y el drain ocurre ANTES del combine `_v3:pendingUserMessage` (no reordenar).
    3. Reemplazar los 2 sites Path B por el drain en mode 'path_b_solo' + el seteo de carryState EN EL CALLER conservando la fuente correcta (Pitfall 6): site CKPT-6b → carry desde SEED (`ctx.carrySource = 'seed'`); site send-loop → carry desde OUTPUT (`ctx.carrySource = 'output'`). Replicar el payload `templates_sent_before_abort`/extra de cada site vía pathBEmitExtra.
    4. Cero cambios de orden/semántica: cada site emite los MISMOS eventos con los MISMOS payloads que antes (verificar contra el diff site por site).
    5. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes — `v4-production-runner-pathb.test.ts` es el guardián del Pitfall 6: si un assert pide cambiar AQUÍ, ES regresión (parar). Commit: `refactor(somnio-v4-consolidation 08): runner adopta RestartContext + drainPendingAndCombine (7 sites, semántica idéntica)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "drainPendingAndCombine" src/lib/agents/engine/v4-production-runner.ts` = 7
    - `grep -c "readAndClearPending" src/lib/agents/engine/v4-production-runner.ts` = 0 (todo via drain) — si algún site legítimamente no encaja, documentar por qué en el commit (máx 1 excepción)
    - `grep -c "createRestartContext" src/lib/agents/engine/v4-production-runner.ts` = 1
    - `grep -c "carrySource = 'seed'" src/lib/agents/engine/v4-production-runner.ts` = 1 y `grep -c "carrySource = 'output'" ...` = 1
    - Suites restart + pathb verdes sin asserts cambiados; SUITE_CMD completo verde
  </acceptance_criteria>
  <done>Runner drena por un único camino; dual carryState explícito en el tipo.</done>
</task>

<task type="auto">
  <name>Task 3: Adoptar RestartContext + drainPendingAndCombine en los 5 sites del engine</name>
  <read_first>
    - src/lib/agents/somnio-v4/engine-v4.ts (COMPLETO — 4 sites Path A + 1 Path B + acumuladores con nombre accumulatedSentMessages)
    - src/lib/agents/somnio-v4/core/restart-context.ts + core/drain.ts
  </read_first>
  <files>src/lib/agents/somnio-v4/engine-v4.ts</files>
  <action>
    1. Mismo procedimiento que Task 2: `createRestartContext(input.ownPendingEntryJson)`, referencias ctx.*, los 4 sites Path A → drain mode 'path_a', el site Path B del loop sintético → mode 'path_b_solo' + `ctx.carrySource = 'output'` (el engine SOLO tiene la variante output — A14; no inventar la seed aquí).
    2. `accumulatedSentMessages` → `ctx.accumulatedSentContents` (unificación de nombre A6 — el shape no cambia).
    3. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes — `engine-v4-lock.test.ts` (suite de paridad E1..E10) debe pasar SIN tocar. Commit: `refactor(somnio-v4-consolidation 08): engine adopta RestartContext + drainPendingAndCombine (5 sites)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "drainPendingAndCombine" src/lib/agents/somnio-v4/engine-v4.ts` = 5
    - `grep -c "readAndClearPending" src/lib/agents/somnio-v4/engine-v4.ts` = 0
    - `grep -c "accumulatedSentMessages" src/lib/agents/somnio-v4/engine-v4.ts` = 0 (renombrado al campo del struct)
    - engine-v4-lock.test.ts verde sin asserts cambiados; SUITE_CMD completo verde
  </acceptance_criteria>
  <done>12/12 drain-sites consolidados; el fix-en-un-solo-lugar es realidad para los drains.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Redis pending/interrupt keys | Consumidas vía los MISMOS primitives (readAndClearPending/clearInterrupt) — keyspace workspace-scoped sin cambios |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-10 | T (Tampering) | colapsar las 2 semánticas de carryState (Pitfall 6) | mitigate | Campo carrySource explícito en el tipo + caller setea la fuente + v4-production-runner-pathb.test.ts como guardián con asserts intactos |
| T-cons-11 | D (DoS) | olvidar clearInterrupt → spin Path A infinito | mitigate | clearInterrupt es incondicional dentro de drainPendingAndCombine + test unitario dedicado (b) |
</threat_model>

<verification>
- SUITE_CMD verde tras cada task, cero asserts cambiados.
- drain.test.ts nuevo verde (aditivo).
- Gate D-11: diff = {core/restart-context.ts, core/drain.ts, core/__tests__/drain.test.ts, v4-production-runner.ts, engine-v4.ts}.
</verification>

<success_criteria>
- 12/12 drain-sites consolidados (7+5), cero llamadas directas a readAndClearPending fuera de core/drain.ts en runner/engine.
- RestartContext con carrySource dual codificado (Pitfall 6).
- Pitfall 7 preservado (orden CKPT-0 → combine legacy verificable en el diff del runner).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/08-SUMMARY.md` (incluye: mapa final site→modo→carrySource — insumo del Plan 09).
</output>
