---
phase: somnio-sales-v4
plan: 05
subsystem: sub-loop
tags: [ai-sdk-v6, zod-discriminated-union, pgvector, output-object, anthropic-haiku]

# Dependency graph
requires:
  - phase: somnio-sales-v4
    provides: "Plan 01 — agent_knowledge_base table con embedding(1536) + nunca_decir TEXT[] + body_hash"
  - phase: somnio-sales-v4
    provides: "Plan 02 — RPC match_knowledge_base con nunca_decir en RETURNS"
  - phase: somnio-sales-v4
    provides: "Plan 04 — generateEmbedding (text-embedding-3-small) + SOMNIO_V4_AGENT_ID"
provides:
  - "LoopOutcomeSchema (Zod discriminated union template/canonical/no_match) + LoopOutcome type — D-62 estructural sin variante de texto libre"
  - "SubLoopReason type union (low_confidence | crm_mutation | cas_reject | razonamiento_libre)"
  - "kbSearchTool({ workspaceId }) factory — AI SDK tool() wrap de RPC match_knowledge_base con W-09 nunca_decir mapping"
  - "checkNuncaDecir({ candidateText, nuncaDecirRules }) — post-gen Haiku validator con early-return"
  - "buildSubLoopPrompt(reason) — 4 system prompts dedicados por SubLoopReason"
  - "buildSubLoopTools(reason, ctx): ToolSet — factory de tool dict acotado por reason"
  - "runSubLoop({ reason, ctx }): Promise<LoopOutcome> — entrypoint del sub-loop"
  - "SubLoopContext / SubLoopToolsContext interfaces"
affects:
  - "Plan 06 — state machine + comprehension consume runSubLoop bajo triggers D-02"
  - "Plan 09 — Inngest knowledge-sync function comparte el RPC match_knowledge_base"
  - "Plan 11 — corpus inicial poblará `nunca_decir` en docs y este sub-loop usará el check de día 1"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: AI SDK v6 generateText + Output.object({ schema }) — primer consumidor en repo (RESEARCH §Pattern 2 verbatim)"
    - "Pattern: Tool factory por scope con switch sobre reason union (3-5 tools, no 20)"
    - "Pattern: Post-gen LLM compliance check con early-return (segundo Haiku call solo en outcome 'canonical')"
    - "Pattern: vi.hoisted() para mocks top-level con vi.mock factory hoisting"
    - "Pattern: ToolSet return type annotation para evitar fricción TS de unión-de-shapes en switch"

key-files:
  created:
    - "src/lib/agents/somnio-v4/sub-loop/output-schema.ts"
    - "src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts"
    - "src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts"
    - "src/lib/agents/somnio-v4/sub-loop/prompt.ts"
    - "src/lib/agents/somnio-v4/sub-loop/tools.ts"
    - "src/lib/agents/somnio-v4/sub-loop/index.ts"
    - "src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts"
    - "src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts"
  modified: []

key-decisions:
  - "D-01: arquitectura híbrida — sub-loop solo bajo triggers D-02"
  - "D-02: 4 SubLoopReason — low_confidence, crm_mutation, cas_reject, razonamiento_libre"
  - "D-09: Haiku scope-acotado — 3-5 tools por reason, stopWhen=stepCountIs(4), latencia ~600ms-1.5s"
  - "D-13: SOMNIO_V4_AGENT_ID literal usado como invoker en createCrmQueryTools/createCrmMutationTools"
  - "D-19: crm_mutation expone 5 mutations + getActiveOrderByPhone + kb_search"
  - "D-50: canonical = verbatim de '## Respuesta canónica'; nunca cita NUNCA-decir/Sources al cliente"
  - "D-51: post-gen NUNCA-decir check Haiku con early-return; W-09 lo hace funcional desde día 1"
  - "D-57: no_match → handoff_humano literal con requiresHuman=true"
  - "D-62: schema LoopOutcomeSchema rechaza estructuralmente cualquier variante de texto libre — enforced por Output.object(schema), NO por toolChoice"
  - "W-06: comentario explícito en index.ts — toolChoice='auto' (no 'required') porque 'required' bloquearía Output.object final step"
  - "W-09: kb-search-tool lee row.nunca_decir directamente del RPC match_knowledge_base (DB column) — sin parser markdown"
  - "B-01: Plan 05 100% autónomo — la migración del RPC vive en Plan 02 Wave 0"

patterns-established:
  - "Pattern: discriminated union sin variante 'freeText' como guard estructural anti-hallucination (D-62)"
  - "Pattern: kbSearchTool factory usa createAdminClient + RPC pgvector — tabla nueva sin domain layer (KB es el primer caso autorizado en RESEARCH Shared Patterns)"
  - "Pattern: per-call factory instantiation (NO module-scope cache; misma regla que crm-query-tools D-04)"
  - "Pattern: runWithPurpose('subloop', ...) wrap en orquestador y runWithPurpose('subloop_nunca_decir', ...) en checker — observability scoping correcto"

requirements-completed: []

# Metrics
duration: ~30min
completed: 2026-05-01
---

# Plan 05: Sub-Loop AI SDK v6 Infrastructure Summary

**Wave 1 sub-loop infra completa: Zod discriminated union (LoopOutcomeSchema) + AI SDK tool wrapper sobre pgvector RPC (kbSearchTool con W-09 mapping de `nunca_decir`) + post-gen Haiku NUNCA-decir validator (checkNuncaDecir) + system prompts por SubLoopReason + ToolSet factory por reason + runSubLoop entrypoint con Output.object enforcement de D-62.**

## Performance

- **Duration:** ~30min
- **Started:** 2026-05-01T18:15:00Z (approx)
- **Completed:** 2026-05-01T18:35:00Z
- **Tasks:** 5 (output-schema → kb-search-tool → nunca-decir + prompt → tools + index → tests)
- **Files created:** 8 (6 código + 2 tests)
- **Files modified:** 0
- **Tests:** 12/12 PASS (7 schema + 5 kb-search-tool)
- **TypeScript:** clean (`npx tsc --noEmit -p tsconfig.json` exit 0)

## Accomplishments

- **LoopOutcomeSchema** Zod discriminated union con 3 variantes: `template` / `canonical` / `no_match`. Sin variante de texto libre — D-62 enforced ESTRUCTURALMENTE por `Output.object()`. Type guard estructural anti-hallucination.
- **kbSearchTool** factory que retorna AI SDK `tool()` wrap del RPC `match_knowledge_base` (Plan 02 Wave 0). Pitfall 2 satisfecho: `workspaceId` viene de ctx, NO de input. W-09 satisfecho: lee `row.nunca_decir` directamente del RPC RETURNS — cero parser markdown del canonical_response.
- **checkNuncaDecir** post-gen Haiku validator con early-return (`rules.length === 0 → ok`). Funcional desde día 1 gracias a W-09 (las rules vienen del DB column poblado por Plan 04 sync.ts cuando el doc tiene la sección `## NUNCA decir`).
- **buildSubLoopPrompt** 4 system prompts dedicados por SubLoopReason: low_confidence, razonamiento_libre, crm_mutation, cas_reject. Cada uno acota el scope del modelo. cas_reject incluye guard "máximo 1 retry" (mutation-tools Pitfall 1).
- **buildSubLoopTools** factory tipada como `ToolSet` que devuelve dict acotado por reason: low_confidence/razonamiento_libre solo `kb_search`; crm_mutation expone kb_search + getActiveOrderByPhone + 5 mutations (D-19); cas_reject expone kb_search + getActiveOrderByPhone + moveOrderToStage. Factories invocadas per-call con `invoker: SOMNIO_V4_AGENT_ID` (D-13).
- **runSubLoop** entrypoint con `generateText({ output: Output.object(LoopOutcomeSchema), toolChoice: 'auto', stopWhen: stepCountIs(4) })`. Post-gen NUNCA-decir check solo en outcome 'canonical' que escala a no_match si check falla. Observability D-58: emite `pipeline_decision:subloop_completed` (todos los outcomes) + `pipeline_decision:subloop_nunca_decir_violation` (escalations forzadas).
- **W-06 documentado:** comentario explícito en index.ts sobre por qué `toolChoice='auto'` y NO `'required'` — `'required'` bloquearía el Output.object final step.

## Task Commits

Cada task se committeó atómicamente:

1. **Task 1: output-schema.ts** — `dd1b6cb` (feat)
2. **Task 2: kb-search-tool.ts** — `4caf7d8` (feat)
3. **Task 3: nunca-decir-check.ts + prompt.ts** — `837f568` (feat)
4. **Task 4: tools.ts + index.ts** — `21e2530` (feat)
5. **Task 5: tests (12 passing)** — `eb05ce1` (test)
6. **Task 6: SUMMARY.md** — pendiente commit final post-write

## Files Created/Modified

### Created

- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` — `LoopOutcomeSchema`, `LoopOutcome` type, `SubLoopReason` type
- `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` — `kbSearchTool({ workspaceId })`, `KbSearchContext`, `KbHit`
- `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` — `checkNuncaDecir({ candidateText, nuncaDecirRules })`
- `src/lib/agents/somnio-v4/sub-loop/prompt.ts` — `buildSubLoopPrompt(reason)`
- `src/lib/agents/somnio-v4/sub-loop/tools.ts` — `buildSubLoopTools(reason, ctx): ToolSet`, `SubLoopToolsContext`
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — `runSubLoop({ reason, ctx })`, `SubLoopContext`, re-export `SubLoopReason`
- `src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts` — 7 unit tests
- `src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts` — 5 unit tests

### Modified

(Ninguno — Plan 05 es 100% autónomo, solo añade archivos nuevos.)

## Decisions Made

Plan ejecutado siguiendo decisions D-01, D-02, D-09, D-13, D-19, D-50, D-51, D-57, D-62 del CONTEXT.md y warnings W-06, W-09 + B-01 fix de la planificación. Decisiones in-flight:

- **`buildSubLoopTools` retorna `ToolSet` explícito.** Plan no especificaba return type. TS inferenció una unión de shapes-por-reason que no era asignable a `generateText.tools`. Fix: anotar return como `ToolSet` (importado de `'ai'`) — tipo declarativo, sin cast unsafe. Misma técnica usada por crm-mutation-tools/index.ts.
- **`vi.hoisted()` para mocks de kb-search-tool tests.** Plan no documentaba el pitfall. `vi.mock` se eleva al tope del archivo y los `const` top-level no están inicializados cuando el mock factory corre. Fix: encapsular `generateEmbeddingMock + rpcMock + mockSupabase` dentro de `vi.hoisted(() => {...})`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TS2322 en `tools` argument de `generateText`**
- **Found during:** Task 4 (post-creation TypeScript check)
- **Issue:** `buildSubLoopTools` sin return type explícito hizo que TS infiriera una unión de tres dicts con shapes diferentes. Esa unión incluye `getActiveOrderByPhone?: undefined` para low_confidence/razonamiento_libre, lo cual no es asignable a `ToolSet` esperado por `generateText`.
- **Fix:** Importar `type { ToolSet } from 'ai'` y anotar `function buildSubLoopTools(...): ToolSet`. Sin cast; type-safe.
- **Files modified:** src/lib/agents/somnio-v4/sub-loop/tools.ts
- **Verification:** `npx tsc --noEmit` exit 0 post-fix.
- **Committed in:** `21e2530` (mismo commit Task 4 — fix bundled inline antes del commit)

**2. [Rule 3 - Blocking] Vitest hoisting friction en kb-search-tool tests**
- **Found during:** Task 5 (primera ejecución de tests)
- **Issue:** `Cannot access 'generateEmbeddingMock' before initialization` — `vi.mock('../../knowledge-base/embed', () => ({ generateEmbedding: generateEmbeddingMock }))` falla porque la factory se eleva por encima de los `const` top-level.
- **Fix:** Encapsular los mocks en `vi.hoisted(() => {...})` que retorna un objeto desestructurado al top-level. Patrón estándar de vitest API; no documentado en plan.
- **Files modified:** src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts
- **Verification:** 5/5 tests PASS post-fix; TS clean.
- **Committed in:** `eb05ce1` (Task 5 commit; fix bundled con tests originales)

---

**Total deviations:** 2 auto-fixed (ambos Rule 3 blocking). Sin scope creep.
**Impact on plan:** Ambos fixes son artefactos del stack (TypeScript inference + vitest hoisting), no del diseño del plan. Cero impacto en interfaces / decisions / consumidores.

## Issues Encountered

- **Pre-existing dirty working tree:** trabajado solo con `git add <archivos-específicos>` por task; ningún commit incluyó archivos fuera de `files_modified` del plan. Trabajos in-progress de otras phases (voice-app, agent-godentist, debug docs, etc.) intactos en working tree.
- **Push diferido por constraint del prompt:** los 5 commits se quedan locales hasta antes del Plan 11. Vercel deploy NO ocurrió. La regla 1 del CLAUDE.md (push después de cambios) está intencionalmente diferida en somnio-sales-v4 hasta integrar todo el agente.
- **Migraciones Plans 01-03 NO aplicadas en prod:** Plan 05 NO ejecuta queries contra `agent_knowledge_base` ni invoca el RPC `match_knowledge_base` en runtime — solo expone funciones que serán invocadas en Plan 11+. Tests usan mocks. Cuando Plan 11 corra el corpus inicial, el usuario aplicará Wave 0 migrations primero.

## User Setup Required

Ninguno. Plan 05 es 100% autónomo (B-01 fix). Las migraciones Wave 0 (Plans 01-03 + RPC del Plan 02) se aplican antes de Plan 11, no de Plan 05.

## Next Phase Readiness

**Listo para consumir desde:**

- **Plan 06 (state machine + comprehension):** invocará `runSubLoop({ reason, ctx })` cuando los triggers D-02 disparen (low_confidence, crm_mutation, cas_reject, razonamiento_libre). El orquestador del agente sólo necesita pasar `userMessage`, `recentMessages`, `workspaceId`, `conversationId`, `sessionId` y el reason — el sub-loop se encarga del resto.
- **Plan 09 (Inngest knowledge-sync function):** podría reusar el RPC `match_knowledge_base` si decide hacer cross-validation en sync time (no obligatorio).
- **Plan 11 (corpus inicial):** poblará `## NUNCA decir` en los docs `.md` y al sincronizar (`pnpm knowledge:sync` del Plan 04), las rules quedarán en `agent_knowledge_base.nunca_decir`. El sub-loop las consumirá automáticamente vía RPC + post-gen check funcional desde el primer turn.

**Sin blockers detectados.**

## Self-Check

Verificación post-write de claims del SUMMARY:

**Files (8 nuevos):**

- `src/lib/agents/somnio-v4/sub-loop/output-schema.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/prompt.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/tools.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts` — FOUND

**Commits (5 task-commits):**

- `dd1b6cb` (Task 1, feat) — FOUND in git log
- `4caf7d8` (Task 2, feat) — FOUND in git log
- `837f568` (Task 3, feat) — FOUND in git log
- `21e2530` (Task 4, feat) — FOUND in git log
- `eb05ce1` (Task 5, test) — FOUND in git log

**Gates:**

- Tests: 12/12 PASS (`pnpm vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/` → `Test Files 2 passed (2)` + `Tests 12 passed (12)`)
- TypeScript: `npx tsc --noEmit -p tsconfig.json` exit 0 (cero errores en `src/lib/agents/somnio-v4/sub-loop/**`)
- D-24 grep: `grep -rE "from '@/lib/agents/somnio-v3" src/lib/agents/somnio-v4/` → 0 matches
- W-09 grep: `grep -c "row.nunca_decir" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` → 1 (presente en el `.map()`)
- W-09 anti-pattern: `grep -c "parseNuncaDecirFromCanonical" src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` → 0 (eliminado, columna DB es la fuente)
- Pitfall 2 grep: `grep -E 'inputSchema.*workspaceId|workspaceId.*z\.string' src/lib/agents/somnio-v4/sub-loop/kb-search-tool.ts` → 0 matches
- B-01: cero archivos SQL en `files_modified` de Plan 05 (RPC vive en Plan 02 Wave 0)

## Self-Check: PASSED

---
*Phase: somnio-sales-v4*
*Plan: 05*
*Completed: 2026-05-01*
