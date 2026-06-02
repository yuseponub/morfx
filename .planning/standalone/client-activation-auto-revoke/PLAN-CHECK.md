# PLAN-CHECK — client-activation-auto-revoke

**Checked:** 2026-04-28
**Checker:** gsd-plan-checker (Revision Gate)
**Plans verified:** 01-PLAN.md (primary), 02-PLAN.md (optional)

---

## Verdict

PASS

---

## Summary

Both plans are structurally complete and goal-backward valid. Plan 01 delivers the full standalone goal — bidirectional trigger replacement, dead-code drop, composite index, global backfill, Regla 5 PAUSE structure, and Regla 4 doc sync — all in a single atomic wave. Plan 02 (optional integration tests) is correctly flagged as deferred and gated behind a user decision checkpoint before execution. One minor issue is found in the Task 3 `<verify>` block (a logically vacuous shell condition), and two advisory observations are noted — neither blocks execution.

---

## Critical Findings

No blockers found.

---

## Minor Findings

### M-1: Task 3 `<verify>` condition 4 is logically vacuous

**File:** `01-PLAN.md`, Task 3 `<verify>` block, 4th automated command:

```bash
! git log origin/main..HEAD --oneline | head -1 | grep -q "" && git log origin/main..HEAD --oneline | head -1 | grep -q "client-activation-auto-revoke"
```

`grep -q ""` always matches any string (empty pattern matches every line), so the first half `! ... grep -q ""` always evaluates to `false`, making the entire `&&` chain always false regardless of the commit content. The condition can never pass — it silently masks the actual intent (verifying HEAD is 1 commit ahead of origin/main with the expected message).

**Impact:** Non-blocking. The three preceding verify conditions in Task 3 already confirm the commit exists (`git log -1 --pretty=%s` + two `--name-only` checks). The vacuous condition adds no coverage but causes no harm.

**Suggested fix** (if planner revises):
```bash
git log origin/main..HEAD --oneline | grep -q "client-activation-auto-revoke"
```

---

### M-2: Task 4 checkpoint has 7 verification steps — executor may need explicit "STOP" signal

**File:** `01-PLAN.md`, Task 4 (checkpoint:human-verify)

The checkpoint is correctly typed `checkpoint:human-verify` with `gate="blocking"` and has a `<resume-signal>` block, so the PAUSE is enforced. However, the `<how-to-verify>` section has 7 substeps (Pasos 1-7), and Paso 6 (the single-order UAT trigger test via SQL UPDATE) explicitly says "opcional pero recomendado." If the executor tries to automate Paso 6 (which requires identifying a live Somnio contact and running a data-mutating UPDATE in prod), it could cause unintended side effects.

**Impact:** Non-blocking. The checkpoint type prevents auto-advancement. The "opcional" label is clear. This is an informational flag only.

**Note:** The `<resume-signal>` correctly requires the user to attach cross-check outputs 3 and 4 before the checkpoint releases, which is the right gate.

---

### M-3: Plan 02 Task 1 `<verify>` uses grep on arrow characters that may fail in some shells

**File:** `02-PLAN.md`, Task 1 `<verify>` block:

```bash
grep -q "UPDATE non-activator → activator" src/__tests__/integration/client-activation-trigger.test.ts
```

The `→` character (U+2192) in the grep pattern is fine if the file uses UTF-8 (which it will — the action block embeds this exact string). This is safe in practice but worth noting for environments with unusual locale settings.

**Impact:** Informational only.

---

## Goal Coverage Matrix

| Goal Element | Plan 01 Coverage | Plan 02 Coverage | Status |
|---|---|---|---|
| Trigger handles UNSET when last activator order leaves (LR-1) | Task 1 — SQL OUT branch with EXISTS on OLD.contact_id | Task 1 — Scenarios 3 and 4 | COVERED |
| IN/OUT optimization — only border crossings fire (LR-2, D-02) | Task 1 — `v_old_in_set = v_new_in_set` skip guard + INSERT branch | Task 1 — Scenarios 5, 6, 7 | COVERED |
| Global backfill in same migration (LR-3, D-04) | Task 1 — DO $$ loop with RAISE NOTICE per workspace | N/A | COVERED |
| No domain layer changes (LR-4, D-03) | Objective + action CRITICAL rules + files_modified list contains zero src/ files | N/A | COVERED |
| D-05 dead-code tag block dropped (LR-5) | Task 1 verify: `! grep -q "v_tag_id"` + `! grep -q "INSERT INTO contact_tags"` | N/A | COVERED |
| isClient routing fact unaffected (LR-6) | Objective documents RQ-5 — live DB read, no cache | N/A | COVERED |
| agent-lifecycle-router priority-900 unaffected (LR-7) | Documented in objective + RESEARCH RQ-5 | N/A | COVERED |
| Regla 5 PAUSE structure enforced | Task 3 explicit NO-push + Task 4 `checkpoint:human-verify` gate="blocking" + `<resume-signal>` | N/A | COVERED |
| Cross-checks 3 and 4 included as gates | Task 4 `<resume-signal>` requires user to provide both outputs | N/A | COVERED |
| Trigger binding NOT recreated (no DROP/CREATE TRIGGER) | Task 1 verify: `! grep -q "DROP TRIGGER"` + `! grep -q "CREATE TRIGGER"` | N/A | COVERED |
| Backfill cleans contact 3137549286 (D-04 bug-fix proof) | Task 4 Paso 2a — explicit SELECT for phone '3137549286' post-migration | N/A | COVERED |
| IS NOT DISTINCT FROM for NULL safety (Pitfall 1) | Task 1 verify: `grep -q "IS NOT DISTINCT FROM"` | N/A | COVERED |
| OLD.contact_id in EXISTS (RQ-2.a) | Task 1 verify: `grep -q "contact_id = OLD.contact_id"` | N/A | COVERED |
| Composite index for EXISTS hot path (RQ-2.d) | Task 1 verify: `grep -q "CREATE INDEX IF NOT EXISTS idx_orders_contact_stage"` | N/A | COVERED |
| Idempotent realtime publication guard (Pitfall 5) | Task 1 verify: `grep -q "EXCEPTION WHEN duplicate_object"` | N/A | COVERED |
| Regla 4 docs sync | Task 2 — two specific line updates in 04-estado-actual-plataforma.md | N/A | COVERED |
| LEARNINGS P-1..P-6 created | Task 5 Paso 2 — full LEARNINGS.md template embedded in action | N/A | COVERED |
| 8-scenario trigger coverage (optional) | N/A | Task 1 — all 8 scenarios explicit in action + verify | COVERED (optional) |
| Plan 02 decision gate before execution | Plan 02 objective has explicit YES/NO decision tree | N/A | COVERED |
| Migration filename no-collision with same-day slot | RESEARCH confirms `20260428000000_agent_audit_sessions.sql` is the only 2026-04-28 migration; `20260428160000` is free | N/A | COVERED |

---

## Trigger Correctness Audit (Goal-Backward)

Verified against the SQL body embedded in Plan 01 Task 1 `<action>` block (verbatim copy of RESEARCH.md §Trigger SQL Pattern):

| Scenario | Expected | Plan SQL | Verdict |
|---|---|---|---|
| INSERT to activator stage | is_client=true | `IF TG_OP = 'INSERT' THEN IF v_new_in_set THEN UPDATE contacts SET is_client=true` | CORRECT |
| INSERT outside activator | no change | `IF TG_OP = 'INSERT' THEN IF v_new_in_set THEN ... END IF; RETURN NEW` — falls through silently | CORRECT |
| UPDATE non-activator → activator | is_client=true | `IF v_new_in_set AND NOT v_old_in_set THEN UPDATE contacts SET is_client=true` | CORRECT |
| UPDATE activator → non-activator, no other orders | is_client=false | OUT branch: EXISTS returns false → `UPDATE contacts SET is_client=false WHERE id = OLD.contact_id AND is_client=true` | CORRECT |
| UPDATE activator → non-activator, another order in set | stays true | OUT branch: EXISTS returns true → no UPDATE | CORRECT |
| UPDATE non-activator → non-activator | no change | `IF v_old_in_set = v_new_in_set THEN RETURN NEW` (both false = equal) | CORRECT |
| UPDATE activator → activator (same set) | stays true | `IF v_old_in_set = v_new_in_set THEN RETURN NEW` (both true = equal) | CORRECT |
| Contact reassignment (OLD.contact_id ≠ NEW.contact_id) | OLD owner re-evaluated + NEW owner marked if lands in activator | EXISTS uses OLD.contact_id + defensive trailing block handles NEW.contact_id | CORRECT |
| NULL stage_id on either side | safe skip / treated as not-in-set | `IS NOT DISTINCT FROM` guard + `= ANY()` with NULL returns NULL (boolean coercion to false in IF) | CORRECT |
| v_tag_id / INSERT INTO contact_tags (dead code) | NOT present | `CREATE OR REPLACE FUNCTION` body in plan has no v_tag_id DECLARE, no INSERT INTO contact_tags | CORRECT — D-05 satisfied |

---

## Backfill Correctness Audit

| D-04 Requirement | Plan 01 DO $$ Implementation | Verdict |
|---|---|---|
| Iterates only enabled=true workspaces | `WHERE enabled = true AND array_length(activation_stage_ids, 1) > 0` | CORRECT |
| Skips workspaces with empty activation_stage_ids | `array_length(activation_stage_ids, 1) > 0` guard | CORRECT |
| Resets all is_client=true first | `UPDATE contacts SET is_client=false WHERE workspace_id = v_workspace_id AND is_client=true` | CORRECT |
| Sets true for contacts with ≥1 order in activation stages | CTE `SELECT DISTINCT o.contact_id FROM orders WHERE stage_id = ANY(v_stage_ids)` + UPDATE | CORRECT |
| No archived_at filter (D-01 — archived orders count) | No `archived_at` filter in either UPDATE | CORRECT — mirrors backfillIsClient() behavior |
| RAISE NOTICE per workspace | `RAISE NOTICE 'client_activation backfill: workspace=% reset=% set=%'` | CORRECT |
| Idempotent (replayable) | First UPDATE gated by `is_client=true`, second gated by `is_client=false` | CORRECT |
| Covers contact 3137549286 | DO $$ resets all in Somnio workspace then re-evaluates orders — contact has no activator orders, stays false | CORRECT |

---

## Regla 5 PAUSE Structure Audit

| Requirement | Evidence | Verdict |
|---|---|---|
| Migration commit is NO-PUSH | Task 3 action: "CRITICAL: NO ejecutar `git push origin main`" + `<done>` block confirms "NO push hecho — bloqueado hasta Task 5" | ENFORCED |
| PAUSE is BLOCKING (not auto-advanceable) | Task 4 type=`checkpoint:human-verify` gate=`blocking` | ENFORCED |
| Executor knows to wait for explicit user confirmation | `<resume-signal>` block requires user to write "migracion aplicada" + attach 4 specific outputs | ENFORCED |
| Clear instructions for SQL Editor steps | Task 4 `<how-to-verify>` Pasos 1-7 with explicit copy-paste SQL | PRESENT |
| Cross-check queries 3 and 4 included with 0-row gate | Task 4 Pasos 4-5 include verbatim SQL from RESEARCH §Production Verification SQL Bundle with "Expected: 0 filas" | PRESENT AND BLOCKING (resume-signal requires these) |
| Push only after user confirms | Task 5 begins with `git push origin main` and references "gate del Task 4 ya paso aqui" | ENFORCED |

---

## Scope Boundary Audit

| Out-of-scope item (per CONTEXT.md NO-list) | Presence in plans | Verdict |
|---|---|---|
| UI changes to /settings/activacion-cliente | Not in files_modified, not in any task action | CLEAN |
| moveOrderToStage changes | Not in files_modified | CLEAN |
| crm-writer-adapter.ts changes | Not in files_modified | CLEAN |
| Inngest event contact.is_client_changed | No task mentions inngest | CLEAN |
| Feature flag | Explicitly documented as not needed in objective + commit message | CLEAN |
| Cleanup of historic contact_tags Cliente rows | Not in any task action | CLEAN |
| backfillIsClient() domain function changes | Not in files_modified | CLEAN |
| client-activation.ts changes | Not in files_modified | CLEAN |

---

## Dependency + Wave Correctness

- Plan 01: `wave: 1`, `depends_on: []` — correct, primary plan has no dependencies.
- Plan 02: `wave: 2`, `depends_on: ["01"]` — correct, integration tests require trigger from Plan 01 to be applied.
- No cycles. No forward references. Wave numbers consistent with dependency graph.

---

## Task Completeness

| Plan | Task | Type | files | action | verify | done | Status |
|---|---|---|---|---|---|---|---|
| 01 | Task 1 (migration) | auto | supabase/migrations/... | Full SQL body + CRITICAL rules | 16 automated grep checks | File exists + all greps pass + NOT commited yet | COMPLETE |
| 01 | Task 2 (docs) | auto | docs/analysis/04-estado-actual-plataforma.md | Two specific line replacements with exact before/after text | 4 automated greps | 2 lines updated, rest intact | COMPLETE |
| 01 | Task 3 (commit) | auto | (both above) | git add + git commit with verbatim message template | 4 automated checks (3 valid, 1 vacuous — M-1) | Commit created, no push, HEAD 1 ahead of origin | COMPLETE |
| 01 | Task 4 (checkpoint) | checkpoint:human-verify | N/A | N/A | 7-step manual verification | N/A (checkpoint type) | CORRECT TYPE |
| 01 | Task 5 (push + LEARNINGS) | auto | .planning/.../LEARNINGS.md | git push + full LEARNINGS.md template + commit + push | 7 automated checks | push done, LEARNINGS created, git clean | COMPLETE |
| 02 | Task 1 (test suite) | auto | src/__tests__/integration/... | Full TypeScript test file embedded in action | 12 automated checks | File exists, skipIf gated, TypeScript compiles | COMPLETE |
| 02 | Task 2 (run + commit) | auto | (test file + optional .env.test.example) | Run suite / commit / push / LEARNINGS update | 4 automated checks | 2 commits pushed, LEARNINGS updated | COMPLETE |

---

## Recommended Actions

Plans are ready for execution. Run `/gsd-execute-phase client-activation-auto-revoke` when ready.

**Pre-execution reminders for the executor:**

1. Task 1: copy the SQL verbatim from RESEARCH.md (already embedded in the plan action block). Do not improvise or rewrite any SQL.
2. Task 3: do NOT run `git push`. The Task 3 `<done>` block is explicit but the 4th `<verify>` condition (M-1 above) will always evaluate to false — ignore that condition's boolean result and rely on the three preceding verify commands instead.
3. Task 4: this is a FULL STOP. Do not advance to Task 5 without the user explicitly writing the resume signal with the four required outputs.
4. For Plan 02: the decision gate in the Plan 02 objective must be answered before starting Task 1. If the user does not have `.env.test` with `TEST_WORKSPACE_ID` configured, skip Plan 02 entirely and document in CONTEXT.md Deferred Ideas.
