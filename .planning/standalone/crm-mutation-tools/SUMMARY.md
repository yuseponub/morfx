# SUMMARY — Standalone crm-mutation-tools

**Status:** Shipped 2026-04-29
**Commit range:** `743788e` (Plan 01 Task 1.1) … `3403254` (Plan 06 Task 6.5) + Plan 06 Task 6.6 final commit
**Plans:** 6 plans, 6 waves (Wave 0 → Wave 5)
**Tools:** 15/15 final closed list per D-02 (contacts 3 + orders 5 + notes 4 + tasks 3)

## What shipped

Built `src/lib/agents/shared/crm-mutation-tools/` — 15 deterministic mutation tools mirroring `crm-query-tools` (shipped same day) but with opposite verb (mutate vs read). Tools call domain layer directly (Regla 3) — no two-step propose+confirm. Coexists with `crm-writer` (D-01); no migration of existing agents in this standalone (D-08 sin feature flag).

Closed the gap of `closeOrder` per D-11 Resolución A: added `orders.closed_at TIMESTAMPTZ NULL` column + `closeOrder` domain function. Distinct semantics from `archiveOrder` (closed = "finalizado, sigue visible historico", archived = "soft-delete oculto del UI por defecto"). Campos independientes — pedido puede estar simultaneamente closed Y archived.

Added new dedup table `crm_mutation_idempotency_keys` (PK `workspace_id, tool_name, key`) with daily TTL cleanup cron via Inngest (`TZ=America/Bogota 0 3 * * *`). 5 creation tools accept opt-in `idempotencyKey?` for retry-safety.

A11 gap closure: agregados `getContactNoteById`, `getOrderNoteById`, `getTaskById` en domain (notes/tasks no exponían getters by-id) — necesarios para rehydrate verídico (D-09 Pitfall 6 — NUNCA fabricar snapshot desde input).

Documentation end-to-end: project skill `.claude/skills/crm-mutation-tools.md` (descubrible) + sección `### Module Scope: crm-mutation-tools` en CLAUDE.md + cross-ref en `.claude/rules/agent-scope.md` + INTEGRATION-HANDOFF.md (371 líneas) + LEARNINGS.md retrospectivo.

## Plans shipped

| Plan | Wave | Title | Commit anchor | Highlights |
|------|------|-------|---------------|------------|
| 01 | 0 | Foundation: migrations + domain + cron | `743788e..1467171` | 2 migraciones DB aplicadas a producción (Regla 5 PAUSE) + idempotency helpers + closeOrder + 3 getters by-id + Inngest cron TTL diario |
| 02 | 1 | Module skeleton + createContact | `0343e07..69c6021` | factory + types (MutationResult<T> 7-status DU) + helpers (withIdempotency 4-path) + observability emit con PII redaction + createContact como tool de prueba (15 tests) |
| 03 | 2 | Contacts + Orders fan-out (8/15) | `66de656..c47398e` | 8 tools shipped (3 contacts + 5 orders) + Pitfall 1 (CAS propagation) blindado con 2 tests + textbook gate. 43 unit tests acumulados |
| 04 | 3 | Notes + Tasks fan-out (15/15 final) | `2ac54b4..4ca29ca` | 7 tools adicionales (4 notes + 3 tasks) cierran 15/15. bodyTruncate PII (T-04-01) + exclusive arc validation (zod refine + defense-in-depth) + index smoke test scope creep guard. 67 unit tests |
| 05 | 4 | Test infrastructure umbrella | `e5b073b..74c7244` | 4-gate hardened runner endpoint + 4 integration test files env-gated (cross-workspace + idempotency race + soft-delete D-11 + CAS reject) + Playwright fixtures extendidas + 4 E2E scenarios listables |
| 06 | 5 | Documentation + handoff | `38bfb23..3403254` + final | project skill descubrible (261 líneas) + CLAUDE.md scope section + agent-scope.md cross-ref + INTEGRATION-HANDOFF.md (371 líneas) + LEARNINGS.md retrospectivo |

## Coverage

- **Unit:** 67 tests across 5 files (helpers 9 + contacts 12 + orders 22 + notes 11 + tasks 10 + index 3 smoke). All 7 status branches covered per tool where applicable. Mocked domain via `vi.hoisted` pattern.
- **Integration (env-gated):** 14 tests across 4 files — `cross-workspace.test.ts` (Pitfall 2 mitigation), `idempotency.test.ts` (Promise.all 5-call race), `soft-delete.test.ts` (archived_at + closed_at independence + idempotent timestamps), `stage-change-concurrent.test.ts` (CAS reject path with flag flip). Skip clean cuando faltan env vars (CI sin secretos = 14 skipped, 0 failed).
- **E2E (Playwright):** 4 scenarios via `/api/test/crm-mutation-tools/runner` 4-gate hardened endpoint — `createOrder` Kanban round-trip + `moveOrderToStage` round-trip + `archiveOrder` removal + `completeTask` Supabase round-trip.

## Constraints honored (grep gates)

Verificable en cualquier momento via grep:

- **Zero `createAdminClient` / `@supabase/supabase-js`** imports en `src/lib/agents/shared/crm-mutation-tools/` (Regla 3 / D-pre-02). Único archivo del repo que escribe a `crm_mutation_idempotency_keys` es `src/lib/domain/crm-mutation-idempotency.ts`.
- **Zero `workspaceId` field** en cualquier `inputSchema` (Pitfall 2 / D-pre-03). El integration test `cross-workspace.test.ts` lo detecta si alguien lo agrega.
- **Zero hard-DELETE imports** (Pitfall 4 / D-pre-04). Toda eliminación es soft-delete via `archived_at` / `closed_at` / `completed_at`.
- **Zero retry on `stage_changed_concurrently`** (Pitfall 1) — verificable via textbook regex gate sobre `orders.ts`.
- **Zero cross-module imports from `@/lib/agents/crm-writer`** (Pitfall 10) — `ResourceType` duplicado en mutation-tools a propósito.
- **`updateOrder.inputSchema` does NOT contain `products`** (V1.1 deferred).

## Audit trail

All mutations emit 3 events `pipeline_decision:crm_mutation_*` (`invoked` / `completed` / `failed`) to `agent_observability_events` with PII-redacted payloads (phone last 4, email local-part masked, body truncated 200 chars, UUID last 8 chars). SQL forensics query verbatim en `INTEGRATION-HANDOFF.md` § Observability forensics SQL.

`idempotencyKeyHit: boolean` campo nuevo único de mutation-tools (query-tools no tiene idempotencia) — `true` cuando `status='duplicate'` retornado via key lookup. Útil para forensics retry-vs-first-time.

## Migrations applied (Regla 5)

- `supabase/migrations/20260429180000_crm_mutation_idempotency_keys.sql` — RLS-protected (member SELECT, admin INSERT/DELETE — NO UPDATE: rows immutables), GRANTs service_role + authenticated, comments con D-XX references.
- `supabase/migrations/20260429180001_orders_closed_at.sql` — `ALTER TABLE orders ADD COLUMN closed_at TIMESTAMPTZ NULL` + index parcial `WHERE closed_at IS NOT NULL` para filtros Kanban.

Ambos aplicados en producción Supabase ANTES del push del código que los usa (Plan 01 Task 1.3 PAUSE, "approved" tras 4 SELECT verifications).

## Open follow-ups

### High priority

- **`crm-mutation-tools-pw-confirmation-integration`** — migrate `somnio-sales-v3-pw-confirmation` from `crm-writer` (current `crm-writer-adapter.ts` con `proposeAction + confirmAction`) to `crm-mutation-tools` (in-loop tool calls). Cleanup esperado: borra `crm-writer-adapter.ts`, swap a tool calls deterministas, update CLAUDE.md scope, smoke test produccion.

### Per-agent migration follow-ups

- Sandbox UI agentes → permanecen en crm-writer indefinidamente (preview-flow no replicable).
- Agentes nuevos → eligen mutation-tools por defecto (sin migración needed).

### V1.1 / V1.x backlog

- `updateOrder.products` (V1.1).
- Optimistic concurrency en `updateOrder` (`version` column + WHERE version=?) — last-write-wins en V1.
- Bulk operations (`bulkArchiveOrders`, `bulkMoveOrdersToStage`, `bulkUpdateContactTags`).
- Admin gate para destructivas (per-agent opt-in via `ctx.actorRole`).
- Tools de re-hidratación opt-out (lite mode).
- DB view unificado `crm_writes_unified` (UNION crm_bot_actions + agent_observability_events) — solo si Pitfall 11 dolor concreto.
- Cross-module type unification (`ResourceType` unificado entre crm-writer + crm-mutation-tools).

## References

### Standalone artifacts

- `CONTEXT.md` — 16 decisiones D-pre-01..D-11 (decision authority).
- `RESEARCH.md` — 1370 líneas (technical authority — full implementation map).
- `01-PLAN.md` … `06-PLAN.md` — Wave plans.
- `01-SUMMARY.md` … `06-SUMMARY.md` — per-plan SUMMARYs.
- `INTEGRATION-HANDOFF.md` — consumer guide (snapshot doc, no cambia post-merge).
- `LEARNINGS.md` — bug log + patterns + cross-plan invariants + deferred backlog.
- `SUMMARY.md` — este documento (phase-close).

### Cross-references (project-wide)

- `.claude/skills/crm-mutation-tools.md` — project skill (living doc).
- `CLAUDE.md` § Module Scope: crm-mutation-tools.
- `.claude/rules/agent-scope.md` § Module Scope: crm-mutation-tools (cross-ref pointer).

### Source

- Module: `src/lib/agents/shared/crm-mutation-tools/{index,types,helpers,contacts,orders,notes,tasks}.ts`.
- Domain: `src/lib/domain/{contacts,orders,notes,tasks,crm-mutation-idempotency}.ts`.
- Inngest cron: `src/inngest/functions/crm-mutation-idempotency-cleanup.ts` (TZ=America/Bogota 0 3 * * *).
- Test runner: `src/app/api/test/crm-mutation-tools/runner/route.ts` (4-gate hardened).
- Integration tests: `src/__tests__/integration/crm-mutation-tools/{cross-workspace,idempotency,soft-delete,stage-change-concurrent}.test.ts`.
- E2E spec: `e2e/crm-mutation-tools.spec.ts`.
- E2E fixtures: `e2e/fixtures/seed.ts` (extendido con `seedMutationToolsFixture` + `cleanupMutationToolsFixture`).

### Sibling

- `.claude/skills/crm-query-tools.md` (mismo día ship, verbo opuesto — read).
- `.planning/standalone/crm-query-tools/` (full standalone artifacts).
- `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md` (template usado para este).

---

*Standalone: crm-mutation-tools — phase-close summary.*
*Shipped 2026-04-29.*
