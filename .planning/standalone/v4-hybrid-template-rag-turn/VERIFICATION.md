---
phase: v4-hybrid-template-rag-turn
verified: 2026-05-30T11:46:00Z
status: human_needed
score: 18/18 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification — no prior VERIFICATION.md"
human_verification:
  - test: "Tone coherence on canonical case — send 'cuánto vale y lo puedo tomar si tengo apnea?' to a live v4 workspace"
    expected: "Customer reads precio template (fixed Somnio tone) then apnea RAG answer (TONE_BASE) as ONE voice, no tonal clash or context-switch feel"
    why_human: "Subjective WhatsApp output quality; requires human reading a real conversation; v4 DORMANT (0 prod workspaces)"
  - test: "Partial handoff UX — send 'cuánto vale y sirve para apnea severa?' (covered+low where RAG no_match)"
    expected: "Customer gets precio answer + generic handoffMessage that does NOT read as 'whole turn failed' — only the secondary question escalated"
    why_human: "Open Question 1 — generic handoff wording may confuse a customer who already got one answer; needs operator review; T-3=(a) reuses generic message by design"
  - test: "Real-LLM latency low+low worst case (SMOKE_HYBRID_REAL=1 at activation)"
    expected: "2 sequential RAG invocations complete ~11-20s, under the 45s Redis lock TTL"
    why_human: "Requires live Gemini/OpenAI calls against a real workspace; mocked smoke is ~0.2ms; v4 DORMANT"
  - test: "D-01 schema fragility + R3 confidence-swap with live Gemini (SMOKE_HYBRID_REAL=1)"
    expected: "No AI_NoOutputGeneratedError; secondary_confidence is a number (or null when ninguno); for the canonical case primary_confidence > secondary_confidence (no swap)"
    why_human: "Env-gated real-LLM block; cannot run deterministically in CI without API key; v4 DORMANT"
---

# Phase v4-hybrid-template-rag-turn Verification Report

**Phase Goal:** Replace the binary early-return lever in somnio-v4 (escalate EVERYTHING to RAG, decided by the primary intent alone — formerly `somnio-v4-agent.ts:243-314`) with a per-intent coverage decision: a 2-slot resolver that combines deterministic templates + generative RAG in the SAME turn. v4 is DORMANT (Regla 6).
**Verified:** 2026-05-30T11:46:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Exclusive early-return gone (`return mapOutcomeToAgentOutput`=0; old `if (earlyReason===...)`=0) | ✓ VERIFIED | grep both = 0 in `somnio-v4-agent.ts`; lines 270-275 document removal; flow now proceeds guards→CKPT-2→sales-track→gate-CRM→response-track→slot resolver |
| 2 | 2-slot resolver runs at END (post-sales-track, post-gate-CRM, post-response-track) | ✓ VERIFIED | `computeSlots` at L232 (after threshold lookup), resolver block L512-625 AFTER `resolveResponseTrack` (L463) + gate-CRM (T-1=(b)) |
| 3 | `computeSlots` (slots.ts) imported and used | ✓ VERIFIED | `import { computeSlots, SlotPlan, SlotDecision } from './slots'` L46; called L232; grep=4 uses |
| 4 | `secondary_confidence`/`secondary_query` (schema) consumed | ✓ VERIFIED | Schema fields present (`comprehension-schema.ts`); consumed at L236-237 into computeSlots args |
| 5 | D-01: per-intent confidence via extended comprehension (nullable) | ✓ VERIFIED | 3 nullable fields in schema; prompt anchors + null-when-ninguno rule present |
| 6 | D-02: 4-case matrix + none case | ✓ VERIFIED | `slots.ts` computeSlots: covered/low per intent + secondary=null when 'ninguno'; 33 slots.test.ts pass |
| 7 | D-03: only the low intent escalates | ✓ VERIFIED | response-track gates LOW intent template; covered intent keeps template; slots returns coverage per-intent |
| 8 | D-04: comprehension emits secondary_query; RAG uses it | ✓ VERIFIED | `secondary_query` field + prompt; resolver passes `slot.ragQuery` (= secondary_query for low secondary) as `ctx.userMessage` L544 |
| 9 | D-05: RAG enters as CORE | ✓ VERIFIED | `ragMessages.push({ templateId: rag:..., priority: 'CORE' })` L570-576 |
| 10 | D-06: max 2 intents | ✓ VERIFIED | Schema primary+secondary only; slot plan has primary + (secondary\|null) |
| 11 | D-07: partial handoff — resolved slot sent + flag handoff (R1-A) | ✓ VERIFIED | `handoffSlots` (grep=4); `partialHandoff` → newMode='handoff' + requiresHuman=true L749/791; combinedMessages never emptied when >0 (R1-A) L746-748, 654-656 |
| 12 | D-08/T-4: RAG+RAG sequential, 2 invocations | ✓ VERIFIED | `await runSubLoop` sequential L621+L624; `Promise.all`=0; smoke cell-4 asserts 2 calls |
| 13 | D-09: same threshold for both intents | ✓ VERIFIED | single `threshold` from `getLowConfidenceThreshold()` passed to both slots in computeSlots |
| 14 | D-10: no feature flag | ✓ VERIFIED | `git diff 9fd422f0..HEAD -- somnio-v4/ \| grep -iE "feature.?flag..."` = 0 lines |
| 15 | D-11: message order = intent order (primary→secondary) | ✓ VERIFIED | ragMessages pushed [primary,secondary]; combinedMessages ordered L654-656; smoke cells 2/3 assert id sequence |
| 16 | T-1 resolver at end; T-2 raw/sub-query; T-5 .nullable; T-6 subLoopDebug last; T-7 rag:* filtered; T-8 LOW template gated | ✓ VERIFIED | T-2 L544 (slot.ragQuery, raw for primary/secondary_query for secondary); T-5 3×.nullable; T-6 `capturedSubLoopDebug = p` L554; T-7 runner L839 `!id.startsWith('rag:')`; T-8 response-track `!== 'low'` gates |
| 17 | Interrupt → errorMessage (Path A), NOT handoff (R1-B/R6-A) | ✓ VERIFIED | `interrupted_at_ckpt_` discriminator L558-566; interrupt short-circuit returns errorMessage shape L631-647, newMode NOT set to handoff |
| 18 | Single commitTurn with combined atendido[] (covered + kb_topic + handoff) | ✓ VERIFIED | atendidoR3 combines sales_action/template_intent + ragAtendido(kb_topic) + handoffSlots(handoff) L750-767; single `commitTurn` on happy path L783 |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `comprehension-schema.ts` | 3 nullable secondary fields | ✓ VERIFIED | secondary_confidence/_reasoning/_query all `.nullable()`; grep each = 1; no .optional() added |
| `comprehension-prompt.ts` | anti-swap anchors + null rule | ✓ VERIFIED | "SECONDARY INTENT — COBERTURA Y SUB-QUERY"=1; "anti-swap"=1; apnea anchor=1; secondary_confidence=0.25 ×2 |
| `slots.ts` | computeSlots pure 4-case + T-2 | ✓ VERIFIED | reuses decideSubLoopReason (6 refs); 0 createAdminClient/generateText/domain; full matrix + ragQuery selection |
| `somnio-v4-agent.ts` | slot orchestration + single commitTurn | ✓ VERIFIED | resolver L512-625; combiner L649-656; interrupt short-circuit; partial handoff; combined ledger |
| `response-track.ts` | coverage-gated info templates | ✓ VERIFIED | `intentCoverage !== 'low'`=1; `secondaryCoverage !== 'low'`=1; sales actions unaffected |
| `v4-production-runner.ts` | rag:* filter + R4-B passthrough | ✓ VERIFIED | T-7 sentIds filter L839; R4-B no-rep passthrough L796 (order-preserving) |
| smoke-hybrid.test.ts + 4 suites | matrix/handoff/interrupt/latency | ✓ VERIFIED | 75 pass / 2 skip across 5 suites |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| slots.ts | escalation.decideSubLoopReason | per-intent reuse | ✓ WIRED | imported L31, used for primary+secondary (6 refs) |
| somnio-v4-agent.ts | slots.computeSlots | per-intent coverage | ✓ WIRED | import L46, call L232 |
| somnio-v4-agent.ts | sub-loop runSubLoop | per-low-slot RAG w/ slot.ragQuery | ✓ WIRED | `await runSubLoop({ ctx.userMessage: slot.ragQuery ?? input.message })` L536-544 |
| somnio-v4-agent.ts | response-track resolveResponseTrack | passes slot coverage | ✓ WIRED | intentCoverage/secondaryCoverage args L463-464 |
| v4-production-runner.ts | templates_enviados | actuallySentIds filtered of rag:* | ✓ WIRED | filter L839 before push; all 3 persist sites consume actuallySentIds |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 5 phase suites green | `vitest run` schema/slots/agent/response-track/smoke-hybrid | 75 pass, 2 skip | ✓ PASS |
| slots matrix | slots.test.ts | 33/33 | ✓ PASS |
| canonical case order | smoke-hybrid cell 2 → ['precio','rag:contraindicaciones'] | asserted | ✓ PASS |
| sequential RAG×2 | smoke-hybrid cell 4 → runSubLoop ×2 | asserted | ✓ PASS |
| partial handoff | smoke-hybrid → templates non-empty + newMode=handoff | asserted | ✓ PASS |
| interrupt-not-handoff | smoke-hybrid → errorMessage, newMode≠handoff | asserted | ✓ PASS |
| latency scaffold | `[SMOKE-LATENCY low+low]` log | elapsed=0.2ms (mocked) | ✓ PASS |
| few-shots failure is pre-existing | run few-shots.test.ts | 1 fail in `buildGenerationPrompt` (sub-loop, 0-line diff) | ✓ NON-REGRESSION |

### Requirements Coverage (D-01..D-11 / T-1..T-8)

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| D-01 | per-intent confidence via extended comprehension | ✓ SATISFIED | 3 nullable fields + prompt; schema suite stable (no AI_NoOutputGeneratedError in mocked) |
| D-02 | 4-case matrix | ✓ SATISFIED | computeSlots + 33 tests |
| D-03 | only low escalates | ✓ SATISFIED | response-track gating + per-intent coverage |
| D-04 | secondary_query partition | ✓ SATISFIED | field + T-2 wiring |
| D-05 | RAG as CORE | ✓ SATISFIED | priority:'CORE' literal |
| D-06 | max 2 intents | ✓ SATISFIED | schema-enforced |
| D-07 | partial handoff | ✓ SATISFIED | handoffSlots + R1-A guard |
| D-08 | RAG+RAG = 2 calls | ✓ SATISFIED | sequential await; no Promise.all |
| D-09 | same threshold | ✓ SATISFIED | single threshold both slots |
| D-10 | no feature flag | ✓ SATISFIED | grep = 0 |
| D-11 | intent order | ✓ SATISFIED | combinedMessages order + tests |
| T-1 | resolver at end (b) | ✓ SATISFIED | post-sales/gate/response-track placement |
| T-2 | raw primary / sub-query secondary | ✓ SATISFIED | slots.ragQuery selection |
| T-3 | generic handoff (handoff-handler 0-diff) | ✓ SATISFIED | check 6 = 0 lines |
| T-4 | sequential RAG | ✓ SATISFIED | no Promise.all |
| T-5 | .nullable not .optional | ✓ SATISFIED | 3×.nullable, .optional unchanged |
| T-6 | subLoopDebug last (array deferred) | ✓ SATISFIED | capturedSubLoopDebug=p |
| T-7 | rag:* filtered from templates_enviados | ✓ SATISFIED | runner L839 |
| T-8 | LOW template gated | ✓ SATISFIED | response-track coverage gate |

### Regla-6 No-Regression (8-grep table, re-run against baseline 9fd422f0)

| # | Check | Expected | Actual (re-run) | Result |
|---|-------|----------|-----------------|--------|
| 1 | 5 siblings (v3/godentist/godentist-fb-ig/recompra/pw-confirmation) | 0 | 0 | ✓ PASS |
| 2 | v3-production-runner.ts | 0 | 0 | ✓ PASS |
| 3 | interruption-system-v2/ | 0 | 0 | ✓ PASS |
| 4 | CheckpointId count | 8 | 8 | ✓ PASS (R6-B) |
| 5 | messaging.ts (Phase 31 adapter) | 0 | 0 | ✓ PASS |
| 6 | handoff-handler.ts | 0 | 0 | ✓ PASS (T-3=(a)) |
| 7 | changes confined to somnio-v4/ | only v4 files | 10 v4 files only | ✓ PASS |
| 8 | sibling comprehension files | 0 | 0 | ✓ PASS |
| 9 | non-v4 non-planning source | v4-runner only | v4-production-runner.ts + its restart test (both v4-specific) | ✓ PASS |
| Parity | V4AgentOutput shape | no new field | templates/newMode/errorMessage/requiresHuman all pre-existing | ✓ PASS |

**Independently re-run by verifier — all match the executor's REGLA6-EVIDENCE.md claims. sub-loop dir 0-line diff vs baseline confirmed.**

### Anti-Patterns Found

None. No TODO/FIXME/placeholder/stub patterns in the slot resolver or slots.ts. RAG message construction is substantive (real outcome fields), ledger commit is real, response-track gating is conditional logic (not stubbed).

### Pre-existing Test Failures (NOT regressions — out of scope)

| Test | File | Why NOT a regression |
|------|------|----------------------|
| M1 probability framing | sub-loop/__tests__/few-shots.test.ts | Asserts `buildGenerationPrompt` output (sub-loop generation prompt). `git diff 9fd422f0..HEAD -- sub-loop/` = 0 lines. Stale assertion debt from somnio-v4-rag-generative standalone. |
| smoke-rag-a (live) | __tests__/smoke-rag-a.test.ts | Live-LLM timeout; file 0-line diff; calls runSubLoop directly (not processMessage). |
| smoke-rag-b razonamiento_libre | __tests__/smoke-rag-b.test.ts | Live-LLM nondeterminism; file 0-line diff; bypasses this phase's orchestrator. |

These are documented in `deferred-items.md` and `SMOKE-RESULTS.md` as out-of-scope debt. Verifier confirms all 3 files are 0-line diff vs baseline → cannot be regressions from this phase.

### Human Verification Required

1. **Tone coherence** — canonical case "cuánto vale y lo puedo tomar si tengo apnea?" must read as one voice (template + RAG). Subjective WhatsApp output. v4 DORMANT.
2. **Partial-handoff UX** — generic handoffMessage must not confuse a customer who already got one answer (Open Question 1).
3. **Real-LLM latency** — low+low worst case ~11-20s under 45s lock TTL (SMOKE_HYBRID_REAL=1 at activation).
4. **D-01/R3 with live Gemini** — schema stability + no confidence swap (env-gated real-LLM block).

All four are explicitly deferred to v4-activation-time (v4 has 0 prod workspaces). They do not block the phase goal which is structurally delivered and unit/mocked-smoke verified.

### Gaps Summary

**No structural gaps.** The phase goal is fully delivered in the actual codebase:
- The exclusive early-return is removed (verified grep=0).
- A per-intent 2-slot resolver runs at end-of-pipeline, reusing computeSlots + the canonical escalation rule.
- The 4-case matrix, partial handoff (R1-A), interrupt-not-handoff (R1-B/R6-A), sequential RAG×2, rag:* pseudo-id filtering (T-7), LOW-template gating (T-8), and combined single-commitTurn ledger are all implemented, wired, and covered by green mocked tests.
- Regla 6 holds: independently re-run 8-grep table all pass, CheckpointId=8, no sibling/shared file touched, no feature flag (D-10), V4AgentOutput shape unchanged (parity automatic).

The only open items are subjective/real-LLM verifications that genuinely require v4 to be active in production — correctly deferred. Status is `human_needed` (not `passed`) solely because these human-verification items exist; there are zero failing must-haves.

---

_Verified: 2026-05-30T11:46:00Z_
_Verifier: Claude (gsd-verifier)_
