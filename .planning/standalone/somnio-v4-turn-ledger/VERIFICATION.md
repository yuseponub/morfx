---
phase: somnio-v4-turn-ledger
verified: 2026-05-28T23:10:00Z
status: passed
score: 18/18 must-haves verified
overrides_applied: 0
---

# somnio-v4-turn-ledger Verification Report

**Phase Goal:** "Cerrar el ciclo" — every turn, regardless of origin (templates, RAG, CRM, timer), produces ONE canonical record of what it did, and ONE commit persists it. Make state a REAL reflection of the whole agent (RAG and CRM included). Central bug closed (D-05): the RAG branch did not record anything durable.
**Verified:** 2026-05-28T23:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TurnLedger (complete) and TurnLedgerDims (persisted subset) are DISTINCT types with D-17 comment | VERIFIED | `types.ts:389-407` — both interfaces present with documenting comments citing D-17. TurnLedger has `comprehension`, `modeTransition`, `messagesSent` fields absent from TurnLedgerDims. |
| 2 | commitTurn is the single serialization point wrapping serializeState | VERIFIED | `state.ts:468` — `commitTurn` calls `serializeState(workingState)` internally and adds only `{atendido, crmActions}` subset. 10 calls to `commitTurn(` in somnio-v4-agent.ts; 0 commits bypass it. |
| 3 | RAG branch (mapOutcome generated) registers `kind:'kb_topic'` from outcome.sourceTopic/responseConfidence/responseText (D-05 central fix) | VERIFIED | `somnio-v4-agent.ts:1173-1196` — R5 path builds `{kind:'kb_topic', topic:outcome.sourceTopic, confidence:outcome.responseConfidence??0, texto:outcome.responseText, turno:state.turnCount}` and calls `commitTurn(state, ledgerR5)`. Comment documents the before/after explicitly. |
| 4 | Nobody reads turnLedgerDims intra-turn — dims only written; reads happen in future turns via deserialize (D-06) | VERIFIED | `input.turnLedgerDims` appears only in 3 interrupt/error passthrough returns (R7/R8/R9). Test at `somnio-v4-agent.test.ts:308-320` enforces `src not to match /turnLedgerDims\s*[.[]/ `. |
| 5 | Interrupt/error paths (R7, R8, R9) do NOT commit — they passthrough input.turnLedgerDims (D-07) | VERIFIED | `somnio-v4-agent.ts:203, 421, 838` — all three error/interrupt returns use `turnLedgerDims: input.turnLedgerDims ?? {atendido:[],crmActions:[]}` without calling commitTurn. |
| 6 | Parity P4: dims persist/restore/carryState present in BOTH v4-production-runner.ts AND engine-v4.ts | VERIFIED | Runner: 14 occurrences of `turnLedgerDims`/`turn_ledger_dims` (restore at line 321, carryState at 728 and 896, PATH B saveState at 1009). Engine-v4: occurrences at lines 281, 468, 510 (carryState + newState + restore). |
| 7 | Path A (wasInterruptedWithZeroSends) does NOT persist dims — only PATH B does (P6) | VERIFIED | `awk` extraction of the `if (wasInterruptedWithZeroSends) { ... } else {` block returns 0 matches for `turn_ledger_dims`. PATH A saveState (lines 979-988) has no dim fields; PATH B else-branch at line 1009 has `turn_ledger_dims: output.turnLedgerDims`. |
| 8 | carryState includes dims so a Path B reprocess does not lose or re-register ledger effects (P3) | VERIFIED | Runner line 896: `turnLedgerDims: output.turnLedgerDims` in carryState (≥1 sends path). Engine-v4 line 468: same. Test `state.test.ts:161` confirms carryState preserves kb_topic across iterations without double-registering. |
| 9 | Silence (R2) registers atendido kind:'silence' (D-15) | VERIFIED | `somnio-v4-agent.ts:666` builds `ledgerR2` with `[{kind:'silence'}]`. Test `somnio-v4-agent.test.ts:217` covers this. |
| 10 | Timer path (R10) produces crmActions with origen:'timer' (D-04) | VERIFIED | `somnio-v4-agent.ts:962` calls `commitTurn(mergedState, ledgerR3)` for timer path with crmActions carrying origen:'timer'. Tests `somnio-v4-agent.test.ts:340-380` cover timer ledger. |
| 11 | TurnLedger populates modeTransition + messagesSent in all 7 commit-paths (D-17, no phantom fields) | VERIFIED | `buildLedgerDims` helper (lines 1052-1064) always populates `modeTransition: {from: prevMode, to: toMode}` and `messagesSent`. R1/R2/R3 explicitly set these; R4/R5/R6/R10 use the helper. Test `somnio-v4-agent.test.ts:263` asserts no phantom fields. |
| 12 | Runner emits complete ledger to observability: kb_topic_registered + crm_action_recorded + turn_ledger_committed (D-13/D-17b) | VERIFIED | `v4-production-runner.ts:1032-1067` — three event types emitted in PATH B only. `turn_ledger_committed` at line 1059 carries modeTransition/confidence/messagesSent — consuming the non-persisted fields of TurnLedger. |
| 13 | Migration exists, is idempotent, only ADD COLUMN — no DROP/ALTER COLUMN/RENAME (D-13, Regla 5) | VERIFIED | `supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql` exists; grep for DROP/ALTER COLUMN/RENAME returns 0. Pattern is `DO $$ IF NOT EXISTS ... ALTER TABLE session_state ADD COLUMN turn_ledger_dims JSONB DEFAULT '{}' $$`. Summary confirms applied in prod before code push (Regla 5 gate honored). |
| 14 | SessionState has turn_ledger_dims optional without as any (D-16) | VERIFIED | `src/lib/agents/types.ts:308` — `turn_ledger_dims?: { atendido: unknown[]; crmActions: unknown[] }` — optional field with comment citing D-16 and Regla 6. |
| 15 | Legacy session deserialization is graceful (default [] / {}) (D-16) | VERIFIED | `state.ts:418+` `commitTurn` uses defaults; runner line 321: `?? {atendido:[],crmActions:[]}`. Test `state.test.ts:221-246` explicitly tests backward-compat deserialize. |
| 16 | State-tab shows KB Topics Atendidos + CRM Actions reading SandboxState.turnLedgerDims with strong typing (D-14, W-3) | VERIFIED | `state-tab.tsx:38-135` — reads `state.turnLedgerDims` typed as `TurnLedgerDims`; filter `(a): a is Extract<Atendido,{kind:'kb_topic'}> => a.kind==='kb_topic'` narrows without unknown. TAB_ICONS untouched. |
| 17 | Regla 6: zero ledger code in non-v4 agents (v3, godentist, godentist-fb-ig, recompra, pw-confirmation) | VERIFIED | grep of `turn_ledger\|TurnLedger\|commitTurn\|turn_ledger_dims` across all 5 non-v4 agent directories returns 0 matches. `interruption-system-v2` also untouched (git diff returns 0 files). |
| 18 | ARCHITECTURE.md documents Turn Ledger + corrects isCrmMutation dead code (D-10) | VERIFIED | `ARCHITECTURE.md:472-517` — section "5.3 Turn Ledger" documents TurnLedger vs TurnLedgerDims distinction, commit-paths, Path A/B, carryState, observability emit. Lines 233-249 correct `isCrmMutation=false` and flag standalone #2 as the consolidation point. |

**Score:** 18/18 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/lib/agents/somnio-v4/types.ts` | VERIFIED | `TurnLedger` (complete), `TurnLedgerDims` (persisted subset), `Atendido` (5-variant union), `CrmActionRegistrada` (D-04 shape), fields in V4AgentInput/Output |
| `src/lib/agents/somnio-v4/state.ts` | VERIFIED | `commitTurn` wraps `serializeState`, adds only `{atendido,crmActions}`, truncates texto to 500 chars, redacts PII in args |
| `src/lib/agents/types.ts` | VERIFIED | `SessionState.turn_ledger_dims` optional field at line 308, no `as any` |
| `src/lib/agents/somnio-v4/__tests__/state.test.ts` | VERIFIED | New file with 9 tests: 5 commitTurn tests + 2 carryState tests + 2 backward-compat deserialize tests — all pass |
| `src/lib/agents/somnio-v4/somnio-v4-agent.ts` | VERIFIED | 10 `commitTurn(` calls covering R1/R2/R3/R4/R5/R6/R10 + defensive null branches; `kind:'kb_topic'` at line 1173; R7/R8/R9 passthrough without commit |
| `src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` | VERIFIED | New file with 9 tests: RAG/silence/template/modeTransition/decisions-intact/D-06-no-read/R1/timer-x2 — all pass |
| `supabase/migrations/20260528000000_v4_turn_ledger_dims_column.sql` | VERIFIED | Idempotent ADD COLUMN, no destructive SQL, applied in prod (Regla 5) |
| `src/lib/agents/engine/v4-production-runner.ts` | VERIFIED | restore (line 321), carryState x2 (728/896), PATH B saveState (1009), observability emit (1032-1067); PATH A block has 0 dim references |
| `src/lib/agents/somnio-v4/engine-v4.ts` | VERIFIED | restore (line 281), carryState (468), newState (510) — sandbox parity with runner (P4) |
| `src/lib/sandbox/types.ts` | VERIFIED | `SandboxState.turnLedgerDims?: TurnLedgerDims` at line 265 — strongly typed |
| `src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx` | VERIFIED | KB Topics Atendidos + CRM Actions sections at lines 102-135, reads `SandboxState.turnLedgerDims`, narrowing type-guard, TAB_ICONS untouched |
| `src/lib/agents/somnio-v4/ARCHITECTURE.md` | VERIFIED | Section 5.3 Turn Ledger (lines 472-517); crm_mutation corrected (lines 233-249) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `commitTurn` | `serializeState` | wrap — commitTurn calls serializeState internally | WIRED | `state.ts:479` — `const serialized = serializeState(workingState)` inside commitTurn |
| `mapOutcomeToAgentOutput` (generated) | `atendido kind:'kb_topic'` | outcome.sourceTopic/responseConfidence/responseText | WIRED | `somnio-v4-agent.ts:1173-1196` — `kind:'kb_topic'` built from outcome fields, passed to `commitTurn` |
| `processUserMessage` return-paths | `commitTurn(mergedState, ledger)` | replaces direct serializeState | WIRED | 10 `commitTurn(` calls in agent; 3 remaining `serializeState` calls are `deserializeState` (init) and an internal call inside `mapOutcomeToAgentOutput` for baseOutput field extraction (not a duplicate commit path) |
| `v4-production-runner saveState PATH B` | `session_state.turn_ledger_dims` | `saveState({ turn_ledger_dims: output.turnLedgerDims })` | WIRED | Runner line 1009: `turn_ledger_dims: output.turnLedgerDims ?? {atendido:[],crmActions:[]}` |
| `carryState` (runner + engine) | Path B reprocess | includes `turnLedgerDims` from prior output | WIRED | Runner line 896, engine-v4 line 468 |
| `state-tab.tsx` | `SandboxState.turnLedgerDims` | render badges of atendido + crmActions | WIRED | `state-tab.tsx:38-135` — reads `state.turnLedgerDims`, renders KB Topics + CRM Actions sections |

---

### Behavioral Spot-Checks

Step 7b: Test suite substitutes for runnable spot-checks (v4 is DORMANT in prod — no live endpoint).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| state.test.ts: 9 tests (commitTurn roundtrip, truncation, PII redaction, carryState, backward-compat) | `npx vitest run src/.../state.test.ts` | 9/9 passed | PASS |
| somnio-v4-agent.test.ts: 9 tests (RAG kb_topic, silence, template, modeTransition, decisions-intact, D-06 no-read, R1 handoff, timer x2) | `npx vitest run src/.../somnio-v4-agent.test.ts` | 9/9 passed | PASS |
| engine-v4-lock.test.ts: 11 tests (lock + interruption system) | `npx vitest run src/.../engine-v4-lock.test.ts` | 11/11 passed | PASS |
| escalation.test.ts + transitions.test.ts | `npx vitest run` | 6+7 passed | PASS |
| Total non-LLM v4 suite | 5 test files | 42/42 passed | PASS |

---

### Anti-Patterns Found

No anti-patterns detected. Specific checks:

- No TODO/FIXME/placeholder comments in ledger-related code.
- No `return null` stubs in commitTurn or ledger construction.
- No hardcoded empty arrays that bypass ledger registration (the R7/R8/R9 passthrough of `input.turnLedgerDims` is correct D-07 behavior, not a stub — those paths explicitly discard the turn).
- The 3 remaining `serializeState` calls in somnio-v4-agent.ts (lines 145, 861, 1039) are: `deserializeState` (lines 145/861) and a baseOutput field extraction inside `mapOutcomeToAgentOutput` (line 1039) — none are commit paths that bypass `commitTurn`.
- Regla 6: 0 ledger references in v3/godentist/godentist-fb-ig/recompra/pw-confirmation.
- interruption-system-v2: 0 files touched per git diff.

---

### Human Verification Required

None. All critical behaviors verified programmatically via test suites and code inspection. The only deferred item is the live E2E sandbox smoke (visual rendering of KB Topics / CRM Actions in the browser at `/sandbox`) which requires a running app, but the component code is wired and passes TypeScript compilation.

---

## Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|-------------|------|-------------|--------|----------|
| D-01 | (approach) | Unified Turn Ledger approach | SATISFIED | CONTEXT.md + types.ts with TurnLedger |
| D-02 | Plan 03 | Cognición intra-turno unchanged | SATISFIED | Test `decisiones intactas` in somnio-v4-agent.test.ts:290 |
| D-03 | Plan 01 | Ledger captures comprehension/atendido/crmActions/modeTransition/messagesSent | SATISFIED | TurnLedger interface at types.ts:401-407 |
| D-04 | Plan 01 | CrmActionRegistrada shape with tool/args/result/code?/origen/stageAtTime? | SATISFIED | types.ts:374-381 |
| D-05 | Plan 03 | RAG branch registers kb_topic from outcome.* | SATISFIED | somnio-v4-agent.ts:1173-1196 — CENTRAL FIX |
| D-06 | Plan 03 | Dims only written intra-turn, read in future turns only | SATISFIED | input.turnLedgerDims only in interrupt/error passthroughs; test at line 308 |
| D-07 | Plan 03 | Interrupt/error paths do NOT commit | SATISFIED | R7/R8/R9 passthrough without commitTurn |
| D-08 | (deferred) | CRM security layers deferred to standalone #2 | SATISFIED | crmActions.args have minimal PII redaction only; shape anticipates #2 |
| D-09 | (Regla 6) | v4 DORMANT, only v4-specific files touched | SATISFIED | 0 non-v4 agent files contain ledger references |
| D-10 | Plan 05 | ARCHITECTURE.md updated + isCrmMutation corrected | SATISFIED | ARCHITECTURE.md:472-517 (Turn Ledger) + 233-249 (crm_mutation correction) |
| D-11 | Plan 01 | TurnLedger explicit type + commitTurn() unique | SATISFIED | state.ts:468 |
| D-12 | Plan 01/03 | Single commit = unique persistence point, NOT deferred mutations | SATISFIED | commitTurn wraps serializeState; working state mutates live |
| D-13 | Plan 02 | One JSONB column turn_ledger_dims in session_state | SATISFIED | Migration applied in prod + column default '{}' |
| D-14 | Plan 05 | Extend state-tab, NO new tab | SATISFIED | state-tab.tsx adds 2 sections; TAB_ICONS/tab-bar untouched |
| D-15 | Plan 01/03 | silence registered as Atendido kind:'silence' | SATISFIED | R2 path + somnio-v4-agent.test.ts:217 |
| D-16 | Plan 01 | Backward-compat deserialize with graceful defaults | SATISFIED | state.ts defaults + state.test.ts:221-246 |
| D-17 | Plan 01/03/04 | TurnLedger (complete) != TurnLedgerDims (persisted subset); modeTransition/messagesSent via observability | SATISFIED | Distinct types with D-17 comments; turn_ledger_committed event in runner |

---

## Summary

The `somnio-v4-turn-ledger` standalone achieved its stated goal. Every turn of the somnio-v4 agent now produces a canonical `TurnLedger` record via the single `commitTurn` serialization point. The central bug (D-05) is closed: the RAG branch at `mapOutcomeToAgentOutput` now registers `{kind:'kb_topic', topic, confidence, texto, turno}` from `outcome.*` fields, leaving a durable trace that was previously lost.

Key structural guarantees verified:
- `TurnLedger` (complete, in-memory) and `TurnLedgerDims` (persisted subset `{atendido, crmActions}`) are distinct types documented with D-17 commentary.
- `commitTurn` is the sole persistence boundary — no branch can "forget" to register.
- The 7 commit-paths (R1/R2/R3/R4/R5/R6/R10) all go through `commitTurn`; the 3 interrupt/error paths (R7/R8/R9) passthrough `input.turnLedgerDims` without committing (D-07).
- Runner and sandbox maintain exact parity (P4) for restore/carryState/persist.
- Path A (wasInterruptedWithZeroSends) correctly excludes dims from its saveState (P6 — the turn is discarded).
- The non-persisted fields of TurnLedger (`modeTransition`, `confidence`, `messagesSent`) are consumed by the observability emit in PATH B (`kb_topic_registered`, `crm_action_recorded`, `turn_ledger_committed`) — no phantom fields.
- Regla 6 satisfied: 0 ledger references in any non-v4 agent; `interruption-system-v2` untouched.
- 42/42 non-LLM v4 tests pass (state.test.ts: 9, somnio-v4-agent.test.ts: 9, engine-v4-lock.test.ts: 11, escalation: 6, transitions: 7).

---

_Verified: 2026-05-28T23:10:00Z_
_Verifier: Claude (gsd-verifier)_
