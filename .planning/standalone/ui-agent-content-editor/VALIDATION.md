---
phase: ui-agent-content-editor
slug: ui-agent-content-editor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Standalone ui-agent-content-editor — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from RESEARCH.md §Validation Architecture + §Security Domain.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^1.6.1 (package.json:117) |
| **Config file** | repo root (`vitest run` script package.json:10) |
| **Quick run command** | `npx vitest run <path> -t <name>` |
| **Full suite command** | `pnpm test` (`vitest run`) |
| **Estimated runtime** | ~variable (per-file quick run < 10s) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched domain test file>`
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green + grep gates pass
- **Max feedback latency:** < 15 seconds (quick run)

---

## Per-Decision Verification Map

| Decision | Observable behavior proving it | Test Type | Automated Command / How | Status |
|----------|-------------------------------|-----------|-------------------------|--------|
| D-01 (DB source of truth + sync protected) | `knowledge:sync` aborts/no-ops when DB non-empty unless `--force`; Inngest flag off | unit + grep | unit on guard; `grep -n "somnio_v4_kb_sync_enabled" scripts/knowledge-sync.ts` returns match | ⬜ pending |
| D-01b (versioning) | save snapshots prior version; restore re-embeds | unit/integration | edit twice → 2 version rows; restore → embedding regenerated | ⬜ pending |
| D-02 (only v4 editable) | mutation on non-v4 agent rejected | unit | domain returns error for `agent_id !== 'somnio-sales-v4'` | ⬜ pending |
| D-03 (edits rows v4 uses, no overrides) | no `workspace_id`-override branch in UI mutations | grep / code review | single row update, no override insert | ⬜ pending |
| D-04 (all agents read-only visible) | selector lists all; non-v4 disabled + "PRODUCCIÓN" badge | manual UI smoke | open editor, switch agents | ⬜ pending |
| D-05 (image upload → content) | upload returns publicUrl autofilled into `content` for `imagen` | manual UI smoke + unit on endpoint reuse | ⬜ pending |
| D-06 (sync re-embed; error→retry) | OpenAI failure → action error, no partial write | unit | mock `generateEmbedding` throw → row unchanged | ⬜ pending |
| D-07 (admin only) | non-admin mutation rejected | unit | mock `isWorkspaceAdmin=false` → error | ⬜ pending |
| D-08 (templates: existing intents only) | add into new intent rejected | unit | `addTemplate` with unknown intent → error | ⬜ pending |
| D-09 (KB full CRUD + re-embed on create) | create topic embeds + inserts | unit | mock embed, assert insert called with embedding | ⬜ pending |
| D-10 (scope_summary editable + migrated) | column exists; edit re-embeds | grep + unit | `grep scope_summary` in migration; edit changes body_hash | ⬜ pending |
| Regla 3 | zero `createAdminClient` outside domain | grep gate | `grep -rn "createAdminClient" src/app/**/content-editor/` = 0; only domain files import it | ⬜ pending |
| Regla 6 | production agent rows untouched | grep + manual | only `somnio-sales-v4` mutated; v3/godentist rows unchanged | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/domain/__tests__/agent-templates.test.ts` — stubs for D-02 / D-08 / Regla 3
- [ ] `src/lib/domain/__tests__/agent-knowledge-base.test.ts` — stubs for D-01b / D-06 / D-09 / D-10
- [ ] Shared KB serializer + its unit test (`serialize.test.ts`) — A1 / Pitfall 1 (byte-equivalence canonical serializer)
- [ ] Guard test for `scripts/knowledge-sync.ts` — D-01 / Pitfall 4
- (Framework already installed — no install gap.)

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Agent selector lists all agents, non-v4 disabled + "PRODUCCIÓN — solo lectura" badge | D-04 | Visual/interaction state in browser | Open `/agentes/content-editor`, switch agent dropdown, confirm v4 editable, others read-only |
| Image upload autofills public URL into `content` for `content_type='imagen'` | D-05 | Requires file picker + bucket round-trip | Upload an image in the template editor, confirm public URL populates `content` and previews |
| Edit → save → runtime reflects within ≤5 min (TemplateManager cache) | D-03b | Cache TTL propagation observed in running agent | Edit a v4 template, wait ≤5 min, confirm sandbox/v4 reflects change |

---

## Security Validation (ASVS L1)

| Control | Verify | How |
|---------|--------|-----|
| V2 Authentication | `supabase.auth.getUser()` in every server action | grep server actions |
| V4 Access Control | admin gate + workspace scoping; KB has NO RLS → explicit `.eq('workspace_id').eq('agent_id')` mandatory | code review domain queries (Pitfall 2) |
| V5 Input Validation | zod on action inputs; MIME/size on upload | grep zod schemas + reuse upload endpoint |
| Cross-workspace KB read/write | explicit workspace+agent filter on every KB query | unit + code review |
| Production agent content tampering | v4-only mutation gate | unit (D-02) + grep (Regla 6) |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner maps tasks)

**Approval:** pending
