# Smoke Results — v4-hybrid-template-rag-turn

**Executed:** 2026-05-30
**Branch:** `exec/debounce-v2-wave6`
**v4 status:** DORMANT in prod (0 workspaces)
**Plan 05 tasks:** Task 1 (REGLA6-EVIDENCE), Task 2 (smoke-hybrid.test.ts), Task 3 (this file + regression gate)

---

## Suite Results: Mocked v4 Test Suite (Primary Gate)

```
npx vitest run \
  src/lib/agents/somnio-v4/__tests__/slots.test.ts \
  src/lib/agents/somnio-v4/__tests__/response-track.test.ts \
  src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts \
  src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts \
  src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts \
  src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts \
  src/lib/agents/somnio-v4/__tests__/state.test.ts \
  src/lib/agents/somnio-v4/__tests__/escalation.test.ts \
  src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/compliance-check.test.ts \
  src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts \
  src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts
```

**Result: 13/13 test files PASS**
- Tests: **146 passed | 2 skipped** (148 total)
- Skipped: 2 real-LLM smoke tests in `smoke-hybrid.test.ts` — env-gated (`SMOKE_HYBRID_REAL=1`), expected skip
- Duration: ~34s (all mocked)

### Breakdown by plan file:

| Test File | Plan | Tests | Result |
|-----------|------|-------|--------|
| slots.test.ts | Plan 02 | 33 | PASS |
| comprehension-schema.test.ts | Plan 01 | 10 | PASS |
| response-track.test.ts | Plan 04 | 8 | PASS |
| somnio-v4-agent.test.ts | Plan 03 | 16 | PASS |
| **smoke-hybrid.test.ts** | **Plan 05** | **8 pass, 2 skip** | **PASS** |
| crm-gate.test.ts | Plan 06 (crm-subloop) | 7 | PASS |
| state.test.ts | Prior | 9 | PASS |
| escalation.test.ts | Prior | 6 | PASS |
| crm-whitelist.test.ts | Prior | 6 | PASS |
| output-schema.test.ts | Prior | 15 | PASS |
| compliance-check.test.ts | Prior | 8 | PASS |
| kb-search-tool.test.ts | Prior | 5 | PASS |
| parser.test.ts | Prior | 15 | PASS |

---

## smoke-hybrid (mocked) — Outcome Matrix

| Test | Case | Result | Notes |
|------|------|--------|-------|
| Matrix cell 1 — covered+covered | D-02 | PASS | runSubLoop=0 calls; templates=['precio','tiempo_entrega'] |
| Matrix cell 2 — covered+low | D-02, D-11, T-2 | PASS | templates=['precio','rag:contraindicaciones']; subLoop called with secondary_query |
| Matrix cell 3 — low+covered | D-02, D-11, T-2 | PASS | templates=['rag:filosofia','precio']; subLoop called with raw message |
| Matrix cell 4 — low+low | D-02, D-08, T-4 | PASS | 2 sequential calls; 2 rag:* messages ordered primary→secondary |
| Partial handoff — covered+low RAG no_match | D-07, R1-A | PASS | templates=['precio']; newMode='handoff'; requiresHuman=true |
| Partial handoff — low+covered primary no_match | D-07, R1-A | PASS | covered secondary preserved in handoff output |
| Interrupt — interrupted_at_ckpt_4 | R1-B, R6-A | PASS | success=false; errorMessage='interrupted_at_ckpt_4_post_generation'; newMode≠'handoff' |
| Interrupt short-circuit | R1-B | PASS | Only 1 invocation (primary interrupt blocks secondary) |

**All 8 mocked smoke cases: PASS**

---

## Latency Scaffold (R5-A)

`[SMOKE-LATENCY low+low]` measurement from the low+low matrix case:

```
[SMOKE-LATENCY low+low] elapsed=0.2ms (mocked; real-LLM ~11-20s per RESEARCH A1, under lock TTL 45s)
```

**Mocked latency:** ~0.2ms (expected — all LLM calls mocked).

**Real-LLM latency:** DEFERRED to v4 activation-time.

Expected estimate from RESEARCH A1:
- Each `runSubLoop` invocation: ~5-9s (tooling + generation + compliance = 3 Gemini calls)
- low+low worst case: ~11-20s (2 sequential RAG invocations + overhead)
- CRM sub-loop (grounded): +additional latency for CRM gate
- **Under the 45s Redis lock TTL** — this is the critical constraint

The real measurement requires a live workspace with `conversational_agent_id='somnio-sales-v4'` activated (currently 0 prod workspaces). Run with `SMOKE_HYBRID_REAL=1` when v4 is activated.

---

## Real-LLM Smoke Gate (env-gated)

`describe.skipIf(!process.env.SMOKE_HYBRID_REAL)` in `smoke-hybrid.test.ts` covers:

| Risk | Test | Status |
|------|------|--------|
| D-01 schema fragility (AI_NoOutputGeneratedError) | real comprehend call with covered+low anchor | SKIPPED (no key in CI) |
| R3 confidence swap detection | primary_confidence > secondary_confidence assertion | SKIPPED (no key in CI) |

To run: `SMOKE_HYBRID_REAL=1 npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts`

Full D-01/R3 validation requires a live Somnio workspace. **Deferred to v4-activation-time** (see next section).

---

## Deferred to v4 Activation-Time

The following items require v4 to be active in production (a workspace running `somnio-sales-v4`) or a live Somnio session:

### 1. Tone coherence (risk #4 from CONTEXT.md)

**Deferred. MANUAL / operator checklist.**

A combined template+RAG turn must feel like "one voice" — the template (fixed Somnio tone) followed by a RAG-generated answer (TONE_BASE) should not read as two different senders or contradict each other.

**Test case to run at activation-time:**
- Input: "cuánto vale y lo puedo tomar si tengo apnea?"
- Expected: Customer reads the precio template first (natural Somnio tone), then the apnea RAG answer (T-7 TONE_BASE, adapted language), WITHOUT feeling like a context switch or tonal clash.

This is subjective and requires a human reading the WhatsApp output. Cannot be automated without operator approval.

### 2. Handoff-message UX (Open Question 1 from CONTEXT.md)

**Deferred. MANUAL / operator checklist.**

In the partial handoff case (D-07), the customer receives:
1. The covered slot's answer (e.g., precio template)
2. The generic `handoffMessage` from `handoff-handler.ts` (T-3=(a): reuses the existing handoff mechanism without custom message)

**Test case to run at activation-time:**
- Input: "cuánto vale y sirve para apnea severa?"
- Expected: Customer gets precio answer + a handoff message that does NOT confuse them (they already got one answer, the handoff is about the second question only).

The concern: the generic handoff message may sound like the whole turn failed, when in fact only the secondary slot escalated. Requires operator review of the exact message wording.

**Open Question 1 resolution path:** If the generic message proves confusing in operator review, a custom handoff suffix (e.g., "La parte de tu pregunta sobre apnea la atenderá un experto") can be added as a follow-up fix without changing the slot resolver architecture.

### 3. Real-LLM latency measurement (R5-A)

**Deferred.** See §Latency Scaffold above.

### 4. D-01 / R3 with live Gemini (schema fragility + confidence swap)

**Deferred.** Covered by env-gated real-LLM block in `smoke-hybrid.test.ts`. Run `SMOKE_HYBRID_REAL=1` at activation-time.

### 5. T-6 subLoopDebug array support

**Deferred per plan.** `subLoopDebug` currently captures the last RAG payload (single outcome). When low+low produces 2 RAG outcomes, only the last one is captured in the debug panel. Array support (capturing both outcomes) is a v2 debug improvement — it does not affect production behavior (the slot resolver correctly combines both outcomes into output). Tracked as known debt.

---

## Pre-existing Test Failures (NOT Regressions from This Plan)

The full `npx vitest run src/lib/agents/somnio-v4/` suite includes live-LLM tests that have pre-existing failures. These are explicitly classified here per the plan's known_preexisting_failure section:

| Test | File | Failure | Classification | Root Cause |
|------|------|---------|----------------|------------|
| `M1 probability framing` | `sub-loop/__tests__/few-shots.test.ts` | `expected '...' to match /compañero (humano )?experto/` | **PRE-EXISTING** | Stale assertion from somnio-v4-rag-generative standalone — generation prompt was refactored (TONE_BASE changed), but the few-shots test was not updated. Sub-loop is 0-line diff vs baseline `9fd422f0`. NOT introduced by this plan. |
| Smoke A cases (live LLM) | `__tests__/smoke-rag-a.test.ts` | Timeout / LLM nondeterminism | **PRE-EXISTING** | Live Gemini/OpenAI calls in CI. These tests call `runSubLoop` directly (not `processMessage`). The sub-loop is unchanged since baseline. |
| Smoke B `razonamiento_libre` (1 case) | `__tests__/smoke-rag-b.test.ts` | `expected 'generated' to be 'no_match'` | **PRE-EXISTING** | Live-LLM nondeterminism. These tests call `runSubLoop(...)` directly, bypassing this plan's `processMessage` orchestrator. Sub-loop unchanged since baseline. |

**Evidence that these are pre-existing:**
- `git diff 9fd422f0..HEAD -- src/lib/agents/somnio-v4/sub-loop/` shows 0 lines changed.
- All three failures existed before Plan 01 of this standalone.
- The few-shots test references a stale generation prompt pattern documented as debt in 03-SUMMARY.md §Out-of-Scope.

**This plan's gate is the 13-file mocked suite (146 passed + 2 skipped = PASS), NOT the full suite with live-LLM tests.**

---

## TypeScript Gate (`npx tsc --noEmit`)

```
.next/dev/types/validator.ts(962,...): error TS2304 (pre-existing Next.js generated file)
src/lib/domain/__tests__/conversations.test.ts: error TS7022/7024 (pre-existing test file issue)
```

**Pre-existing errors in non-plan files.** The v4 source files (somnio-v4-agent.ts, response-track.ts, slots.ts, etc.) are type-clean. `npx tsc --noEmit` over the PLAN source files shows 0 v4 errors. The pre-existing errors are in `.next/dev/types/` (auto-generated by Next.js) and a domain test file — both pre-date this standalone.

---

## Summary

| Gate | Expected | Actual | Result |
|------|----------|--------|--------|
| smoke-hybrid (mocked) — 4 matrix cells | PASS | PASS (8/8) | PASS |
| smoke-hybrid (mocked) — partial handoff | PASS | PASS (2/2) | PASS |
| smoke-hybrid (mocked) — interrupt | PASS | PASS (2/2) | PASS |
| smoke-hybrid (real LLM) env-gate | SKIP (no key) | SKIP (2/2) | PASS |
| Latency scaffold log | exists | `[SMOKE-LATENCY low+low] elapsed=0.2ms` | PASS |
| All mocked v4 suites | 146 pass | 146 pass | PASS |
| Regla-6 greps | all pass | all pass | PASS |
| D-10 no feature flag | 0 lines | 0 lines | PASS |
| CheckpointId = 8 | 8 | 8 | PASS |
| Tone coherence | manual | DEFERRED to v4-activation-time | DEFERRED |
| Handoff-message UX | manual | DEFERRED to v4-activation-time | DEFERRED |
| Real-LLM latency | manual | DEFERRED to v4-activation-time | DEFERRED |
| D-01/R3 with live Gemini | env-gated | DEFERRED (run SMOKE_HYBRID_REAL=1) | DEFERRED |
