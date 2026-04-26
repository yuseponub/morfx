---
phase: agent-lifecycle-router
slug: agent-lifecycle-router
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# agent-lifecycle-router — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `RESEARCH.md §Validation Architecture` lines 970-1017.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in repo, see `.claude/rules/agent-scope.md` referencing existing `src/lib/agents/somnio-recompra/__tests__/*.test.ts` suites) |
| **Config file** | `vitest.config.ts` (existing at repo root) |
| **Quick run command** | `npx vitest run src/lib/agents/routing/__tests__/` |
| **Full suite command** | `npx vitest run src/lib/agents/routing/__tests__/ src/lib/domain/__tests__/routing.test.ts src/app/(dashboard)/agentes/routing/__tests__/` |
| **Estimated runtime** | ~30-45 seconds (unit + integration; no e2e against live DB) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <files-touched>` (per task verify block)
- **After every wave merge:** Run `npx vitest run src/lib/agents/routing/__tests__/`
- **Before `/gsd-verify-work`:** Full suite must be green + manual smoke (admin form CRUD)
- **Max feedback latency:** ~45 seconds (full routing suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 01 | 0 | ROUTER-REQ-01, REQ-07, REQ-09, REQ-10 | — | SQL migration file with UNIQUE constraint (Pitfall 1) + RLS workspace_isolation | unit (grep) | `grep -q "uq_routing_rules_priority" supabase/migrations/*_agent_lifecycle_router.sql` | ✅ written by task | ⬜ pending |
| 01-02 | 01 | 0 | ROUTER-REQ-09 | — | JSON Schema rejects `path` field (Pitfall 2 / CVE-2025-1302) | unit (grep) | `! grep -q '"path"' src/lib/agents/routing/schema/rule-v1.schema.json` | ✅ written by task | ⬜ pending |
| 01-03 | 01 | 0 | ROUTER-REQ-09 | — | Snapshot pre-migration captured for parity reference | manual + grep | `grep -q "Snapshot Pre-Migracion" .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md` | ✅ written by task | ⬜ pending |
| 01-04 | 01 | 0 | ROUTER-REQ-12 | — | Inngest cron retention 30d for `reason='matched'` rows (W-7 fix) | unit (grep) | `grep -q "TZ=America/Bogota 0 3 \* \* \*" src/inngest/functions/routing-audit-cleanup.ts` | ❌ Wave 0 must create | ⬜ pending |
| 02-01 | 02 | 1 | ROUTER-REQ-09, REQ-12 | — | Ajv validator rejects path field (Pitfall 2) | unit | `npx vitest run src/lib/agents/routing/__tests__/schema.test.ts` | ❌ Wave 0 must create | ⬜ pending |
| 02-02 | 02 | 1 | ROUTER-REQ-01, REQ-07, REQ-09, REQ-12 | — | Domain layer Regla 3: cero `createAdminClient` en `src/lib/agents/routing/**` | unit | `npx vitest run src/lib/agents/routing/__tests__/domain.test.ts` + `! grep -rn "createAdminClient" src/lib/agents/routing/ --include="*.ts" --exclude-dir=__tests__` | ❌ Wave 0 must create | ⬜ pending |
| 02-03 | 02 | 1 | ROUTER-REQ-04, REQ-07 | — | Domain extensions consolidated (B-4 fix) + getWorkspaceRecompraEnabled (B-1 fix) | unit | `npx vitest run src/lib/agents/routing/__tests__/domain-extensions.test.ts` | ❌ Wave 0 must create | ⬜ pending |
| 03-01 | 03 | 2 | ROUTER-REQ-02, REQ-03 | — | 5 custom operators honor America/Bogota tz (Regla 2) | unit | `npx vitest run src/lib/agents/routing/__tests__/operators.test.ts` | ❌ Wave 0 must create | ⬜ pending |
| 03-02 | 03 | 2 | ROUTER-REQ-02, REQ-03, REQ-04, REQ-09, REQ-10 | — | Engine/cache: FIRST-hit (Pitfall 1), fact-throw sentinel (Pitfall 4), version-revalidate, 10 facts incl. recompraEnabled (B-1) | unit | `npx vitest run src/lib/agents/routing/__tests__/engine.test.ts src/lib/agents/routing/__tests__/cache.test.ts` | ❌ Wave 0 must create | ⬜ pending |
| 03-03 | 03 | 2 | ROUTER-REQ-02, REQ-04 | — | routeAgent emits 3 distinct reasons (D-16): matched, human_handoff, no_rule_matched + fallback_legacy on engine throw | unit + integration | `npx vitest run src/lib/agents/routing/__tests__/route.test.ts` | ❌ Wave 0 must create | ⬜ pending |
| 04-01 | 04 | 3 | ROUTER-REQ-04, REQ-07, REQ-08 | — | Webhook gate: flag default false (Regla 6), legacy if/else inline (D-15) | unit (grep) | `grep -q "lifecycle_routing_enabled: false" src/lib/agents/production/agent-config.ts` + `npx tsc --noEmit` | ❌ Wave 0 must create (integrate.ts) | ⬜ pending |
| 04-02 | 04 | 3 | ROUTER-REQ-04, REQ-07, REQ-08 | — | applyRouterDecision helper covers 5 dispositions (matched, silence, fallback-to-legacy, with router-threw branch). Smoke test: flag OFF preserves legacy. | unit | `npx vitest run src/lib/agents/routing/__tests__/integrate.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` | ❌ Wave 0 must create | ⬜ pending |
| 05-01 | 05 | 3 | ROUTER-REQ-05, REQ-11 | — | Dry-run NEVER writes audit log (D-10), validates candidates before DB (Pitfall 5) | unit | `npx vitest run src/lib/agents/routing/__tests__/dry-run.test.ts` + `! grep -q "recordAuditLog" src/lib/agents/routing/dry-run.ts` | ❌ Wave 0 must create | ⬜ pending |
| 06-01 | 06 | 4 | ROUTER-REQ-06, REQ-12 | — | Server actions invoke domain (Regla 3); priority uniqueness pre-check (W-6 fix) | unit (grep) + manual smoke | `! grep -q "createAdminClient" "src/app/(dashboard)/agentes/routing/_actions.ts"` + `grep -q "validateRulePriorityUnique" "src/app/(dashboard)/agentes/routing/_actions.ts"` | ✅ written by task | ⬜ pending |
| 06-02 | 06 | 4 | ROUTER-REQ-06 | — | Surfaces 1+5 (list rules, audit log) — no createAdminClient in UI | unit (grep) | `! grep -rn "createAdminClient" "src/app/(dashboard)/agentes/routing/" --include="*.tsx"` | ✅ written by task | ⬜ pending |
| 06-03 | 06 | 4 | ROUTER-REQ-06 | — | Editor + condition builder + simulate panel; FactPicker filters by valid_in_rule_types (W-3 fix) | unit (grep) + manual smoke | `grep -q "validateRule" "src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx"` + manual: change rule_type to lifecycle_classifier, verify lifecycle_state hidden | ✅ written by task | ⬜ pending |
| 07-01 | 07 | 5 | ROUTER-REQ-04, REQ-08 | — | Migration applied in production (Regla 5 — checkpoint humano) | manual | Supabase Studio: `SELECT COUNT(*) FROM routing_facts_catalog` returns 11 | manual | ⬜ pending |
| 07-02 | 07 | 5 | ROUTER-REQ-08 | — | 3 Somnio parity rules created (B-1 Opcion B unconditional, including priority 900) | manual + SQL | `SELECT COUNT(*) FROM routing_rules WHERE workspace_id='a3843b3f-...'` returns 3 | ✅ written by task | ⬜ pending |
| 07-03 | 07 | 5 | ROUTER-REQ-11 | — | Dry-run 30d Somnio: 100% parity (changed_count=0 for all parity cases — D-15) | unit + manual | `npx tsx scripts/agent-lifecycle-router/parity-validation.ts` + manual review of 07-DRY-RUN-RESULT.md PASS/FAIL checkbox | manual | ⬜ pending |
| 07-04 | 07 | 5 | ROUTER-REQ-04, REQ-08 | — | Push code + flip flag (manual + SQL); 24h monitoring incl. p95 < 200ms (I-3) | manual | Supabase Studio queries from 07-FLIP-PLAN.md monitoring checklist | manual | ⬜ pending |
| 07-05 | 07 | 5 | ROUTER-REQ-12 | — | Documentation updated (Regla 4): docs/architecture + docs/analysis | unit (grep) | `grep -q "agent-lifecycle-router" docs/analysis/04-estado-actual-plataforma.md` + `test -f docs/architecture/agent-lifecycle-router.md` | ✅ written by task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test infrastructure that must exist before Wave 1 (Plan 02) can start RED→GREEN cycles.

- [ ] `src/lib/agents/routing/__tests__/fixtures.ts` — sample rules + facts (Plan 02 Task 1 creates as part of TDD)
- [ ] `src/lib/agents/routing/__tests__/schema.test.ts` — Ajv validation including path-field rejection (Pitfall 2). Plan 02 Task 1.
- [ ] `src/lib/agents/routing/__tests__/domain.test.ts` — domain.routing CRUD + recordAuditLog. Plan 02 Task 2.
- [ ] `src/lib/agents/routing/__tests__/domain-extensions.test.ts` — Plan 02 Task 3 (B-4 fix — extensions consolidated here).
- [ ] `src/lib/agents/routing/__tests__/operators.test.ts` — custom ops in Bogota tz. Plan 03 Task 1.
- [ ] `src/lib/agents/routing/__tests__/engine.test.ts` — first-hit, fact-throw, runtime fact override (W-4 fix: explicit scaffolds). Plan 03 Task 2.
- [ ] `src/lib/agents/routing/__tests__/cache.test.ts` — LRU + version revalidation + invalid-rule skip + priority collision (W-4 fix: explicit scaffolds). Plan 03 Task 2.
- [ ] `src/lib/agents/routing/__tests__/route.test.ts` — full pipeline integration + 4 reasons (D-16). Plan 03 Task 3.
- [ ] `src/lib/agents/routing/__tests__/dry-run.test.ts` — replay + no audit-log writes (D-10). Plan 05.
- [ ] `src/lib/agents/routing/__tests__/integrate.test.ts` — applyRouterDecision unit tests (I-2 Approach A). Plan 04 Task 2.
- [ ] `src/lib/agents/production/__tests__/webhook-processor-routing.test.ts` — smoke (flag OFF parity, flag ON matched). Plan 04 Task 2.
- [ ] `src/inngest/functions/routing-audit-cleanup.ts` — Inngest retention cron (W-7 fix). Plan 01 Task 4.
- [ ] Verify framework: `grep '"vitest"' package.json` returns ≥ 1 line. If missing, BLOCKER.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applied in production (Regla 5 strict) | ROUTER-REQ-08 | Requires Supabase Studio access; cannot be automated from CI | Plan 07 Task 1 — copy SQL to Studio, run, verify the 5 SQL queries documented in `<how-to-verify>`. |
| Smoke test post-flip | ROUTER-REQ-04, REQ-08 | Requires sending real WhatsApp messages to Somnio production number | Plan 07 Task 4 Step 4 — send test messages from is_client and !is_client contacts; verify routing_audit_log rows + collector events. |
| FactPicker filters by valid_in_rule_types | ROUTER-REQ-06 | Requires browser interaction with admin form | Plan 06 Task 3 — change rule_type to `lifecycle_classifier` in editor, verify `lifecycle_state` and `recompraEnabled` are hidden from fact dropdown (W-3 fix). |
| Dry-run PASS/FAIL decision | ROUTER-REQ-11 | Requires human review of decisions table | Plan 07 Task 3 — review `07-DRY-RUN-RESULT.md`, mark PASS or FAIL checkbox. PASS gates Task 4. |
| 24h monitoring + p95 latency | ROUTER-REQ-04 | Requires production observation over 24 hours | Plan 07 Task 4 — execute monitoring SQL queries hour +1, +6, +12, +24; verify thresholds (rows > 0, fallback_legacy < 1%, p95 < 200ms — I-3 fix). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (per-task verify blocks already specify them)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (Plan 07 has 3 manual + 2 automated tasks; sampling continuity preserved via grep checks on Tasks 02 and 05)
- [ ] Wave 0 covers all MISSING references (12 test files listed above)
- [ ] No watch-mode flags (`vitest run` only, no `vitest watch`)
- [ ] Feedback latency < 45s (full routing suite estimated)
- [ ] `nyquist_compliant: true` set in frontmatter (currently false until Wave 0 test scaffolds shipped)

**Approval:** pending
