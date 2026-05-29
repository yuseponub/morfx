---
phase: somnio-v4-turn-ledger
plan: 05
subsystem: somnio-sales-v4 (DORMANT) — turn ledger surfacing (debug panel) + P3 test + Regla 6 gate + docs
tags: [turn-ledger, sandbox, debug-panel, state-tab, carryState, regla-6, regla-4, D-06, D-10, D-14, W-3]
requires:
  - "SandboxState.turnLedgerDims tipado FUERTE TurnLedgerDims (Plan 04 Task 2 / W-3)"
  - "commitTurn(workingState, ledger) + TurnLedgerDims/Atendido (Plan 01)"
  - "carryState arrastra dims en reprocess Path B (Plan 04 P3 — engine-v4.ts:468/281)"
  - "Atendido discriminated union por kind (Plan 01 types.ts)"
provides:
  - "state-tab: secciones 'KB Topics Atendidos' + 'CRM Actions' leyendo SandboxState.turnLedgerDims (narrowing kb_topic sin unknown — W-3)"
  - "state.test.ts: 2 tests carryState (P3 cerrado con verificación) — hereda kb_topic + turnCount no double-increment"
  - "Regla 6 §Q-08 greps verdes (0 impacto no-v4) + suite recompra verde"
  - "ARCHITECTURE.md §5.3 Turn Ledger + corrección crm_mutation muerto (D-10); file ahora tracked"
affects:
  - "Standalone #2 (consolidar CRM al sub-loop): el shape CrmActionRegistrada ya documentado como objetivo"
  - "Standalone #3 (híbrido template+RAG): base 'state visual real' lista"
tech-stack:
  added: []
  patterns:
    - "narrowing de discriminated union sin unknown gracias al tipado fuerte del campo (W-3)"
    - "extender un tab existente (D-14) en vez de añadir id al union exhaustivo TAB_ICONS"
    - "test de carryState a nivel de unidad (commitTurn merge) cuando el harness del engine completo sería pesado — precedente E10 referenciado"
key-files:
  created:
    - .planning/standalone/somnio-v4-turn-ledger/05-SUMMARY.md
  modified:
    - src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
    - src/lib/agents/somnio-v4/__tests__/state.test.ts
    - src/lib/agents/somnio-v4/ARCHITECTURE.md
decisions:
  - "D-14 honrado: extendido el state-tab existente; NO se tocó TAB_ICONS / tab-bar / debug-tabs / DebugPanelTabId union"
  - "W-3 honrado: state-tab lee SandboxState.turnLedgerDims (tipado fuerte TurnLedgerDims) → narrowing a.kind==='kb_topic' sin unknown ni casts"
  - "Test carryState a nivel de unidad (commitTurn merge) — el plan permite 'integration con harness mínimo si requiere el runner'; el precedente full-engine vive en E10 (engine-v4-lock.test.ts:746) y se referencia"
  - "D-10: línea isCrmMutation es :225 (no :172 como decía el plan) — el código evolucionó; se documentó la línea real"
  - "Regla 4: ARCHITECTURE.md pasó de untracked a tracked en el commit de docs"
metrics:
  duration_min: 30
  completed: 2026-05-29
  tasks: 4
  commits: 3
---

# Phase somnio-v4-turn-ledger Plan 05: Surface visual + test carryState + gate Regla 6 + docs — Summary

Cierra el standalone del Unified Turn Ledger v4: el ledger ahora tiene **surface visual real** en el debug panel del sandbox (D-14 — se EXTIENDE el `state-tab` existente con "KB Topics Atendidos" + "CRM Actions", sin tab nuevo), un **test de carryState** que cierra P3 con verificación (un reprocess Path B no pierde ni double-registra el ledger), el **gate Regla 6** ejecutado y verificado (0 impacto en los 5 agentes no-v4), y la **documentación sincronizada** (`ARCHITECTURE.md` §5.3 Turn Ledger + corrección del `crm_mutation` muerto, D-10). v4 sigue DORMANT — cero cambio de comportamiento en prod (los cambios son sandbox UI + test + docs).

## What Was Built

- **Task 1 — state-tab KB Topics + CRM Actions (commit `d711af39`):**
  - Dos secciones nuevas en `LegibleState` (debug-panel/state-tab.tsx), tras "Acciones Ejecutadas", leyendo `state.turnLedgerDims ?? { atendido: [], crmActions: [] }` (guard graceful para sesiones sandbox pre-ledger).
  - **KB Topics Atendidos:** filtra `dims.atendido` con type-guard `(a): a is Extract<Atendido,{kind:'kb_topic'}> => a.kind === 'kb_topic'` — el narrowing funciona **sin `unknown` ni casts** porque `SandboxState.turnLedgerDims` es `TurnLedgerDims` (W-3). Render badge `{topic} — {(confidence*100).toFixed(0)}%`.
  - **CRM Actions:** itera `dims.crmActions`, badge `{tool} · {result} · {origen}` con color por result (success verde / failed-cas_reject rojo) — mismo patrón visual del tab existente.
  - Import `Atendido` desde `@/lib/agents/somnio-v4/types`. **NO** se tocó `TAB_ICONS`, `tab-bar.tsx`, `debug-tabs.tsx`, ni el union `DebugPanelTabId` (D-14).

- **Task 2 — Tests carryState en state.test.ts (commit `91d72b59`):**
  - `iter-2 (reprocess Path B) hereda el kb_topic de iter-1 vía carryState sin perderlo ni double-registrarlo` — espeja el mecanismo del precedente full-engine E10 (`engine-v4-lock.test.ts:746-797`), a nivel de la unidad que importa para el ledger: el `carryState` que el engine arma desde `output.turnLedgerDims` (`engine-v4.ts:468`) se reusa como seed (`:281`) de la iteración siguiente, que vuelve a `commitTurn`. Asserta que `['apnea','precio']` (previo + nuevo) coexisten y que `'apnea'` aparece exactamente una vez.
  - `turnCount no se double-incrementa: vive en AgentState (mergeAnalysis), no en el ledger` — `commitTurn`/`TurnLedgerDims` no exponen `turnCount` (`expect(out).not.toHaveProperty('turnCount')`; `Object.keys(dims) === ['atendido','crmActions']`), así que el ledger no puede tocarlo ni sumarlo dos veces.
  - Suite v4 completa: **55 passed, 3 skipped** (los 3 skips = smoke-rag LLM-live, flaky pre-existente documentado desde Plan 01/03), 0 failed. `state.test.ts` ahora 9/9 (7 prior + 2 nuevos).

- **Task 3 — Gate Regla 6 §Q-08 (verificación, sin commit de código):**
  - Grep #1 (ledger code en agentes no-v4) = **0 matches** en `somnio-v3/`, `godentist/`, `godentist-fb-ig/`, `somnio-recompra/`, `somnio-pw-confirmation/`.
  - Grep #3 (ops destructivas en migración) = **0 matches** (`DROP|ALTER COLUMN|RENAME` en `*turn_ledger*`).
  - Confinamiento: los cambios de ESTE plan son `state-tab.tsx` (debug panel) + `state.test.ts` (test v4) + `ARCHITECTURE.md` (docs) — dentro de la superficie permitida (v4/sandbox/debug/docs).
  - Suite no-v4 verde: `somnio-recompra/__tests__/` → **32/32 passed**.

- **Task 4 — ARCHITECTURE.md (commit `48aa7141`):**
  - Nueva **§5.3 Turn Ledger**: distinción D-17 `TurnLedger` (completo en memoria, incl. `modeTransition`/`messagesSent`) vs `TurnLedgerDims` (subset persistido `{atendido,crmActions}`); commit único (`commitTurn` wrap de `serializeState` + defensas T-ledger-01/02); columna `turn_ledger_dims`; 7 commit-paths vs 3 no-commit (interrupt/error D-07); lectura en turnos FUTUROS (D-06); emisión del ledger COMPLETO a observability (`kb_topic_registered`/`crm_action_recorded`/`turn_ledger_committed` consumiendo los campos no-persistidos, D-17b); surface visual en state-tab (W-3).
  - **Corrección crm_mutation (D-10):** la §2.4 pintaba `crm_mutation` como reason vivo. Corregido: el disparador `isCrmMutation` está **hardcoded `false`** en `somnio-v4-agent.ts:225` → rama muerta; el CRM real de v4 es determinista inline; consolidar CRM al sub-loop = standalone #2; el ledger ya anticipa el shape (`CrmActionRegistrada`, D-04/D-08). También se anotó en el switch de `runSubLoop` que solo `cas_reject` entra hoy.
  - Agregado `somnio-v4-turn-ledger` (shipped) a la tabla de standalones relacionados.
  - Regla 4: el file pasó de **untracked a tracked** en este commit.

## Verification Results

- **Task 1 verify:** `grep "turnLedgerDims|KB Topics|CRM Actions" state-tab.tsx` → presente; `git diff --name-only | grep -E "tab-bar|debug-tabs"` → 0 (tabs intactos, D-14); `tsc --noEmit | grep state-tab` → 0 errores.
- **Task 2 verify:** `vitest run somnio-v4/__tests__/` → 55 passed / 3 skipped / 0 failed (state.test.ts 9/9).
- **Task 3 verify:** grep #1 = 0, grep #3 = 0; recompra suite 32/32 verde.
- **Task 4 verify:** `grep "Turn Ledger|turn_ledger_dims|TurnLedgerDims|isCrmMutation|hardcoded|standalone #2" ARCHITECTURE.md` → 7 hits → "docs OK".
- **tsc final:** `tsc --noEmit | grep -E "somnio-v4|state-tab"` → 0 errores nuevos en la superficie del plan.

### Regla 6 §Q-08 (registro explícito)

| Grep | Comando | Esperado | Resultado |
|------|---------|----------|-----------|
| #1 ledger en no-v4 | `grep -rln "somnio-v4\|turn-ledger\|TurnLedger\|commitTurn\|turn_ledger_dims" {v3,godentist,godentist-fb-ig,recompra,pw-confirmation}/` | 0 | **0** ✅ |
| #3 migración destructiva | `grep -E "DROP\|ALTER COLUMN\|RENAME" supabase/migrations/*turn_ledger*` | 0 | **0** ✅ |
| Confinamiento | `git diff --name-only HEAD~3 HEAD` | solo v4/sandbox/debug/docs | state-tab + state.test + ARCHITECTURE ✅ |
| Suite no-v4 | `vitest run somnio-recompra/__tests__/` | verde | **32/32** ✅ |

## Deviations from Plan

### Auto-fixed / reconciliaciones (no desviaciones de scope)

**1. [Reconciliación] `isCrmMutation` está en línea :225, no :172**
- **Found during:** Task 4
- **Issue:** El plan (y el `<interfaces>`) referían `somnio-v4-agent.ts:172` para `isCrmMutation` hardcoded false. La línea real hoy es **:225** (el archivo evolucionó desde Plan 03).
- **Fix:** Se documentó la línea real (`:225`) en ARCHITECTURE.md. El hecho (hardcoded `false`, rama muerta) se verificó con grep antes de escribir.
- **Files modified:** `ARCHITECTURE.md`
- **Commit:** `48aa7141`

**2. [Decisión de diseño, permitida por el plan] Test carryState a nivel de unidad (commitTurn merge), no full-engine**
- **Found during:** Task 2
- **Issue:** `state.test.ts` importa solo funciones puras de `../state`. Reproducir el harness completo del engine (SomnioV4Engine + Redis mock + checkpoint overrides) que usa E10 sería pesado e introduciría dependencias del lock en un archivo de tests de serialización.
- **Fix:** El plan explícitamente permite "Unit a nivel de commitTurn + merge de carryState dims; si requiere el runner, marcar como integration con harness mínimo". Se testeó la unidad que importa para P3: el `carryState` (armado desde `output.turnLedgerDims`, `engine-v4.ts:468`) se reusa como seed (`:281`) y se vuelve a `commitTurn`. Se referencia el precedente full-engine E10 en los comentarios para trazabilidad. El mecanismo full-engine ya está cubierto por E10 (intentsVistos/templatesEnviados) — este test añade la dimensión ledger.
- **Files modified:** `state.test.ts`
- **Commit:** `91d72b59`

## Known Stubs

Ninguno introducido por este plan. (El `crm_mutation` muerto NO es un stub de este plan — es deuda pre-existente de v4 documentada ahora correctamente, su resolución = standalone #2.)

## Push (Regla 5 / Regla 1)

Los cambios de este plan son **sandbox UI (state-tab) + test + docs** — no tocan el path de producción ni el schema. La migración `turn_ledger_dims` ya se aplicó en prod (Plan 02). v4 sigue DORMANT (0 workspaces) → ningún tráfico ejercita el path. El push a Vercel lo decide el usuario/orquestador (este executor NO empuja sin instrucción explícita de push en el prompt).

## Self-Check: PASSED

- `src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx` — FOUND (KB Topics + CRM Actions, narrowing W-3)
- `src/lib/agents/somnio-v4/__tests__/state.test.ts` — FOUND (2 tests carryState; 9/9 verde)
- `src/lib/agents/somnio-v4/ARCHITECTURE.md` — FOUND (§5.3 Turn Ledger + crm_mutation corregido; ahora tracked)
- Commit `d711af39` — FOUND
- Commit `91d72b59` — FOUND
- Commit `48aa7141` — FOUND
