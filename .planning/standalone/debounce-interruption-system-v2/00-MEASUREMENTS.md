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

### Deferred decision: Pitfall 1 (Multi-Zone HA) — NOT activated at provisioning

User declined the Prod Pack add-on during Upstash DB creation on 2026-05-26 (presented cost was $200/mo — exceeded the ~$5-10/mo estimate in the original cost analysis). Justified deferral because:
- v4 is dormant (see §v4 dormancy attestation below) — the lock is not yet on the critical path.
- A single-zone outage during this build phase has zero customer impact.
- The Free tier and Pay-as-You-Go single-zone is sufficient for development latency / correctness validation.

**Re-evaluate** when v4 is about to be flipped to active in production. At that point:
- Validate the $200/mo number against current Upstash pricing.
- Compare against alternatives: managed Redis on Railway, ElastiCache, etc.
- If cost is still too high, document acceptance of single-zone risk in the v4-activation standalone.

This deferral is recorded as forward-looking debt; **NOT a blocker** for Plans 01–07.

### Regional note: Vercel is in `gru1` (São Paulo), not `iad1`

Plan text and RESEARCH A1 referenced `iad1` (Virginia, us-east-1) as the Vercel region; verified by user 2026-05-26 that the actual Vercel Function Region for `morfx` project is **`gru1` (São Paulo, sa-east-1)**. Upstash DBs were correctly co-located in São Paulo (sa-east-1) to match. Latency expectations in RESEARCH A1 (P50 5-15ms / P99 20-40ms) should still hold within the sa-east-1 region — the Pitfall is cross-region traffic, which we avoid.

---

## Upstash REST latency baseline (RESEARCH A1)

### Methodology — pivot from Vercel preview to local WSL probe

Original plan: deploy a `/api/_diagnostics/upstash-latency` route to a Vercel preview branch and curl it 3 times to capture Vercel(gru1) → Upstash(sa-east-1) latency. The Vercel preview was created (branch `probe/upstash-latency`, deployment `morfx-lux5wr2z8`), but Vercel team-level "Vercel Authentication" gated the URL (HTTP 307 → /login) and the project's Free plan does not expose project-level toggles to disable it nor an "Add Bypass Secret" button (those require Advanced Deployment Protection at $150/mo, declined). Shareable Links route was an alternative but ALSO declined — user opted for the cheaper local-probe pivot.

**Pivot:** `scripts/upstash-latency-probe.mjs` (one-off, deleted after capture) executed from the operator's WSL workstation against the DEV Upstash database (`deep-gator-136538.upstash.io`, sa-east-1) on 2026-05-26.

### Captured results

Three runs of 30 samples each (SET + DEL per sample):

| Run | P50 (ms) | P95 (ms) | P99 (ms) | Min (ms) | Max (ms) |
|-----|----------|----------|----------|----------|----------|
| 1 (cold-ish) | 177.6 | 181.0 | 199.0 | 175.9 | 877.1 |
| 2 (warm)     | 176.4 | 181.5 | 185.3 | 175.1 | 186.9 |
| 3 (warm)     | 176.4 | 178.7 | 179.5 | 176.0 | 180.5 |

### Interpretation — important caveat

These numbers are **NOT** representative of Vercel(gru1) → Upstash(sa-east-1) latency. The WSL probe runs from the operator's home network (physical location Colombia, per project memory + CLAUDE.md timezone `America/Bogota`) — the path is:

```
WSL → Windows → home Wi-Fi → Colombian ISP → ... → AWS sa-east-1 (São Paulo)
```

The ~177ms baseline reflects the **cross-country network distance Colombia → Brazil**, not the in-region datacenter latency that Vercel will see. The cold-ish run-1 max of 877ms confirms there's TLS handshake + DNS warm-up overhead the first time around (the subsequent runs settled to ~180ms warm).

For Vercel(gru1) inside AWS sa-east-1 hitting Upstash inside sa-east-1, expected latency is **5-30ms** (same-region intra-AWS) — the RESEARCH A1 claim of 5-15ms P50 / 20-40ms P99 is plausible but **NOT empirically validated** by this probe.

### Validation verdict vs RESEARCH A1

**INDETERMINATE** for in-region Vercel→Upstash. The probe DID confirm:
- ✅ Upstash REST connectivity works from this codebase (no auth/SDK issues).
- ✅ Warm runs are tight (P50 ≈ P95, low variance) — Upstash itself is healthy and not saturated.
- ✅ Even the **worst** observed P99 (199ms) is **well within** the heartbeat-to-TTL safety margin: 5s heartbeat at 199ms each = ~25 heartbeats per TTL → 25x margin (vs target 9x at 5-15ms latency). System tolerates Colombia-WSL latency comfortably.
- ❌ Did **not** measure the in-region path that production will use. Real Vercel→Upstash P99 should be lower (5-30ms range).

### Re-validation path

Real P50/P95/P99 will be measured by **Plan 05 E2E smoke** (lock acquisition end-to-end timing) and by **Phase 42.1 observability** (which captures per-call latency once v4 begins serving prod). If either flags P99 > 50ms in-region, return here and revise `LOCK_TTL_S` per the rule in §Sub-loop latency baseline.

### Deferred-Vercel-probe rationale (documented)

This deviation from "deploy probe to Vercel preview" is deferred risk acceptance:
- v4 is dormant (Task 0.5) — zero customer impact during build phase.
- The 45s TTL has enormous headroom (~25x over the worst measured 199ms; ~3x even at a paranoid 15s lock-acquisition assumption).
- Plan 05 + Phase 42.1 will catch any real in-region latency issue before v4 ships to customers.

If a future audit needs Vercel→Upstash in-region numbers without going through Plan 05, configure a Vercel Shareable Link or generate a Protection Bypass secret (requires team plan upgrade, currently declined for cost) and re-run the same probe.

---

## REVISION W7 — keepTtl support verdict (@upstash/redis 1.38.0)

### Test methodology

`scripts/verify-keepttl.ts` (one-off, deleted after capture) executed against the DEV Upstash database (`deep-gator-136538.upstash.io`, sa-east-1):

1. `redis.set(key, 'v1', { ex: 30 })` → initial TTL = 30s
2. `await sleep(2_000)` → TTL observably below 30 (expected ~27-28s)
3. `redis.set(key, 'v2', { keepTtl: true })` → preserve the remaining TTL
4. `redis.ttl(key)` + `redis.get(key)` → measure outcome

Interpretation rule:
- TTL ∈ [25, 29] → SUPPORTED (TTL preserved)
- TTL = -1 → NOT SUPPORTED (SDK silently dropped TTL)
- SDK throws → NOT SUPPORTED (option rejected)

### Captured output

```text
[dotenv@17.3.1] injecting env (26) from .env.local
initial TTL after ex:30 set: 30
Result: { setError: null, ttl2_after_keepTtl: 27, value2: 'v2' }
VERDICT: SUPPORTED (TTL preserved at 27s)
```

Date executed: 2026-05-26. SDK version: `@upstash/redis@1.38.0`. Probe script: `scripts/verify-keepttl.ts` (deleted post-capture).

### VERDICT: SUPPORTED

`@upstash/redis@1.38.0` **supports** the `{ keepTtl: true }` SET option. The TTL was preserved at 27s (matches the expected 28s minus a few hundred ms of network/processing).

### Plan 04 V4MessagingAdapter.onFirstSendCompleted branch decision

Plan 04 MUST implement the **SUPPORTED branch**:

```ts
// Re-write lock value (e.g., to mark "first-send completed") WITHOUT resetting TTL.
await redis.set(key, newValue, { keepTtl: true } as { keepTtl: true })
```

(The TypeScript `as` assertion is needed because the public `SetCommandOptions` type does not list `keepTtl` even though the SDK accepts it at runtime — this is a known type-vs-implementation gap in the package.)

The fallback "read-then-set" branch (`const ttl = await redis.ttl(key); await redis.set(key, newValue, { ex: Math.max(ttl, 5) })`) is **NOT needed** and should NOT appear in the codebase. If a future SDK upgrade breaks `keepTtl`, re-run this probe and re-decide.

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

