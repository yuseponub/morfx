# Deferred Items — ui-agent-content-editor

## Out-of-scope discoveries during Plan 06 execution

### D1 — Pre-existing tsc error in Plan 04 KB domain test (not introduced by Plan 06)
- **File:** `src/lib/domain/__tests__/agent-knowledge-base.test.ts:280`
- **Error:** `TS2783: 'topic' is specified more than once, so this usage will be overwritten.`
- **Cause:** the restore test fixture spreads `...EDITABLE` (which contains `topic`) after an explicit `topic: 'precio'` (or vice-versa), so the literal key is overwritten. Cosmetic — the test's intent is preserved at runtime, but tsc flags the duplicate key.
- **Introduced by:** commit `4725c5d2` (Plan 04 — `test(ui-agent-content-editor-04): KB domain tests GREEN`). Pre-dates Plan 06.
- **Why deferred:** Plan 06 is UI-only; this is a test-file typescript lint in a different plan's artifact. Out of scope per the executor scope-boundary rule.
- **Fix when picked up:** reorder the object so `topic` is declared once (drop the explicit `topic:` or omit it from the spread).

### D2 — Pre-existing implicit-any in unrelated test
- **File:** `src/lib/domain/__tests__/conversations.test.ts:16`
- **Error:** `TS7022 / TS7024` (`eqMock` implicitly any in its own initializer).
- **Introduced by:** unrelated work (`307aa8da` routing-channel-fact lineage). Pre-dates Plan 06.
- **Why deferred:** unrelated file, not touched by Plan 06.

## Out-of-scope full-suite failures observed during Plan 07 (`pnpm test`)

Full suite ran during Plan 07 Task 1: `6 failed | 104 passed | 12 skipped (122)` files; `3 failed | 1086 passed | 42 skipped (1147)` tests. **None of the 6 failed files belong to ui-agent-content-editor** (verified: 0 content-editor commits touch any of them). The 4 standalone test files are 22/22 green. These are logged here per the executor scope-boundary rule and NOT fixed — they belong to sibling standalones / integration suites sharing branch `exec/debounce-v2-wave6`.

### D3 — crm-bots integration tests fail at file level (require DB/env)
- **Files:** `src/__tests__/integration/crm-bots/{reader,security,ttl-cron,writer-two-step}.test.ts`
- **Owner:** crm-reader / crm-writer / crm-bots integration suites.
- **Why deferred:** integration tests needing DB connection/env; pre-existing; zero relation to this standalone.

### D4 — somnio-v4-rag-generative prompt-wording assertion drift
- **Files:** `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` (`prompt contains M1 probability framing` — assertion `/compañero (humano )?experto/`) + `src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` (3 `razonamiento_libre` cases).
- **Owner:** `somnio-v4-rag-generative` standalone (few-shots created by commit `15f8bbfd`).
- **Cause:** the generation-prompt text changed in that standalone's later work; the test assertions drifted.
- **Why deferred:** owned by a different standalone; out of scope for ui-agent-content-editor Plan 07.
