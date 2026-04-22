---
phase: somnio-recompra-crm-reader
plan: 07
wave: 5 (close-out + QA)
status: complete
completed_at: 2026-04-22T17:40:00Z
---

# Plan 07 — QA close-out + docs sync

## Scope

Plan 07 was the human gate per GSD REGLA 6:
- Flip the platform-wide feature flag from `false` → `true`
- Smoke test the full pipeline end-to-end
- Fix any gaps surfaced in QA
- Update authoritative docs (`.claude/rules/agent-scope.md`, `docs/analysis/04-estado-actual-plataforma.md`)
- Close the standalone

## Feature-flag flip

```sql
UPDATE platform_config
SET value = 'true'::jsonb, updated_at = NOW()
WHERE key = 'somnio_recompra_crm_reader_enabled';
```

Applied in production on 2026-04-22 at ~11:04 UTC (confirmed via SELECT: `value=true, updated_at=2026-04-21 11:04:53`).

## QA gap fixes (Plan 08 de facto — tracked as 08-T1/T2/T3 commits)

The initial smoke test surfaced 4 issues with the just-shipped pipeline. All were fixed in-place and pushed to production before closing the phase.

### P1 — Observability of the crm-reader turn invisible in the debug panel

**Symptom:** `agent_observability_turns` never received a row with `agent_id='crm-reader'`. The events recorded during the Inngest function (`crm_reader_completed` / `crm_reader_failed`) never surfaced in the WhatsApp inbox Debug Panel.

**Root cause:** The Inngest function was constructing its `ObservabilityCollector` with a synthetic conversationId (`recompra-preload-${sessionId}`). The Debug Panel is scoped by `conversationId` and joins against the real WhatsApp conversation id — so the collector DID flush a turn row, but under a "ghost" conversationId that no UI query ever hits.

**Fix (commit `3749800`):** Load the real `conversation_id` from `SessionManager.getSession(sessionId)` at the top of the function and use it for the outer/inner collectors. Fallback to the synthetic id only when the session cannot be loaded (race-condition safety).

### P3 — Idempotency short-circuit blocked retries after a transient error

**Symptom:** Once a run wrote `_v3:crm_context_status='error'` to session state (e.g. after a timeout), every subsequent dispatch for that session short-circuited with `{ status: 'skipped', reason: 'already_processed', existingStatus: 'error' }` and never retried, even though the Inngest retry policy allows it.

**Root cause:** The idempotency check treated `'error'` as a terminal state alongside `'ok'` and `'empty'`.

**Fix (commit `3749800`):** The short-circuit now only fires on terminal-success markers (`'ok'` / `'empty'`). Status `'error'` falls through to retry logic. Added a dedicated test case.

### P2 — `pollCrmContext` ran on turn 0 (wasted latency + spurious events)

**Symptom:** Every first message emitted a `crm_context_missing_after_wait` event — the poll waited the full 3 seconds before giving up, because the dispatch runs POST-runner of turn 0 and the marker cannot possibly exist yet.

**Fix (commit `17cdd56`):** Guarded the poll with `fastPathHit || state.turnCount >= 1`. Fast-path hit preserved so a pre-existing marker in the input snapshot is still consumed. From turn 1 onward behaviour is unchanged.

### P6 — Reader timed out at 12s every smoke test

**Symptom:** `crm_reader_failed` with `error: "This operation was aborted"` and `durationMs ≈ 12043`. The AbortController killed the reader mid-synthesis.

**Root cause:** crm-reader uses Claude Sonnet 4.5 with `stopWhen=stepCountIs(5)`. Observed trace showed the model chaining `contacts_get + orders_list + orders_get + pipelines_list + orders_get` then starting synthesis — total budget landed in the 15-20 s range. 12 s was too tight.

**Fix (commit `48a7f0c`):** Bumped `READER_TIMEOUT_MS` from 12 000 to 25 000. Smoke test after the bump produced a clean `_v3:crm_context_status='ok'` with a rich context paragraph.

## Final smoke test (post all fixes)

Session `4639c20c-eeea-4e37-aba3-5ff3bcf86077`:

```
crm_status: ok
crm_preview: "El contacto Jose Romero tiene un total de 2 pedidos registrados.
El último pedido entregado corresponde al ID c96c3c4c-9edb-4ba7-8f5d-f4a34cb416a0,
que se encuentra en el stage ENTREGADO del pipeline Logistica; este pedido incluye
1 unidad de Somnio 90 Caps y fue creado el 21 de abril de 2026 a las 23:36:50 UTC.
...La dirección más reciente confirmada es Cra 38#42-17 Apto 1601B..."
```

Pipeline decision events captured under the correct turn agents:
- `recompra_routed` → turn_agent=`somnio-v3` (routing turn)
- `crm_reader_dispatched` → turn_agent=`somnio-v3` (same routing turn)
- `crm_reader_completed` → turn_agent=`crm-reader` (Inngest function turn) ✅ visible in Debug Panel

## Commits shipped (Plan 07 + Plan 08 gap closure)

| Commit | Task | Description |
|--------|------|-------------|
| `bfaaa7b` | 07-T1 | Register somnio-recompra-v1 as in-process consumer in agent-scope.md (D-17) |
| `a7555ae` | 07-T2 | Register integration shipped in docs/analysis/04-estado-actual-plataforma.md |
| `3749800` | 08-T1 | P1 + P3: real conversationId + retry-on-error |
| `17cdd56` | 08-T2 | P2: skip poll on turn 0 |
| `48a7f0c` | 08-T3 | P6: reader timeout 12s → 25s |

Tests: 25/25 pass across all Plan 03/05/06 suites.

## Open items handed off

The final smoke test revealed preexisting bugs in the **recompra agent itself** (unrelated to this phase's CRM reader preload integration). Documented and opened as a separate debug:

**`.planning/debug/recompra-greeting-bugs.md`**

- Bug 1: `loadLastOrderData` not populating `nombre/apellido/ciudad` in datos_capturados
- Bug 2: Greeting template lookup using wrong `agent_id` (recompra looks up `somnio-recompra` but the expected "ELIXIR DEL SUEÑO" template lives under `somnio-sales-v3`)
- Bug 3: Time-of-day calculation returning "noches" at ~17:35 Bogotá (likely UTC vs local issue)

These are **preexisting** bugs — the CRM reader integration is a net positive that gives the recompra agent richer per-client context from turn 1 onward, but does not affect turn 0 greeting (which is the scope of the new debug).

## Phase status

`somnio-recompra-crm-reader` is **complete**. Pipeline is live in production, flag ON, 4 QA gap fixes deployed. Context preload works end-to-end for all recompra clients in the Somnio workspace.
