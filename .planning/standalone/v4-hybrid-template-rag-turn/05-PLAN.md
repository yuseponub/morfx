---
phase: v4-hybrid-template-rag-turn
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts
  - .planning/standalone/v4-hybrid-template-rag-turn/REGLA6-EVIDENCE.md
  - .planning/standalone/v4-hybrid-template-rag-turn/SMOKE-RESULTS.md
autonomous: true
requirements: [D-01, D-02, D-07, D-10, T-3, T-6]
must_haves:
  truths:
    - "The 8 Regla-6 no-regression greps/diffs against baseline 9fd422f0 all pass (no sibling files touched, CheckpointId still exactly 8)"
    - "No feature flag was introduced — v4 stays DORMANT and Regla 6 isolates the change without a flag (D-10)"
    - "Parity is preserved: the change lives in somnio-v4-agent.ts (shared by prod runner + sandbox via processMessage); V4AgentOutput shape only reuses templates/messages/newMode/requiresHuman/errorMessage"
    - "Smoke validates: D-01 schema stability (2 new fields, no AI_NoOutputGeneratedError), R3 confidence-swap (opposite coverages), the 4-case matrix, D-07 partial handoff, R5-A latency worst case"
  artifacts:
    - path: src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts
      provides: "deterministic smoke harness (mocked LLM) for matrix + partial handoff + interrupt + latency timing scaffold"
    - path: .planning/standalone/v4-hybrid-template-rag-turn/REGLA6-EVIDENCE.md
      provides: "captured output of the 8 Regla-6 greps/diffs vs baseline 9fd422f0 + D-10 no-feature-flag proof"
    - path: .planning/standalone/v4-hybrid-template-rag-turn/SMOKE-RESULTS.md
      provides: "recorded smoke outcomes incl. latency measurement + manual tone-coherence checklist for operator"
  key_links:
    - from: smoke-hybrid.test.ts
      to: processMessage (somnio-v4-agent.ts)
      via: "end-to-end agent invocation with mocked comprehend + runSubLoop"
      pattern: "processMessage"
---

<objective>
Final verification wave: prove the hybrid change is confined to v4 (Regla 6, baseline-scoped to `9fd422f0`), introduces NO feature flag (D-10 — v4 DORMANT already isolates it), preserves runner↔sandbox parity, and survives the locked-risk smokes (schema fragility D-01, confidence swap R3, 4-case matrix D-02, partial handoff D-07, latency R5-A, tone coherence). Includes a real-LLM smoke option behind an env gate plus a deterministic mocked smoke that runs in CI.

Purpose: Gate the phase against silent scope drift and the LLM-side risks the locked decisions flagged.
Output: smoke harness + Regla-6 evidence file + smoke results file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-hybrid-template-rag-turn/CONTEXT.md
@.planning/standalone/v4-hybrid-template-rag-turn/RESEARCH.md
@src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md

<interfaces>
RESEARCH.md §"No-regresión Regla 6" contains the 8 exact bash commands (lines 394-433). Baseline = `9fd422f0` (the discuss commit of THIS standalone), NOT main.
Parity: engine-v4.ts imports processMessage (sandbox); v4-production-runner.ts imports processMessage (prod). Both consume the same V4AgentOutput. Watch ONLY if the output SHAPE changed beyond reusing templates/messages/newMode/requiresHuman/errorMessage.
Existing smoke patterns: src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts and smoke-rag-b.test.ts (real-LLM-gated + mocked patterns to mirror).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Regla-6 no-regression verification vs baseline 9fd422f0 + parity check + D-10 no-feature-flag proof</name>
  <read_first>
    - RESEARCH.md lines 388-435 (the 8 greps/diffs — copy verbatim)
    - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md (parity contract)
    - src/lib/agents/somnio-v4/types.ts (V4AgentOutput — confirm no new field was added; only existing fields reused)
  </read_first>
  <action>
Run all 8 Regla-6 commands from RESEARCH.md against baseline `9fd422f0` and capture their output verbatim into `.planning/standalone/v4-hybrid-template-rag-turn/REGLA6-EVIDENCE.md` (one section per command, showing command + actual output + expected). The commands:

1. `git diff --name-only 9fd422f0..HEAD -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/` → expect 0 lines.
2. `git diff --name-only 9fd422f0..HEAD -- src/lib/agents/engine/v3-production-runner.ts` → expect 0.
3. `git diff --name-only 9fd422f0..HEAD -- src/lib/agents/interruption-system-v2/` → expect 0.
4. `grep -oE "'(ckpt_0_post_acquire|ckpt_1_post_comprehension|ckpt_2_post_state_machine|ckpt_3_post_tooling|ckpt_4_post_generation|ckpt_5_post_compliance|ckpt_6_pre_send_loop|ckpt_7_pre_template)'" src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l` → expect 8.
5. `git diff --name-only 9fd422f0..HEAD -- src/lib/agents/engine-adapters/production/messaging.ts` → expect 0.
6. `git diff --name-only 9fd422f0..HEAD -- src/lib/agents/production/handoff-handler.ts` → expect 0 (T-3=(a) reuses generic handoffMessage — confirms no custom-message code was added).
7. `git diff --name-only 9fd422f0..HEAD -- src/lib/agents/somnio-v4/` → expect ONLY somnio-v4/* (comprehension-schema, comprehension-prompt, somnio-v4-agent, response-track, slots.ts + their __tests__).
8. `git diff --name-only 9fd422f0..HEAD | grep -v "somnio-v4" | grep -i "comprehension"` → expect 0.

Plus a 9th confined-scope check: `git diff --name-only 9fd422f0..HEAD` and confirm the ONLY NON-somnio-v4 source file changed is `src/lib/agents/engine/v4-production-runner.ts` (Plan 04 Task 2 — v4-specific). If ANY sibling or shared file appears, STOP and flag a Regla-6 violation in REGLA6-EVIDENCE.md.

D-10 (no feature flag): run `git diff 9fd422f0..HEAD -- src/lib/agents/somnio-v4/` and grep it for any feature-flag introduction. Record the command + its 0-line output in REGLA6-EVIDENCE.md as proof that the change activates 100% via v4 being DORMANT (Regla 6 isolation), NOT via a flag:
`git diff 9fd422f0..HEAD -- src/lib/agents/somnio-v4/ | grep -iE "feature.?flag|FEATURE_FLAG|platform_config.*v4_hybrid.*enabled"` → expect 0 lines (D-10 — no feature flag added).

Parity check: confirm `grep -n "errorMessage\|requiresHuman\|newMode\|templates" src/lib/agents/somnio-v4/types.ts` shows V4AgentOutput reuses ONLY existing fields (no new field added by the refactor). Record in REGLA6-EVIDENCE.md that parity is automatic (change is in processMessage, shared by both runners) and no new output field was introduced.
  </action>
  <verify>
    <automated>bash -c 'test "$(git diff --name-only 9fd422f0..HEAD -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ src/lib/agents/engine/v3-production-runner.ts src/lib/agents/interruption-system-v2/ src/lib/agents/engine-adapters/production/messaging.ts src/lib/agents/production/handoff-handler.ts | wc -l)" = "0"'</automated>
  </verify>
  <acceptance_criteria>
    - REGLA6-EVIDENCE.md exists and contains all 8 commands with their captured output
    - Command 4 output is exactly `8` (CheckpointId unchanged — R6-B)
    - Commands 1,2,3,5,6,8 output 0 lines
    - Command 7 lists ONLY somnio-v4/* files
    - The 9th check confirms the only non-somnio-v4 source change is v4-production-runner.ts
    - `git diff 9fd422f0..HEAD -- src/lib/agents/somnio-v4/ | grep -iE "feature.?flag|FEATURE_FLAG|platform_config.*v4_hybrid.*enabled"` returns 0 lines (D-10 — no feature flag added), captured in REGLA6-EVIDENCE.md
    - The verify automated command exits 0 (all sibling/shared diffs empty)
  </acceptance_criteria>
  <done>All 8 Regla-6 checks pass; CheckpointId stays 8; the only non-v4 source change is the v4 runner; no feature flag introduced (D-10); parity documented.</done>
</task>

<task type="auto">
  <name>Task 2: Deterministic smoke harness (mocked LLM) — matrix + partial handoff + interrupt + latency scaffold</name>
  <read_first>
    - src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts + smoke-rag-b.test.ts (mirror the mocking + the real-LLM env-gate pattern)
    - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts (Plan 03 Task 3 — reuse its input/mocks)
  </read_first>
  <behavior>
Create `smoke-hybrid.test.ts` driving `processMessage` end-to-end with mocked comprehend + runSubLoop + resolveResponseTrack:
- Matrix smoke (D-02): one canonical input per cell, assert the message composition:
  - covered+covered → only templates, no rag:* message.
  - covered+low ("cuánto vale y lo puedo tomar si tengo apnea?") → templates.map(id) === ['precio','rag:contraindicaciones'] (order D-11), runSubLoop ctx.userMessage === secondary_query.
  - low+covered → rag message before template.
  - low+low → two rag:* messages, runSubLoop called twice (sequential).
- Partial handoff (D-07): covered+low where RAG returns no_match → output.templates includes the covered template (non-empty) AND output.newMode==='handoff' AND output.requiresHuman===true.
- Interrupt (R1-B): low slot returns no_match reason 'interrupted_at_ckpt_4_post_generation' → output.success===false, output.errorMessage==='interrupted_at_ckpt_4_post_generation', newMode not 'handoff'.
- Latency scaffold (R5-A): wrap the low+low case with `performance.now()` around `processMessage` and `console.log` the elapsed ms with prefix `[SMOKE-LATENCY low+low]`. With mocks this is ~0ms; the assertion is just that it completes — the REAL latency number is recorded manually in SMOKE-RESULTS.md from the optional real-LLM run.
  </behavior>
  <action>
Mirror the hoisting/mocking convention of smoke-rag-a.test.ts. Build a `describe('smoke-hybrid (mocked)', ...)`. Provide a fixture builder for the controlled analysis + a runSubLoop mock that returns a configurable LoopOutcome. Assert exact `output.templates.map(t => t.templateId)` sequences and the partial-handoff/interrupt fields. Add the latency `console.log` scaffold around the low+low case.

If a real-LLM smoke is desired, add a `describe.skipIf(!process.env.SMOKE_HYBRID_REAL)('smoke-hybrid (real LLM)', ...)` block that calls the REAL `comprehend` with the 4 opposite-coverage anchor inputs and asserts: (a) no throw / no AI_NoOutputGeneratedError (D-01), (b) secondary_confidence is a number (or null when ninguno), (c) for "cuánto vale y lo puedo tomar si tengo apnea?" the primary confidence > secondary confidence (R3 swap detection). Gate it behind the env var so CI stays deterministic.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "smoke-hybrid (mocked)" src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts` returns 1
    - `grep -c "\\[SMOKE-LATENCY low+low\\]" src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts` returns 1
    - `grep -c "rag:contraindicaciones" src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts` returns at least 1 (the canonical case order assertion)
    - `grep -c "SMOKE_HYBRID_REAL" src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts` returns at least 1 (real-LLM gate)
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts` exits 0
  </acceptance_criteria>
  <done>The mocked smoke covers the 4 matrix cells, partial handoff, interrupt, and a latency scaffold; the real-LLM block is env-gated for D-01/R3.</done>
</task>

<task type="auto">
  <name>Task 3: Record SMOKE-RESULTS.md + run the full v4 suite as the final regression gate</name>
  <read_first>
    - .planning/standalone/v4-hybrid-template-rag-turn/RESEARCH.md §R5 (latency expectations + matrix) and Open Questions (tone coherence, handoff message UX)
  </read_first>
  <action>
Run the full v4 test suite and the schema/slots/response-track/agent suites; record pass counts. Create `SMOKE-RESULTS.md` capturing:
- Suite results: `npx vitest run src/lib/agents/somnio-v4/` pass/fail counts.
- The mocked smoke-hybrid outcomes (matrix cells, partial handoff, interrupt) — PASS/FAIL.
- Latency (R5-A): if a real-LLM run was performed, the measured low+low(+CRM) elapsed ms; otherwise note "real-LLM latency DEFERRED to v4 activation-time (mocked smoke ~0ms; estimate 11-20s per RESEARCH A1, under lock TTL 45s)".
- Tone coherence (risk #4) + handoff-message UX (Open Q 1): MANUAL/operator checklist — mark as DEFERRED to v4 activation-time smoke (v4 DORMANT, 0 prod traffic), with the exact case to test ("cuánto vale y lo puedo tomar si tengo apnea?" should read as one voice; T-3 generic handoffMessage should not confuse the customer who already got the precio answer). These are subjective and require a human reading WhatsApp output, so they cannot be automated now.
- T-6 note: subLoopDebug captures the last RAG payload; array support deferred.
Run the full suite as the gate.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/</automated>
  </verify>
  <acceptance_criteria>
    - SMOKE-RESULTS.md exists with suite results + matrix/partial-handoff/interrupt outcomes + latency note + manual tone/handoff-UX deferral
    - `npx vitest run src/lib/agents/somnio-v4/` exits 0 (full v4 suite green — final regression gate)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Full v4 suite green; SMOKE-RESULTS.md records automated outcomes and explicitly defers the subjective tone/UX + real-LLM latency smokes to v4 activation-time.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Refactor diff → sibling agents | A misplaced edit could regress one of the 5 production siblings |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v4hy-09 | Tampering | sibling agent behavior | mitigate | 8 baseline-scoped Regla-6 diffs prove 0 sibling files touched; CheckpointId stays 8 |
| T-v4hy-10 | DoS | hybrid latency | accept | R5-A measured/estimated under lock TTL 45s; real-LLM latency deferred to activation (v4 DORMANT) |
</threat_model>

<verification>
- 8 Regla-6 checks pass; CheckpointId 8; only non-v4 change is v4 runner; no feature flag (D-10).
- Mocked smoke green for matrix + partial handoff + interrupt.
- Full v4 suite green; tsc clean.
- Subjective tone/UX + real-LLM latency explicitly deferred (documented).
</verification>

<success_criteria>
- REGLA6-EVIDENCE.md proves confinement to v4 vs baseline 9fd422f0 + no feature flag (D-10).
- smoke-hybrid.test.ts green (mocked) + real-LLM block env-gated for D-01/R3.
- SMOKE-RESULTS.md records outcomes + deferrals.
- `npx vitest run src/lib/agents/somnio-v4/` + `npx tsc --noEmit` exit 0.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-hybrid-template-rag-turn/05-SUMMARY.md`
</output>
</output>
