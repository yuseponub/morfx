---
phase: ui-agent-content-editor
plan: 07
type: execute
wave: 5
depends_on: [06]
files_modified:
  - .planning/standalone/ui-agent-content-editor/REGLA-EVIDENCE.md
  - .planning/standalone/ui-agent-content-editor/LEARNINGS.md
autonomous: true
requirements: [D-01, D-01b, D-02, D-03, D-03b, D-04, D-05, D-06, D-07, D-08, D-09, D-10]

must_haves:
  truths:
    - "A grep-evidenced report proves Regla 3 (zero createAdminClient outside domain) holds for all standalone files"
    - "A grep/test-evidenced report proves Regla 6 (only somnio-sales-v4 mutable; prod agents untouched)"
    - "The full vitest suite is green and every D-ID maps to a passing automated check or a recorded manual smoke result"
    - "LEARNINGS.md captures bugs/decisions/patterns per the project mandate"
  artifacts:
    - path: ".planning/standalone/ui-agent-content-editor/REGLA-EVIDENCE.md"
      provides: "Regla 3/5/6 + D-ID coverage evidence with exact grep outputs"
    - path: ".planning/standalone/ui-agent-content-editor/LEARNINGS.md"
      provides: "Bugs, decisions, reusable patterns"
  key_links:
    - from: "REGLA-EVIDENCE.md"
      to: "all standalone source + test files"
      via: "grep gates + vitest run outputs pasted as evidence"
      pattern: "createAdminClient"
---

<objective>
Produce the final Regla 3/5/6 evidence report + D-ID coverage matrix, run the full suite green, and write LEARNINGS.md.

Purpose: This standalone touches Regla 3 (domain layer), Regla 5 (migration ordering), and Regla 6 (production-agent protection). The project mandate (CLAUDE.md + gsd-workflow) requires verifiable evidence and a LEARNINGS file at completion. This plan closes the loop before `/gsd:verify-work`.

Output: REGLA-EVIDENCE.md + LEARNINGS.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-agent-content-editor/CONTEXT.md
@.planning/standalone/ui-agent-content-editor/VALIDATION.md
@.planning/standalone/ui-agent-content-editor/RESEARCH.md
@.planning/templates/LEARNINGS-TEMPLATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run full suite + collect grep gate evidence (Regla 3/6)</name>
  <read_first>
    - .planning/standalone/ui-agent-content-editor/VALIDATION.md (Per-Decision Verification Map + Security Validation)
    - src/lib/domain/agent-templates.ts, src/lib/domain/agent-knowledge-base.ts (the only files allowed to import createAdminClient in this standalone)
    - src/app/actions/agent-content-editor.ts (must have 0 createAdminClient)
  </read_first>
  <action>
Run and capture exact outputs:
1. Full suite: `pnpm test` (vitest run) — must be all green; capture the summary line (passed/failed counts).
2. Regla 3 gate (zero createAdminClient outside domain for this standalone's files):
   - `grep -rn "createAdminClient" "src/app/(dashboard)/agentes/content-editor/"` → expect 0.
   - `grep -rn "createAdminClient" src/app/actions/agent-content-editor.ts` → expect 0.
   - `grep -rln "createAdminClient" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts` → expect BOTH listed (domain owns the client).
   - `grep -rn "createAdminClient" src/lib/agents/somnio-v4/knowledge-base/serialize.ts` → expect 0 (pure serializer).
   - Note: `scripts/knowledge-sync.ts` + `scripts/reembed-kb-v4.ts` MAY use createAdminClient (CLI exception class) — document this explicitly as allowed.
3. Regla 6 gate (only somnio-sales-v4 mutable):
   - `grep -c "EDITABLE_AGENT_ID = 'somnio-sales-v4'" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts` → expect 1 each.
   - `grep -c "assertEditable" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts` → expect each mutation gated.
   - Confirm migrations touch only v4/Somnio: `grep -c "agent_id = 'somnio-sales-v4'" supabase/migrations/20260601100000_kb_scope_summary.sql` == 18; `grep -c "DROP TABLE\|DELETE FROM\|TRUNCATE" supabase/migrations/2026060110010*.sql` == 0.
   - The D-02 reject tests in the domain test files are green (cite the test names).
4. Regla 5: confirm both migration files exist and Plan 02's checkpoint was confirmed (note the user's "migraciones aplicadas" confirmation in 02-SUMMARY).
Record all outputs verbatim in the evidence file (Task 2).
  </action>
  <acceptance_criteria>
    - `pnpm test` exits 0 (full suite green)
    - `grep -rn "createAdminClient" "src/app/(dashboard)/agentes/content-editor/" | wc -l` == 0
    - `grep -rn "createAdminClient" src/app/actions/agent-content-editor.ts | wc -l` == 0
    - `grep -lc "createAdminClient" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts` lists both files
  </acceptance_criteria>
  <verify>
    <automated>pnpm test && grep -rn "createAdminClient" "src/app/(dashboard)/agentes/content-editor/" | wc -l</automated>
  </verify>
  <done>Full suite green; Regla 3/6 grep outputs collected.</done>
</task>

<task type="auto">
  <name>Task 2: Write REGLA-EVIDENCE.md (D-ID coverage matrix + Regla 3/5/6 evidence)</name>
  <read_first>
    - .planning/standalone/ui-agent-content-editor/VALIDATION.md (Per-Decision Verification Map — mirror its D-ID rows)
    - the captured outputs from Task 1
  </read_first>
  <action>
Create `.planning/standalone/ui-agent-content-editor/REGLA-EVIDENCE.md`. Sections:
1. **D-ID coverage matrix** — one row per decision (D-01, D-01b, D-02, D-03, D-03b, D-04, D-05, D-06, D-07, D-08, D-09, D-10) → the plan(s) that implemented it → the exact automated command or manual smoke result that proves it (pull from VALIDATION.md + actual test names/grep outputs). Every D-ID must be COVERED.
2. **Regla 3 evidence** — paste the grep outputs from Task 1; state the conclusion (domain owns createAdminClient; app/UI layer is clean; scripts/ CLI exception documented).
3. **Regla 5 evidence** — both migration files + the user confirmation from 02-SUMMARY (migrations applied to prod before dependent code).
4. **Regla 6 evidence** — EDITABLE_AGENT_ID gate + D-02 reject test names + migration scope (18 v4-scoped UPDATEs, 0 destructive ops) + the fact that production agents (v3/godentist/recompra/pw-confirmation) are read-only in the UI and rejected at the domain.
5. **Full suite result** — the pnpm test summary line.
  </action>
  <acceptance_criteria>
    - `test -f .planning/standalone/ui-agent-content-editor/REGLA-EVIDENCE.md`
    - Every D-ID appears: `for d in D-01 D-01b D-02 D-03 D-03b D-04 D-05 D-06 D-07 D-08 D-09 D-10; do grep -q "$d" .planning/standalone/ui-agent-content-editor/REGLA-EVIDENCE.md || echo "MISSING $d"; done` prints nothing
    - `grep -ci "regla 3" ...EVIDENCE.md` >= 1, `grep -ci "regla 5" ...` >= 1, `grep -ci "regla 6" ...` >= 1
  </acceptance_criteria>
  <verify>
    <automated>for d in D-01 D-01b D-02 D-03 D-03b D-04 D-05 D-06 D-07 D-08 D-09 D-10; do grep -q "$d" .planning/standalone/ui-agent-content-editor/REGLA-EVIDENCE.md || echo "MISSING $d"; done</automated>
  </verify>
  <done>Evidence report covers all 12 D-IDs + Regla 3/5/6 with concrete proof.</done>
</task>

<task type="auto">
  <name>Task 3: Write LEARNINGS.md</name>
  <read_first>
    - .planning/templates/LEARNINGS-TEMPLATE.md
    - .planning/standalone/somnio-v4-crm-subloop/LEARNINGS.md (sibling standalone LEARNINGS for tone/format)
  </read_first>
  <action>
Create `.planning/standalone/ui-agent-content-editor/LEARNINGS.md` following the template. Capture at minimum:
- **Pitfall 1 lesson**: byte-equivalence with legacy `.md` embeddings is impossible (parser is lossy/one-way) — the canonical serializer + one-time re-embed under a dormant agent is the honest design. Reusable pattern for any "migrate file-sourced content to DB source-of-truth" task.
- **Regla 5 in practice**: the migration→apply→confirm→deploy ordering, and that the OpenAI re-embed cannot be pure SQL (split into a post-migration script).
- **Pitfall 2**: a table with NO RLS makes the domain filter the ONLY isolation guard — every query must carry workspace+agent.
- **Pitfall 3**: UNIQUE(orden) reorder needs a temp-offset two-phase write.
- **D-01 sync protection**: an unguarded seed script silently reverts a DB-source-of-truth — guard with --force + non-empty check.
- Any bugs found during execution (per-plan SUMMARYs).
- Reusable patterns: domain re-targeting an existing transform (.md→DB), versioning-table snapshot-on-save, content-editor UI gating by a constant agent id.
  </action>
  <acceptance_criteria>
    - `test -f .planning/standalone/ui-agent-content-editor/LEARNINGS.md`
    - Mentions the serializer/byte-equivalence lesson: `grep -ci "byte-equiv\|serializer\|re-embed\|lossy" LEARNINGS.md` >= 1 (path under the standalone dir)
    - Mentions Regla 5 + Regla 6: `grep -ci "regla 5" .planning/standalone/ui-agent-content-editor/LEARNINGS.md` >= 1
  </acceptance_criteria>
  <verify>
    <automated>test -f .planning/standalone/ui-agent-content-editor/LEARNINGS.md && grep -ci "serializer\|re-embed" .planning/standalone/ui-agent-content-editor/LEARNINGS.md</automated>
  </verify>
  <done>LEARNINGS.md written per the project mandate.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| none (documentation/verification) | This plan reads code + runs tests; produces docs. No new runtime surface. |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UICE07-01 | Repudiation | Shipping without provable Regla compliance | mitigate | REGLA-EVIDENCE.md with verbatim grep/test outputs is the audit artifact. |
| T-UICE07-02 | Tampering | A D-ID silently unimplemented | mitigate | D-ID coverage matrix gate fails CI-style check if any D-ID missing from the evidence file. |
</threat_model>

<verification>
- `pnpm test` green.
- REGLA-EVIDENCE.md covers all 12 D-IDs + Regla 3/5/6.
- LEARNINGS.md present.
</verification>

<success_criteria>
- Regla 3/5/6 provably satisfied with pasted evidence.
- Every D-ID mapped to a passing check or recorded smoke.
- LEARNINGS.md written.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-agent-content-editor/07-SUMMARY.md`.
</output>
