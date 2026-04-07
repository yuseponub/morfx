# Phase 42 — Session Lifecycle: Production Diagnostics Runbook

**Audience:** The user (only they can run queries against production).
**Purpose:** Confirm the constraint name before applying the migration, and dimension the impact of the first cron run before enabling Wave 2 code.

All queries run in the Supabase SQL editor, production project, against the `public.agent_sessions` table. All timestamps use `America/Bogota` per Regla 2 of CLAUDE.md.

---

## Run order

Run the queries **in this exact order** and capture the output of each before proceeding.

1. **Q1 — MUST run first, MUST run before applying migration `20260410000000_session_lifecycle_partial_unique.sql`.**
   - Q1 returns the actual unique constraint name on `agent_sessions`.
   - **Expected name:** `agent_sessions_conversation_id_agent_id_key` (Postgres default for a table-level `UNIQUE(conversation_id, agent_id)`).
   - **If Q1 returns a DIFFERENT name:** STOP. Tell the executor agent the real name so the `DROP CONSTRAINT` line in the migration file can be edited before you paste it into Supabase. The migration uses `IF EXISTS` so a wrong name becomes a silent no-op — the old constraint would remain in place and the partial unique index would coexist with the full unique constraint, breaking Opcion A (multiple historical sessions per `(conversation_id, agent_id)`).

2. **Q2 → Q6 — informational, run in order, capture all outputs.** These queries do not gate the migration; they only dimension impact and sanity-check current state. Paste the outputs back to the executor agent.

3. **Q3 is load-bearing for 05-PLAN.** The `stale_cron_rule` column is the exact number of rows the first cron run of `close-stale-sessions` will close.
   - **If `stale_cron_rule <= 1000`:** safe to let the cron do its first run unconstrained.
   - **If `stale_cron_rule > 1000`:** flag this in the Phase 42 plan 01 SUMMARY. Before enabling the cron in 05-PLAN, a manual one-off tighter run must happen first — something like:
     ```sql
     UPDATE agent_sessions
     SET status = 'closed',
         updated_at = timezone('America/Bogota', NOW())
     WHERE status = 'active'
       AND last_activity_at < timezone('America/Bogota', NOW()) - INTERVAL '30 days';
     ```
     (tuned to break the bulk close into a smaller cohort first, so the first automated cron run at 02:00 COT is not unexpectedly large). 05-PLAN will reference this flag when deciding rollout sequencing.

4. **Q4 is a safety check.** If Q4 returns ANY rows, the current `UNIQUE(conversation_id, agent_id)` constraint has somehow been bypassed in production. Do NOT drop it until those duplicates are reconciled manually — otherwise the partial unique index creation in Step 2 of the migration may still succeed (only `WHERE status='active'`), but you would be silently masking a data-integrity problem.

---

## Q1: Confirm constraint name

**Purpose:** Verify the exact name of the unique constraint on `agent_sessions` so the migration can drop it by name. Postgres generates constraint names automatically as `<table>_<columns>_key` for inline `UNIQUE(...)` declarations, but this can be overridden by hand, renamed, or inherited from a legacy DDL. Always verify before dropping.

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'agent_sessions'::regclass
  AND contype = 'u';
```

**Expected output:**

| conname |
|---|
| `agent_sessions_conversation_id_agent_id_key` |

**Action based on result:**
- **Exactly `agent_sessions_conversation_id_agent_id_key`:** migration file needs no edits. Proceed to Q2.
- **Different name:** tell the executor agent the real name. The migration's `DROP CONSTRAINT IF EXISTS` line must be updated to that name before you paste the migration into Supabase.
- **No rows returned:** the unique constraint has already been dropped (maybe by a previous partial run of this migration). Verify the partial index exists with:
  ```sql
  SELECT indexname FROM pg_indexes
  WHERE tablename = 'agent_sessions'
    AND indexname = 'agent_sessions_one_active_per_conv_agent';
  ```
  If it exists too, the schema is already at the target state — skip the migration and go to Q2 for sanity checks.
- **Multiple rows:** there's more than one unique constraint on the table. Paste all of them back; only the `(conversation_id, agent_id)` one should be dropped.

---

## Q2: Count sessions by status (sanity check)

**Purpose:** Confirm the audited reality from CONTEXT §2.1 — in production, only `active` and `handed_off` should exist. `closed` and `paused` are dead code in the schema.

```sql
SELECT status, COUNT(*) AS cnt
FROM agent_sessions
GROUP BY status
ORDER BY cnt DESC;
```

**Expected output:** Two rows.

| status       | cnt |
|--------------|-----|
| `active`     | N (majority) |
| `handed_off` | M (minority) |

**Action based on result:**
- **Only `active` and `handed_off`:** expected, proceed to Q3.
- **Any `closed` or `paused` rows exist:** unexpected but not blocking. Capture and note in SUMMARY — somebody has been writing those statuses manually or via a code path that wasn't in the grep audit. Worth investigating before Wave 2.
- **No rows at all:** the table is empty (fresh environment / test project). Migration can still be applied safely but Q3 will be meaningless.

---

## Q3: Impact of first cron run — how many active sessions are stale

**Purpose:** Answer Open Question #1 from `42-CONTEXT.md §9` and `42-RESEARCH.md §Open Questions`. The `stale_cron_rule` column is the exact number of rows the very first execution of `close_stale_agent_sessions()` will touch. This is **load-bearing** for 05-PLAN — if it's too large, we do a manual tightened run first.

```sql
SELECT
  COUNT(*) FILTER (
    WHERE last_activity_at < timezone('America/Bogota', NOW()) - INTERVAL '24 hours'
  ) AS stale_24h,
  COUNT(*) FILTER (
    WHERE last_activity_at < timezone('America/Bogota', NOW()) - INTERVAL '7 days'
  ) AS stale_7d,
  COUNT(*) FILTER (
    WHERE last_activity_at < timezone('America/Bogota', NOW()) - INTERVAL '30 days'
  ) AS stale_30d,
  COUNT(*) FILTER (
    WHERE last_activity_at < date_trunc('day', timezone('America/Bogota', NOW()))
  ) AS stale_cron_rule,
  COUNT(*) AS total_active
FROM agent_sessions
WHERE status = 'active';
```

**Expected output:** one row with 5 columns. `stale_cron_rule` should be `>= stale_24h` and `<= total_active`.

**Action based on result:**
- **`stale_cron_rule <= 1000`:** normal operation. 05-PLAN cron can run unconstrained.
- **`stale_cron_rule > 1000` and `<= 10000`:** flag in SUMMARY. 05-PLAN should add a one-off manual 30-day sweep before enabling the cron (see Run order §3 above for the SQL).
- **`stale_cron_rule > 10000`:** flag in SUMMARY as **high-impact**. 05-PLAN must batch the first run in chunks (e.g., 30-day, then 7-day, then enable the cron) to avoid a multi-thousand row UPDATE at 02:00 AM.
- **`stale_30d > 0` and `stale_7d > 0`:** expected — we know sessions were never closed in runtime since the bug was introduced. This is documenting the scale of fossilization.

Paste the entire row back to the executor agent — all 5 numbers, not just `stale_cron_rule`.

---

## Q4: Duplicate (conversation_id, agent_id) already existing

**Purpose:** Safety check before dropping the unique constraint. Under the current schema, this query MUST return zero rows. If it returns any, the current `UNIQUE(conversation_id, agent_id)` has been somehow bypassed (manual SQL, replication glitch, or a bug), and dropping it without reconciling the duplicates first would be sweeping a bigger problem under the rug.

```sql
SELECT conversation_id, agent_id, COUNT(*) AS cnt
FROM agent_sessions
GROUP BY conversation_id, agent_id
HAVING COUNT(*) > 1;
```

**Expected output:** zero rows.

**Action based on result:**
- **Zero rows:** expected, proceed to Q5.
- **Any rows returned:** STOP. Do NOT apply the migration. Paste the results back to the executor agent. The duplicates must be investigated and reconciled first (pick one winner per `(conversation_id, agent_id)`, archive the rest, or merge state). Only after reconciliation is it safe to drop the constraint — and at that point the partial unique index will still enforce uniqueness-among-actives going forward.

---

## Q5: Distribution of last_activity_at among active sessions

**Purpose:** Sanity check the scale of historical accumulation. Knowing the oldest `active` session tells us how many months of fossilization the cron will sweep on first run, and whether the 30-day tightened run (if used) catches the bulk of them.

```sql
SELECT
  MIN(last_activity_at) AS oldest,
  MAX(last_activity_at) AS newest,
  COUNT(*)              AS total
FROM agent_sessions
WHERE status = 'active';
```

**Expected output:** one row with `oldest` likely months ago (consistent with the bug having been present since the table was created), `newest` being recent (active conversations).

**Action based on result:**
- **`oldest` is several months ago:** expected, consistent with CONTEXT §2.3 (no runtime code path ever calls `closeSession()`).
- **`oldest` is within the last 24h:** surprising — either the bug was recently fixed somewhere and not documented, or the table was recently cleaned. Note in SUMMARY and investigate.
- **`total` is very different from the `total_active` from Q3:** queries ran at different times against a changing table, or there's a race. Re-run both back-to-back.

---

## Q6: Conversations blocked by `handed_off` + unique constraint (the "bot mudo" cases)

**Purpose:** CONTEXT §1 describes "Caso B": conversations where the existing session is `handed_off`, a new message arrives, the code tries to INSERT a new `active` session, and gets a 23505 unique-constraint violation — the bot goes mute on that conversation forever. After Phase 42's partial unique index, these conversations will be able to receive a fresh `active` row alongside the existing `handed_off` row.

```sql
SELECT conversation_id, agent_id, status, last_activity_at
FROM agent_sessions
WHERE status = 'handed_off'
ORDER BY last_activity_at DESC
LIMIT 50;
```

**Expected output:** up to 50 rows of `handed_off` sessions, most recent first.

**Action based on result:**
- **0 rows:** no conversations have been handed off, Caso B was only theoretical so far. Proceed.
- **Up to ~50 rows:** expected scale, paste a summary count back (not the full rows — they're just sanity).
- **Count via `SELECT COUNT(*) FROM agent_sessions WHERE status = 'handed_off'` (optional):** if you want the total, run this separately. Not required for the runbook but useful for the SUMMARY.

Purely informational — Q6 does not gate the migration.

---

## After Q1–Q6 are captured

1. Apply migration `supabase/migrations/20260410000000_session_lifecycle_partial_unique.sql` in Supabase SQL editor.
2. Apply migration `supabase/migrations/20260410000001_close_stale_sessions_rpc.sql` in Supabase SQL editor.
3. Verify with:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'agent_sessions';
   -- Expect: agent_sessions_one_active_per_conv_agent present

   SELECT proname FROM pg_proc WHERE proname = 'close_stale_agent_sessions';
   -- Expect: 1 row
   ```
4. Reply `done` to the executor agent and paste the Q3 output (all 5 columns).
