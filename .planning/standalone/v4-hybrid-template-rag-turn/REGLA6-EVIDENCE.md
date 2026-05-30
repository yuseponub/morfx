# Regla-6 Evidence — v4-hybrid-template-rag-turn

**Baseline:** `9fd422f0` (discuss commit of THIS standalone — NOT main; the branch `exec/debounce-v2-wave6` is ahead with unrelated work).
**Executed:** 2026-05-30
**v4 status:** DORMANT in prod (0 workspaces) — Regla 6 satisfied by construction without a feature flag.

---

## Check 1 — Siblings NOT touched

```bash
git diff --name-only 9fd422f0..HEAD -- \
  src/lib/agents/somnio-v3/ \
  src/lib/agents/godentist/ \
  src/lib/agents/godentist-fb-ig/ \
  src/lib/agents/somnio-recompra/ \
  src/lib/agents/somnio-pw-confirmation/
```

**Actual output:** _(empty — 0 lines)_

**Expected:** 0 lines. **PASS**

---

## Check 2 — v3-production-runner.ts NOT touched

```bash
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/engine/v3-production-runner.ts
```

**Actual output:** _(empty — 0 lines)_

**Expected:** 0 lines. **PASS**

---

## Check 3 — interruption-system-v2/ NOT touched

```bash
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/interruption-system-v2/
```

**Actual output:** _(empty — 0 lines)_

**Expected:** 0 lines. **PASS**

---

## Check 4 — CheckpointId count = 8 (R6-B gate)

```bash
grep -oE "'(ckpt_0_post_acquire|ckpt_1_post_comprehension|ckpt_2_post_state_machine|ckpt_3_post_tooling|ckpt_4_post_generation|ckpt_5_post_compliance|ckpt_6_pre_send_loop|ckpt_7_pre_template)'" \
  src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l
```

**Actual output:** `8`

**Expected:** 8. **PASS**

The 8 CheckpointId values are unchanged. The hybrid slot resolver's two sequential RAG invocations reuse the existing CKPT-3/4/5 without introducing new checkpoint IDs (R6-B).

---

## Check 5 — ProductionMessagingAdapter NOT touched

```bash
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/engine-adapters/production/messaging.ts
```

**Actual output:** _(empty — 0 lines)_

**Expected:** 0 lines. **PASS**

---

## Check 6 — handoff-handler.ts NOT touched (T-3=(a) reuses generic)

```bash
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/production/handoff-handler.ts
```

**Actual output:** _(empty — 0 lines)_

**Expected:** 0 lines. **PASS**

T-3=(a) confirmed: partial handoff reuses the existing generic `handoffMessage` path with no custom-message code added.

---

## Check 7 — Changes confined to somnio-v4/

```bash
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/somnio-v4/
```

**Actual output:**
```
src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts
src/lib/agents/somnio-v4/__tests__/response-track.test.ts
src/lib/agents/somnio-v4/__tests__/slots.test.ts
src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
src/lib/agents/somnio-v4/comprehension-prompt.ts
src/lib/agents/somnio-v4/comprehension-schema.ts
src/lib/agents/somnio-v4/response-track.ts
src/lib/agents/somnio-v4/slots.ts
src/lib/agents/somnio-v4/somnio-v4-agent.ts
```

**Expected:** Only `somnio-v4/*` files. **PASS**

All changed files are within `src/lib/agents/somnio-v4/`:
- `comprehension-schema.ts` — Plan 01: added `secondary_confidence` + `secondary_query` fields
- `comprehension-prompt.ts` — Plan 01: updated prompt to elicit per-intent confidence
- `slots.ts` — Plan 02: `computeSlots` helper (new file)
- `somnio-v4-agent.ts` — Plan 03: slot resolver + partial handoff; Plan 04: coverage wiring
- `response-track.ts` — Plan 04: coverage-gated informational template selection (T-8)
- `__tests__/comprehension-schema.test.ts` — Plan 01 tests
- `__tests__/slots.test.ts` — Plan 02 tests
- `__tests__/somnio-v4-agent.test.ts` — Plan 03 hybrid matrix tests
- `__tests__/response-track.test.ts` — Plan 04 TDD tests

---

## Check 8 — Sibling comprehension files NOT affected

```bash
git diff --name-only 9fd422f0..HEAD | grep -v "somnio-v4" | grep -i "comprehension"
```

**Actual output:** _(empty — 0 lines)_

**Expected:** 0 lines. **PASS**

The `comprehension-schema.ts` / `comprehension-prompt.ts` changes are exclusively inside `src/lib/agents/somnio-v4/`. Siblings (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation) use their own agent-specific schemas — adding fields to v4's schema is naturally isolated.

---

## Check 9 — Confined scope: non-somnio-v4 source changes

```bash
git diff --name-only 9fd422f0..HEAD | grep -v "^\.planning/" | grep -v "somnio-v4"
```

**Actual output:**
```
src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts
src/lib/agents/engine/v4-production-runner.ts
```

**Analysis:**
- `src/lib/agents/engine/v4-production-runner.ts` — **EXPECTED** (Plan 04 Task 2: added `rag:*` sentIds filter T-7 and R4-B no-rep passthrough). This is the v4-specific runner (not the shared v3 runner). Confirmed v4-only.
- `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` — v4-specific test file from `debounce-v2-interrupt-reprocess` standalone (Pitfall 7 fix), unrelated to this hybrid standalone but committed on the same integration branch. Confirmed v4-only.

**Result:** The only non-somnio-v4/ source changes are `v4-production-runner.ts` (v4-specific, intentional from Plan 04) and its test file (pre-existing from a prior v4 standalone). **PASS** — No sibling or shared infrastructure touched.

---

## D-10 Check — No feature flag introduced

```bash
git diff 9fd422f0..HEAD -- src/lib/agents/somnio-v4/ | \
  grep -iE "feature.?flag|FEATURE_FLAG|platform_config.*v4_hybrid.*enabled"
```

**Actual output:** _(empty — 0 lines)_

**Expected:** 0 lines. **PASS**

D-10 confirmed: No feature flag was added. The change is isolated by v4 being DORMANT in production (0 workspaces activating `somnio-sales-v4`), which is the Regla 6 pattern established by standalone #1 and #2. The hybrid change activates automatically for any workspace that enables v4 — when and if the operator runs `UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`.

---

## Parity Check — V4AgentOutput shape (no new field added)

```bash
grep -n "errorMessage\|requiresHuman\|newMode\|templates" src/lib/agents/somnio-v4/types.ts
```

**Relevant output (V4AgentOutput fields at lines 206-226):**
```
206:  templates?: ProcessedMessage[]
207:  newMode?: string
215:  errorMessage?: string
226:  requiresHuman?: boolean
```

**Analysis:** The slot resolver combines results using ONLY existing `V4AgentOutput` fields:
- `templates` — carries the combined [covered, rag:<topic>] `ProcessedMessage[]`
- `messages` — derived from templates (string[])
- `newMode` — set to `'handoff'` on partial handoff (existing field)
- `requiresHuman` — set to `true` on partial handoff (existing field)
- `errorMessage` — used for interrupt discriminator (existing field)

**No new field was added** to `V4AgentOutput`. Parity is automatic: both the production runner (`engine/v4-production-runner.ts`) and the sandbox engine (`somnio-v4/engine-v4.ts`) call the shared `processMessage` function — any change in the output shape would affect both identically. No runner edits were needed for parity.

---

## Summary Table

| Check | Description | Expected | Actual | Result |
|-------|-------------|----------|--------|--------|
| 1 | 5 sibling agents | 0 lines | 0 lines | PASS |
| 2 | v3-production-runner.ts | 0 lines | 0 lines | PASS |
| 3 | interruption-system-v2/ | 0 lines | 0 lines | PASS |
| 4 | CheckpointId count | 8 | 8 | PASS |
| 5 | messaging.ts (Phase 31 adapter) | 0 lines | 0 lines | PASS |
| 6 | handoff-handler.ts | 0 lines | 0 lines | PASS |
| 7 | Changes confined to somnio-v4/ | only v4 files | only v4 files | PASS |
| 8 | Sibling comprehension files | 0 lines | 0 lines | PASS |
| 9 | Non-v4 source changes | v4-runner only | v4-runner + v4-restart-test | PASS (both v4-specific) |
| D-10 | No feature flag introduced | 0 lines | 0 lines | PASS |
| Parity | V4AgentOutput shape unchanged | no new fields | no new fields | PASS |

**All checks: PASS. Regla 6 satisfied. v4 DORMANT (0 prod workspaces). No feature flag (D-10).**
