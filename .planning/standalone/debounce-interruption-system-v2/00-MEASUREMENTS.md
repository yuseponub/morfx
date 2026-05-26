# Plan 00 — Wave 0 Measurements & Attestations

Captured during inline execution of Plan 00. Anchors TTL/heartbeat values locked in DISCUSSION-LOG.md (D-09, D-13) against empirical evidence. Consumed by Plans 01–07 (TTL constant in `lock.ts`, dedup confidence in `messages-dedup.ts`, dormancy attestation for Regla 6 + D-07, REVISION W7 keepTtl verdict for `V4MessagingAdapter.onFirstSendCompleted`).

Date range of measurements: 2026-05-25 → 2026-05-26 (executed inline by orchestrator).

---

## Messages dedup constraint inventory (RESEARCH A8 audit)

Source of truth: `git grep` against `supabase/migrations/` for all UNIQUE / PRIMARY KEY / UNIQUE INDEX touching the `messages` table.

### Existing constraints on `messages`

| # | Constraint                | Definition                                             | Source migration                                            |
|---|---------------------------|--------------------------------------------------------|-------------------------------------------------------------|
| 1 | `messages_pkey`           | `PRIMARY KEY (id)` (`id UUID DEFAULT gen_random_uuid()`) | `20260130000002_whatsapp_conversations.sql:47`              |
| 2 | `messages_wamid_unique`   | `UNIQUE (wamid)`                                       | `20260130000002_whatsapp_conversations.sql:82`              |

Supporting (non-constraint) indexes on `messages`:
- `idx_messages_wamid ON messages(wamid) WHERE wamid IS NOT NULL` (`20260130000002:99`) — partial index, NOT a constraint
- `idx_messages_conversation` / `idx_messages_workspace` / `idx_messages_direction` (perf, not dedup)
- `idx_messages_template` (`20260131000002:118`)
- `idx_messages_unprocessed_inbound` (`20260224100000:13`)
- `messages_fts_idx` / `messages_workspace_created_idx` (`20260410:53`/`60`)

No later migration adds additional UNIQUE constraints to `messages`. The `wamid TEXT NOT NULL UNIQUE` match at `20260131000002:158` is on a different table (sales_actions / templates blob — verified by context).

### Coverage assessment

- **WhatsApp inbound dedup: COVERED** via `messages_wamid_unique`. `wamid` IS Meta's `message_id` for WhatsApp, so duplicate inbound dispatches (e.g., webhook retried by 360dialog/Meta after an aborted run) collide at the DB layer and surface `23505 unique_violation` to the application. This is the belt-and-suspenders defense layer #3 cited in RESEARCH Pitfall 1 (interruption-aware messaging).
- **FB/IG (Messenger / Instagram Direct via ManyChat) inbound dedup: GAP**. The `messages` table has no UNIQUE constraint on any FB/IG-equivalent identifier (e.g., `external_subscriber_id + ManyChat message_id`). v4 currently serves **WhatsApp ONLY** (per D-12 and the memory note `v4 sigue DORMANT en prod` — when v4 ships it will start on WhatsApp).

### Decision: PROCEED (REVISION W6)

REVISION W6 alignment with Plan 03: FB/IG dedup gap is **forward-looking risk**, NOT a blocker for this phase. v4 today serves WhatsApp only; the WhatsApp dedup constraint is sufficient.

If v4 begins serving FB/IG traffic in a future standalone, that standalone MUST add an appropriate UNIQUE constraint to `messages` via a Regla 5 migration (apply-before-deploy). Plan 03 SUMMARY will record acceptance of this risk when it ships.

RESEARCH A8 claim re-evaluation: A8 specifically claimed `(conversation_id, message_id)` was unique on `messages`. This claim is INACCURATE for the current schema (only `wamid` is unique). However, since `wamid` IS Meta's `message_id` for the WhatsApp path, A8's INTENT (Meta-side message ID is unique at DB layer) is satisfied for the WhatsApp path. Re-stating the corrected claim:

> WhatsApp `messages.wamid` is unique (`messages_wamid_unique`) and equals Meta's `message_id`, providing belt-and-suspenders dedup for the WhatsApp inbound webhook path.

---

## Sub-loop latency baseline (RESEARCH A2 → LOCK_TTL_S anchor)

### Query (executed against prod via service role)

```text
Source script: scripts/wave0-prod-queries.mjs (deleted after capture)
Date executed: 2026-05-26
Tables: agent_observability_events (partitioned by recorded_at) JOIN agent_observability_turns
Filter: category='pipeline_decision' AND label IN ('subloop_completed','subloop_completed_v4','subloop_outcome_v4')
        AND agent_id IN ('somnio-v3','somnio-v4','somnio-sales-v4')
        AND recorded_at >= now() - interval '30 days'
```

Discovery noted: production agent_id is `'somnio-v3'`, NOT `'somnio-sales-v3'` — plan text used the latter. Real agent_id values verified via `SELECT DISTINCT agent_id FROM agent_observability_turns ORDER BY started_at DESC LIMIT 50` (see also Task 0.5 below for the routing-rules side).

### Result table

| Metric                                | Value           |
|---------------------------------------|-----------------|
| `subloop_completed` events found      | **0**           |
| `subloop_completed_v4` events found   | **0**           |
| `subloop_outcome_v4` events found     | **0**           |
| Unique turns with sub-loop events     | **0**           |
| P50 / P95 / P99 (event.duration_ms)   | N=0 (no data)   |
| P50 / P95 / P99 (turn.duration_ms)    | N=0 (no data)   |

Sanity probe (`scripts/wave0-probe-labels.mjs`) — top labels under `pipeline_decision` in last 7d (sample 10k): `agent_routed (128)`, `state_committed (123)`, `webhook_agent_routed (115)`, `sales_track_result (105)`, `response_track_result (105)`, `router_fallback_default_agent (104)`, `availability_lookup (92)`, `appointment_decision (92)`, `intent_transition (82)`, `natural_silence (15)`, `order_decision (13)`, `router_matched (12)`, `skip_tag_detected (6)`, `interruption_path_a (5)`, `auto_trigger (3)`. NONE matched `subloop_*`. Additionally, **none** of these events have `events.duration_ms` populated (the `recordEvent(category, label, payload)` API in the codebase does not pass a 4th `duration_ms` argument — confirmed at `src/lib/agents/somnio-v4/sub-loop/index.ts:258,423,494,729`).

### Why N=0 is consistent with the design

1. **v4 is dormant** (confirmed in §v4 dormancy attestation below). The `subloop_completed` label is emitted only by `src/lib/agents/somnio-v4/sub-loop/index.ts`. Zero v4 traffic ⇒ zero `subloop_completed` events. Expected.
2. **v3 doesn't have a sub-loop architecture.** v3's track architecture emits `sales_track_result`, `response_track_result`, `order_decision`, `intent_transition` — not a single `subloop_completed`. So v3 cannot serve as a latency proxy for the v4 sub-loop.

### DECISION (per Plan 00 Task 0.1 fallback rule)

`LOCK_TTL_S = 45` (no change from DISCUSSION-LOG D-09 + 2026-05-25 user adjustment). Sample size N=0 means the 2026-05-25 17s budget reasoning is **untested empirically** but **also not contradicted**. The conservative default is justified because:
- D-13 worst-case envelope is 17s (Haiku comprehension + Gemini Flash generation + compliance gate + retries).
- 45s TTL yields a ~2.6x margin over the worst-case envelope, leaving room for cold-start spikes.
- If post-ship measurement (once v4 begins serving prod traffic) shows P99 > 25s, Plan 01's `lock.ts` constant comment cites this section so the operator can bump to 60s without re-planning.

**Reproduce after v4 ships:** re-run the same query for `label='subloop_completed'` (no `agent_id` filter needed once v4 alone emits it) and re-derive P99 against the 17s anchor.

---

## Upstash REST latency baseline (RESEARCH A1)

**STATUS: DEFERRED until Task 0.3 (Upstash provisioning) completes.** Once `.env.local` + Vercel envs are populated, Task 0.2 deploys a throwaway `/api/_diagnostics/upstash-latency` route to a preview branch and captures 3 warm runs (N=30 per run). Section will be backfilled here with `p50_ms`, `p95_ms`, `p99_ms`, and the RESEARCH A1 validation verdict.

---

## v4 dormancy attestation (D-04 + D-07 + Regla 6)

### Query 1 — observability events for v4 in Somnio workspace

```text
Source script: scripts/wave0-prod-queries.mjs (deleted after capture)
Date executed: 2026-05-26
Table: agent_observability_turns
Filter: workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
        AND agent_id IN ('somnio-v4','somnio-sales-v4')
        AND started_at >= now() - interval '7 days'
```

**Result: 0 rows.**

### Query 2 — active routing_rules in Somnio workspace targeting v4

```text
Table: routing_rules
Filter: workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490' AND active=true
Inspection: jsonb_path event->'params'->>'agent_id' (and aliases) for membership in V4_AGENTS
```

**Result: 5 active rules; 0 reference v4.** Full inventory:

| Priority | Name                                          | Target agent_id                          |
|----------|-----------------------------------------------|------------------------------------------|
| 100      | PW agent router                               | `somnio-sales-v3-pw-confirmation`        |
| 100      | P/W_lifecycle_order_in_progress               | (null — no agent_id in event.params)     |
| 800      | is_client_to_recompra                         | `somnio-recompra-v1`                     |
| 900      | legacy_parity_recompra_disabled_client_to_default | `somnio-sales-v3`                    |
| 1000     | forzar_humano_kill_switch                     | (null — kill-switch, not a route target) |

### Query 3 — paranoia: any v4 turn in ANY workspace last 7d

```text
Table: agent_observability_turns
Filter: agent_id IN ('somnio-v4','somnio-sales-v4') AND started_at >= now() - interval '7 days'
```

**Result: 0 rows globally.**

### Conclusion: DORMANT

D-07 ("big bang en agente dormant — sin feature flag") and Regla 6 ("Proteger Agente en Produccion") preconditions are satisfied:
- Zero v4 traffic in the last 7 days (Somnio-scoped and globally).
- Zero active routing rules sending traffic to v4.
- No flag-flip risk: the agent is not currently serving customers.

**Plan 04 → Plan 07** can land code that changes v4 behavior without a feature flag (D-07 stance honored).

---

