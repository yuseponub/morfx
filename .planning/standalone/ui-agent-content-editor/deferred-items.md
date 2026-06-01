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
