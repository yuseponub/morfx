# Client Activation Auto-Revoke — Research

**Researched:** 2026-04-28
**Domain:** Postgres trigger extension + automatic backfill (Supabase migration)
**Confidence:** HIGH (codebase + locked migration patterns), MEDIUM (RQ-1 prod tag — codebase-only verification, prod SQL still recommended for closure)

## Summary

This standalone extends the existing `mark_client_on_stage_change` trigger so it ALSO sets `is_client=false` when a contact's last activator-stage order leaves the activator set. CONTEXT.md locks D-01..D-05; the open item D-05 (legacy "Cliente" tag) is resolved here as **Case B/C — legacy dead code**: zero consumers in `src/`, the only visible "Cliente" string is an HTML tooltip on a badge driven by `contacts.is_client` (not by a tag). Recommendation: drop lines 94-105 of the existing trigger in the new migration.

The implementation is self-contained: one new migration that `CREATE OR REPLACE`s the trigger function with the new IN/OUT logic plus a `DO $$` global backfill block. No domain-layer changes, no code push needed. Per Regla 5, the user applies the migration manually in Supabase prod and runs the verification SELECTs from CONTEXT.md.

**Primary recommendation:** Single migration `20260428160000_client_activation_revoke.sql` containing (1) `CREATE OR REPLACE FUNCTION mark_client_on_stage_change()` with IN/OUT branches and the legacy tag block removed, (2) one new index `idx_orders_contact_stage` for the EXISTS hot path, and (3) a `DO $$` backfill block that iterates enabled workspaces. Run by user in Supabase SQL Editor (Regla 5). No code deploy required.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `is_client = true` IFF the contact has `≥1 orden actual` in `activation_stage_ids`. No history flag, no grace window. Archived orders count (matches `backfillIsClient` behavior — no `archived_at` filter).
- **D-02:** Trigger fires only on IN/OUT transitions across the activator set boundary. Internal transitions (non-activator → non-activator OR activator → activator) skip. Skip on archive (`archived_at` UPDATE) and DELETE (morfx is soft-delete).
- **D-03:** Logic lives in the Postgres trigger (`mark_client_on_stage_change`), not in domain layer. Atomicity (same TX as `UPDATE orders.stage_id`) + impossible to bypass.
- **D-04:** Backfill runs automatically inside the same migration via `DO $$` loop over enabled workspaces.
- **D-05:** Legacy `tags WHERE name='Cliente'` insertion — research-resolved as **Case B/C dead code**. New trigger drops the legacy block entirely. (See RQ-1 Resolution below.)

### Claude's Discretion

- Migration filename timestamp suffix (within today, 2026-04-28).
- Whether to add a composite index `(contact_id, stage_id)` for the EXISTS subquery (recommended — see RQ-2.d).
- Whether to log a NOTICE per workspace inside the `DO $$` block (recommended for prod observability).

### Deferred Ideas (OUT OF SCOPE)

- Inngest event `contact.is_client_changed` — not emitted in this standalone.
- UI changes to `/settings/activacion-cliente` — none.
- `backfillIsClient()` domain function changes — none (still used by manual "Recalcular" button).
- Cleanup of historic `Cliente` tag rows in `contact_tags` (CONTEXT.md explicitly says no).
- Feature flag — not needed (current behavior is buggy, new is correct).
- Changes to `moveOrderToStage` or `crm-writer-adapter.ts`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LR-1 | Trigger handles UNSET when last activator order leaves the set | RQ-2 SQL pattern below |
| LR-2 | IN/OUT optimization: only border crossings trigger recalc | RQ-2 IF/ELSIF branches |
| LR-3 | Global backfill in same migration | RQ-3 DO $$ pattern |
| LR-4 | No domain layer changes | Trigger is self-contained (D-03) |
| LR-5 | D-05 resolution: dead-code branch | RQ-1 below — drop lines 94-105 |
| LR-6 | `isClient` fact still works post-change | RQ-5 confirmed: live DB read, no cache |
| LR-7 | `agent-lifecycle-router` priority-900 rule unaffected | RQ-5 — engine built per request |

---

## D-05 Resolution

**Verdict: Case B/C (collapsed) — LEGACY DEAD CODE. Drop lines 94-105 of the existing trigger in the new migration.**

### Evidence

**Codebase grep (`rg "['\"]Cliente['\"]" src/`):**

Only 3 hits in entire `src/` tree, NONE relate to a tag:

1. `src/app/actions/comandos.ts:128` — `let nombres = 'Cliente'` — fallback display name when contact has no name. Unrelated.
2. `src/app/(dashboard)/whatsapp/components/conversation-item.tsx:128` — `<span ... title="Cliente">` — HTML tooltip text on the amber badge. Driven by `showClientBadge` prop (which reads `contacts.is_client`), NOT by a tag query. Unrelated to `tags` table.
3. `src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts:83` — `const speaker = h.role === 'user' ? 'Cliente' : 'Bot'` — speaker label in conversation transcript prompt. Unrelated.

**Specific consumer searches (also zero hits):**
- `WHERE name = 'Cliente'` in `src/` — none
- `tag.name === 'Cliente'` in `src/` — none
- Filters in `src/lib/agents/`, automations, templates referencing the tag — none

**`getContactTags` returns string[] of tag names** (`src/lib/domain/tags.ts:358`) — used by routing fact `tags` (`src/lib/agents/routing/facts.ts:209`) and by `hasPagoAnticipadoTag` (line 219, hardcoded to `'pago_anticipado'`). No code path filters/branches on `'Cliente'`.

**Inbox badge reality check:** The user noted *"el icono si se mantiene"* — confirmed: the badge at `conversation-item.tsx:127-131` reads `showClientBadge` (which traces to `contacts.is_client`, not to any tag). The HTML `title="Cliente"` attribute is just the tooltip displayed on hover. **Removing the `Cliente` tag insertion in the trigger has zero UI impact.**

**Origin of the legacy code:** Migration `20260203000001_crm_whatsapp_sync.sql:74-114` originally created `auto_tag_cliente_on_ganado()` which case-INSENSITIVELY (`LOWER(name) = 'cliente'`) inserted to `contact_tags`. The 2026-02-21 badge migration ported it forward but switched to **case-sensitive `name = 'Cliente'`** (line 98 of current migration). If a workspace ever had a tag named `cliente` lowercase, the new trigger would not have matched it — meaning the ported logic likely never fired in production for workspaces that had the legacy tag. This further suggests the branch is effectively dormant.

### Production Verification SQL (recommended, not blocking)

The user can confirm Case C (no row exists in any workspace) by running this in Supabase SQL Editor BEFORE applying the new migration. If any rows return, document them — the migration still proceeds (we drop the trigger code path, but the historic `contact_tags` rows are not touched per CONTEXT.md "NO ampliar scope a borrar histórico de tags `Cliente` ya creados manualmente"):

```sql
-- 1) Does any workspace have a tag literally named 'Cliente' (case-sensitive)?
SELECT t.id, t.workspace_id, t.name, t.created_at,
       COUNT(ct.contact_id) AS contacts_tagged
FROM tags t
LEFT JOIN contact_tags ct ON ct.tag_id = t.id
WHERE t.name = 'Cliente'
GROUP BY t.id, t.workspace_id, t.name, t.created_at;

-- 2) Case-insensitive variant (the ORIGINAL trigger was case-insensitive)
SELECT t.id, t.workspace_id, t.name, t.created_at,
       COUNT(ct.contact_id) AS contacts_tagged
FROM tags t
LEFT JOIN contact_tags ct ON ct.tag_id = t.id
WHERE LOWER(t.name) = 'cliente'
GROUP BY t.id, t.workspace_id, t.name, t.created_at;
```

**Either result triggers the same action** (drop the legacy block) — only difference is whether the user wants to manually purge the rows later (out of scope for this standalone).

### Action in New Migration

Lines 94-105 of `supabase/migrations/20260221000000_client_activation_badge.sql` (the `SELECT t.id INTO v_tag_id` block + `IF v_tag_id IS NOT NULL` insert) are **omitted** in the new `CREATE OR REPLACE FUNCTION` body. The `v_tag_id UUID;` DECLARE is also dropped.

**Confidence:** HIGH (codebase). MEDIUM until prod SQL confirms zero usage — but even if rows exist, action is the same: drop the trigger code, leave historic data alone.

---

## Trigger SQL Pattern

Validated against Postgres docs (PL/pgSQL trigger semantics, row-level locking) and against existing morfx trigger conventions.

### Full function body (drop into new migration)

```sql
CREATE OR REPLACE FUNCTION mark_client_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_workspace_id UUID;
  v_old_in_set BOOLEAN;
  v_new_in_set BOOLEAN;
  v_other_exists BOOLEAN;
BEGIN
  -- Skip if no contact linked
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if stage_id actually changed
  IF TG_OP = 'UPDATE' AND OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
    RETURN NEW;
  END IF;

  v_workspace_id := NEW.workspace_id;

  -- Load config; skip if missing or disabled
  SELECT enabled, activation_stage_ids
  INTO v_config
  FROM client_activation_config
  WHERE workspace_id = v_workspace_id;

  IF NOT FOUND OR NOT v_config.enabled THEN
    RETURN NEW;
  END IF;

  -- D-02: classify boundary crossing
  v_new_in_set := NEW.stage_id = ANY(v_config.activation_stage_ids);

  IF TG_OP = 'INSERT' THEN
    -- INSERT to activator => IN; INSERT outside => skip
    IF v_new_in_set THEN
      UPDATE contacts
      SET is_client = true
      WHERE id = NEW.contact_id
        AND workspace_id = v_workspace_id
        AND is_client = false;
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' from here on
  v_old_in_set := OLD.stage_id = ANY(v_config.activation_stage_ids);

  -- Skip internal transitions (both inside or both outside the set)
  IF v_old_in_set = v_new_in_set THEN
    RETURN NEW;
  END IF;

  IF v_new_in_set AND NOT v_old_in_set THEN
    -- IN: order entered the activator set
    UPDATE contacts
    SET is_client = true
    WHERE id = NEW.contact_id
      AND workspace_id = v_workspace_id
      AND is_client = false;
    RETURN NEW;
  END IF;

  -- OUT: v_old_in_set AND NOT v_new_in_set
  -- D-03 edge case: only flip false if NO OTHER order of this contact remains in the set.
  -- Use OLD.contact_id when checking "other orders" so a same-TX contact reassignment
  -- doesn't leave the previous owner falsely marked as client. With OLD.contact_id we
  -- also guard the contact whose order just left.
  SELECT EXISTS (
    SELECT 1 FROM orders
    WHERE contact_id = OLD.contact_id
      AND workspace_id = v_workspace_id
      AND stage_id = ANY(v_config.activation_stage_ids)
      AND id <> NEW.id
  ) INTO v_other_exists;

  IF NOT v_other_exists THEN
    UPDATE contacts
    SET is_client = false
    WHERE id = OLD.contact_id
      AND workspace_id = v_workspace_id
      AND is_client = true;
  END IF;

  -- If contact_id was reassigned (OLD.contact_id <> NEW.contact_id) AND new contact
  -- now has its first order in an activator stage, also mark new contact (rare path,
  -- but cheap — defensive).
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND v_new_in_set THEN
    UPDATE contacts
    SET is_client = true
    WHERE id = NEW.contact_id
      AND workspace_id = v_workspace_id
      AND is_client = false;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger binding stays the same (already exists from 20260221 migration).
-- CREATE OR REPLACE FUNCTION above is enough; the existing trigger
-- `orders_mark_client_on_stage` continues to point to this function.
```

### Validation against research questions

**RQ-2.a (EXISTS pattern):** The CONTEXT.md draft used `NEW.contact_id`. **Switched to `OLD.contact_id` in the EXISTS subquery** because that is the contact whose `is_client` we are evaluating. If a contact reassignment happens in the same UPDATE (`OLD.contact_id <> NEW.contact_id`), checking `NEW.contact_id` would evaluate the wrong contact's order list. The trailing block handles the new-contact side defensively.

**RQ-2.b (contact reassignment):** Handled — see comment block. The `IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND v_new_in_set THEN` block sets the new contact to true if the reassigned order lands in an activator stage. The OLD contact gets the EXISTS check applied above. Both contacts are evaluated correctly.

**RQ-2.c (race conditions):** Postgres `BEFORE/AFTER UPDATE` triggers acquire a `FOR UPDATE` row lock implicitly on the `orders` row being updated (the row that fired the trigger). The EXISTS subquery does NOT lock other rows — it sees the current snapshot per `READ COMMITTED` (Supabase default). This means:

- **Same-TX double update of the same order:** safe, single trigger firing per UPDATE.
- **Concurrent TXs touching different orders of the same contact:** classic Postgres `READ COMMITTED` race window — TX A reads "no other orders in set" while TX B (uncommitted) is inserting one. Result: A flips `is_client=false`, then B's trigger sees A's commit and does NOT re-flip true (because B's UPDATE is on the `contacts` row gated by `is_client = false` only on SET branch — but B is INSERT, so it WILL set true). **Net: B will set true correctly via its own trigger after commit.** No additional locking needed.
- **Worst case scenario:** two concurrent OUTs of the same contact's two activator orders. Both triggers see "no other in set excluding self" because each excludes its own `id`. Both UPDATE `is_client=false`. Result is correct (zero activator orders remain → false is correct). No anomaly.
- **Pathological scenario** (mitigated by D-02 IF guard): If a third TX inserts a new activator order AFTER both OUT triggers' EXISTS reads but BEFORE their `UPDATE contacts`, the inserts trigger separately and set `is_client=true`. Final state depends on commit order. Postgres `READ COMMITTED` guarantees the LAST committed `UPDATE contacts` wins. In all observed branches the final state matches the post-commit reality. **No additional advisory lock needed.**

**RQ-2.d (Performance / index):** `idx_orders_contact ON orders(contact_id)` exists (single column, from `20260129000003_orders_foundation.sql:88`) but the EXISTS query filters by `(contact_id, stage_id)` AND uses `= ANY(uuid[])`. Postgres can use the contact_id index then filter rows by stage_id, which is acceptable for typical contacts (≤10 orders). For contacts with hundreds of orders this becomes wasteful. Recommended: add a composite index for the hot path. See "Index addition" below.

### Use of `IS NOT DISTINCT FROM`

Replaced `OLD.stage_id = NEW.stage_id` with `OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id` to handle NULL stage_id correctly. If for any reason a stage_id is NULL on either side, the `=` operator returns NULL (not true/false), and the IF would not skip as intended. `IS NOT DISTINCT FROM` treats NULL = NULL as true.

### Index addition (recommended)

```sql
-- Composite index to accelerate the OUT-branch EXISTS check.
-- Matches the WHERE clause: contact_id + stage_id = ANY(uuid[]).
CREATE INDEX IF NOT EXISTS idx_orders_contact_stage
  ON orders (contact_id, stage_id);
```

**Sized impact:** Somnio has 21,295 contacts and presumably ~20-30K orders. Index size ≈ small (< 5MB). Build is ONLINE-friendly (`CREATE INDEX CONCURRENTLY` is safer for production but cannot run inside a transaction; standard `CREATE INDEX IF NOT EXISTS` is fine for the migration since the table is small enough that the lock window is sub-second).

---

## Backfill Strategy

**Recommendation: keep the `DO $$` block INSIDE the migration (D-04 holds), with two refinements.**

### Refined SQL

```sql
-- =============================================================================
-- Backfill: recalcula is_client en TODOS los workspaces con config habilitada.
-- Ejecuta en la MISMA migration tras el CREATE OR REPLACE FUNCTION.
-- D-01: archivadas SI cuentan (no filtramos archived_at). Espeja behavior de
-- backfillIsClient en src/lib/domain/client-activation.ts:135-141.
-- =============================================================================
DO $$
DECLARE
  v_workspace_id UUID;
  v_stage_ids UUID[];
  v_reset_count INTEGER;
  v_set_count INTEGER;
BEGIN
  FOR v_workspace_id, v_stage_ids IN
    SELECT workspace_id, activation_stage_ids
    FROM client_activation_config
    WHERE enabled = true
      AND array_length(activation_stage_ids, 1) > 0
  LOOP
    -- 1) Reset all is_client=true contacts in this workspace
    UPDATE contacts
    SET is_client = false
    WHERE workspace_id = v_workspace_id
      AND is_client = true;
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    -- 2) Set true for contacts that have ≥1 order in activation stages
    WITH client_contact_ids AS (
      SELECT DISTINCT o.contact_id
      FROM orders o
      WHERE o.workspace_id = v_workspace_id
        AND o.contact_id IS NOT NULL
        AND o.stage_id = ANY(v_stage_ids)
    )
    UPDATE contacts c
    SET is_client = true
    FROM client_contact_ids cci
    WHERE c.id = cci.contact_id
      AND c.workspace_id = v_workspace_id
      AND c.is_client = false;
    GET DIAGNOSTICS v_set_count = ROW_COUNT;

    RAISE NOTICE 'client_activation backfill: workspace=% reset=% set=%',
      v_workspace_id, v_reset_count, v_set_count;
  END LOOP;
END $$;
```

### Refinements over the CONTEXT.md draft

1. **Filter `array_length > 0`** in the FOR loop — skips workspaces with empty `activation_stage_ids` (would otherwise reset everyone to false unnecessarily).
2. **`GET DIAGNOSTICS ROW_COUNT` + `RAISE NOTICE`** — gives the user per-workspace counts in the Supabase SQL Editor output. Critical for verifying Somnio's expected ~17,204 → ~recalculated number.
3. **Idempotent UPDATEs** — gated by `is_client = false` on the SET path so re-running the migration is cheap (no-ops on already-correct rows). The reset-to-false phase is gated by `is_client = true` so it skips already-false rows.
4. **Subquery returns DISTINCT contact_ids** — avoids `ON CONFLICT DO NOTHING` need.

### Why keep it INSIDE the migration (rather than a separate Node script)

- **Atomicity:** The trigger replacement and the backfill are logically one event. Splitting them creates a window where the new trigger is active but contacts are not yet recalculated — every order movement during that window would correctly mark NEW state but historic mismarks remain.
- **Regla 5 friendliness:** The user runs ONE SQL block in Supabase Editor, gets per-workspace NOTICE output, validates with the CONTEXT.md UAT SELECTs. No code push needed at all.
- **Safe scale:** Somnio is ~21K contacts. The two UPDATEs are bulk operations gated by partial conditions; total per-workspace runtime expected < 2 seconds. Even if the platform has 50 workspaces with config enabled, total < 90s — well within Postgres statement timeout. (Supabase default `statement_timeout` for `service_role` is unlimited; for `authenticated` it's 8s — but migrations run as superuser equivalent.)
- **Locking:** Each `UPDATE contacts WHERE workspace_id = X` only touches rows of that workspace. The CRM inbox does live-read `contacts` via Realtime, but the UPDATE is fast and Postgres uses MVCC — no read blocking. Realtime subscribers will receive a flurry of `is_client` change events; this is **expected and desired** (the inbox badge updates immediately).

### Alternative considered + rejected

A separate one-shot Node script invoking `backfillIsClient(workspaceId)` per workspace was considered. **Rejected** because:
- Requires a code push (Regla 5 then forces migration first → push → run script — three steps vs one).
- `backfillIsClient` resets ALL is_client=true rows in the workspace EVEN if the workspace's config is disabled; the SQL `DO $$` filters `WHERE enabled = true` upfront.
- No atomicity guarantee with the trigger replacement.

---

## Test Strategy

**State of testing for client-activation:** `src/lib/domain/__tests__/` directory does **NOT exist**. There are zero unit tests for `client-activation.ts` today. The codebase does have integration tests (`src/__tests__/integration/`) for `crm-bots/` and for `orders-cas` (which uses real Postgres).

### Recommended approach for the planner

**Three layers, in priority order:**

1. **Manual UAT (PRIMARY — matches CONTEXT.md verification SELECTs)**
   The 6 UAT scenarios already listed in CONTEXT.md (lines 144-151) are sufficient validation for a Postgres-trigger-only change. The user runs them in Supabase SQL Editor after applying the migration. Result is binary observable.

2. **Integration test against real Postgres (RECOMMENDED, optional)**
   Pattern reference: `src/__tests__/integration/orders-cas.test.ts` already tests Postgres triggers/RPCs with a real DB. A new `src/__tests__/integration/client-activation-trigger.test.ts` could cover:
   - INSERT to activator stage → contact `is_client` flips true
   - UPDATE non-activator → activator → flips true
   - UPDATE activator → non-activator with no other orders → flips false
   - UPDATE activator → non-activator with another activator order existing → stays true
   - UPDATE non-activator → non-activator → no change
   - UPDATE activator → activator (different stage in same set) → no change
   - INSERT outside activator → no change
   - Same-TX two-order updates of same contact → final state correct

   These map 1:1 to the UAT scenarios but automate them. Worth adding if the planner has bandwidth; not blocking.

3. **Unit tests with mocks — NOT RECOMMENDED**
   Mocking Postgres trigger semantics defeats the point. The trigger IS the unit under test. Skip.

### Test file location proposal

If the planner adds the integration suite: `src/__tests__/integration/client-activation-trigger.test.ts`. Mirror the structure of `orders-cas.test.ts` for fixture setup (real workspace + pipeline + stages + contact + orders, then assert on `contacts.is_client`).

---

## Migration Filename + Workflow

### Filename

**`supabase/migrations/20260428160000_client_activation_revoke.sql`**

- `20260428` matches today's date (2026-04-28, per env `currentDate`).
- `160000` is a 16:00 Bogota slot — chosen to NOT collide with the only existing 2026-04-28 migration `20260428000000_agent_audit_sessions.sql`.
- `client_activation_revoke` clearly identifies scope vs. the original `client_activation_badge` (2026-02-21).

### Workflow per Regla 5

This standalone is **migration-only — no code changes**. The Regla 5 gate is simpler than usual:

1. **Plan task: write migration file** — commit to repo (git add + commit) but DO NOT push yet.
2. **PAUSE — present migration to user** with the verification SQL pre-baked.
3. **User applies migration manually in Supabase SQL Editor** (production project).
4. **User confirms NOTICE output** (e.g., `client_activation backfill: workspace=a3843b3f-... reset=17204 set=14XXX`).
5. **User runs UAT SELECTs** (6 scenarios from CONTEXT.md lines 144-151).
6. **On SUCCESS: push the committed migration to git** (matches what's in prod).
7. **No `next dev` restart needed** — application code is unchanged.

**Critical Regla 5 nuance:** Because there is no code push that depends on this migration, the failure mode is bounded — if the migration breaks, only future stage transitions and the historic backfill are affected. The application code path (routing, webhook-processor, inbox) keeps reading `contacts.is_client` regardless. This is the SAFEST possible Regla 5 scenario.

### Idempotency

The migration is fully replayable:
- `CREATE OR REPLACE FUNCTION` — replaces previous body atomically.
- `CREATE INDEX IF NOT EXISTS idx_orders_contact_stage` — guard.
- `DO $$ ... LOOP ... UPDATE ... is_client = false WHERE is_client = true ... UPDATE ... is_client = false ...` — second run on already-correct data is no-op (`WHERE is_client = X` clauses).
- No `DROP TRIGGER` / `CREATE TRIGGER` — the existing trigger binding from 2026-02-21 remains valid because we only replace the function body.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recalculate is_client per workspace | New SQL function or Edge Function | The `DO $$` block already in this migration | Atomic with trigger swap; per-workspace gated by config |
| Manual `Cliente` tag cleanup | Cleanup script / migration | Leave historic `contact_tags` rows alone | Out of scope per CONTEXT.md; zero functional impact |
| Hook into `moveOrderToStage` to also flip is_client | Domain-layer wrapper | Postgres trigger does this | D-03: trigger is impossible to bypass (manual SQL, automation, agent, anything) |
| Cache invalidation for `isClient` fact | Cache-busting layer | None needed | RQ-5: facts are queried fresh per request (no cache) |
| Inngest event on is_client change | Custom event emitter | Skip — out of scope (CONTEXT.md NO-list) | If observability needed later, open separate standalone |
| Dispatching realtime updates manually | `pg_notify` calls in trigger | Existing `supabase_realtime` publication on `contacts` | Already added in 2026-02-21 migration line 121 |

---

## Common Pitfalls

### Pitfall 1: NULL stage_id breaking the boundary check

**What goes wrong:** If `OLD.stage_id` or `NEW.stage_id` is NULL (rare but possible during data import or pipeline reassignment), the `=` and `ANY` operators return NULL, not true/false. The IF `OLD.stage_id = NEW.stage_id` skip-guard then evaluates to NULL → branch not taken → trigger continues with possibly wrong logic.

**Fix in our trigger:** use `IS NOT DISTINCT FROM` for the stage equality check. The `= ANY(uuid[])` returns NULL with NULL stage_id — but in our IF `v_new_in_set THEN ... ELSIF v_old_in_set...` we treat NULL as false (boolean coalescing in IF), which is correct behavior (a NULL stage is NOT in the activator set).

**Warning sign:** orders with stage_id=NULL appearing in production. Run `SELECT COUNT(*) FROM orders WHERE stage_id IS NULL` post-deploy.

### Pitfall 2: Backfill DOes inside transaction with locks

**What goes wrong:** The migration runs inside an implicit transaction; the `DO $$` block UPDATEs ~21K Somnio contacts at once. Concurrent inbox reads via Realtime could see no rows momentarily if the UPDATE escalates to row-exclusive locks — but Postgres MVCC means readers see the PRE-update snapshot. **Net: no read blocking.**

**Real risk:** if the migration is replayed mid-traffic, the `RAISE NOTICE` lines flood the SQL Editor output. Cosmetic only.

**Mitigation:** apply the migration during a quieter traffic window (CONTEXT.md UAT timing already implies user observation, so user picks the window).

### Pitfall 3: Forgetting to drop the legacy `v_tag_id` DECLARE

**What goes wrong:** If you copy the new function body but leave the `v_tag_id UUID;` DECLARE, Postgres logs a warning about unused variables on `CREATE OR REPLACE`. Not breaking, but noisy.

**Fix:** the function body in this RESEARCH explicitly drops the DECLARE. Planner must mirror exactly.

### Pitfall 4: Two activator orders, one moved out, contact stays client (CORRECT)

**What goes wrong (false alarm):** Tester sees a contact with 2 orders in activator stages, moves one out, expects `is_client=false`. **It should stay true** — this is correct behavior per D-01 (≥1 active order = client). UAT scenario 5 in CONTEXT.md covers this.

**Documentation:** the planner's verify task should explicitly script this scenario to prevent the user from misinterpreting it as a bug.

### Pitfall 5: Realtime subscribers not notified on is_client flip

**What goes wrong:** the `supabase_realtime` publication for `contacts` was added in 2026-02-21 migration line 121. If for any reason that publication was dropped manually, the inbox badge won't update live.

**Fix:** the new migration does NOT need to re-add the publication; just add an idempotent guard at the end:

```sql
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
```

This is defensive — catches the case where a fresh dev DB doesn't have it.

### Pitfall 6: Manual UPDATE to `client_activation_config` does NOT trigger trigger

**What goes wrong:** Admin changes `activation_stage_ids` from `[A,B]` to `[A,C]`. Existing orders in stage B should now flip their contacts to false (if no other order in the new set). The trigger does NOT fire on `client_activation_config` UPDATE — only on `orders` UPDATE. The user must call `runClientBackfill()` manually (existing button from `client-activation-backfill` standalone) or update orders one-by-one.

**Mitigation already in place:** `updateClientActivation()` server action at `src/app/actions/client-activation.ts:65` calls `backfillIsClient(workspaceId)` automatically when `activation_stage_ids` or `enabled` changes. **No new code needed** — this was the fix shipped by the prior `client-activation-backfill` standalone.

### Pitfall 7: agent-lifecycle-router stale cache misconception

**What goes wrong (false alarm during code review):** Someone notices `src/lib/agents/routing/cache.ts` and worries that `is_client` flips don't take effect for 10s.

**Reality:** the LRU cache stores **rule definitions** only, NOT facts. Each request rebuilds the engine via `buildEngine(...)` (`src/lib/agents/routing/engine.ts:30`), which calls `registerFacts(engine, ctx)` (line 37), which registers `isClient` as a function that calls `getContactIsClient()` (`src/lib/agents/routing/facts.ts:187-194`) on every `engine.run()`. The cache.ts revalidation is for `routing_rules.updated_at`, not for facts. **Confirmed live read every routing call.**

---

## Code Examples

### Example 1: Verifying contact 3137549286 post-migration

```sql
-- Pre-migration: should show is_client=true (the bug)
SELECT phone, is_client, name FROM contacts WHERE phone = '3137549286';

-- Apply migration

-- Post-migration: should show is_client=false (assuming all of contact's orders left activator stages)
SELECT phone, is_client, name FROM contacts WHERE phone = '3137549286';

-- Audit: list this contact's orders and their stages
SELECT o.id, o.stage_id, ps.name AS stage_name,
       (o.stage_id = ANY((SELECT activation_stage_ids FROM client_activation_config WHERE workspace_id = o.workspace_id))) AS in_activator_set
FROM orders o
LEFT JOIN pipeline_stages ps ON ps.id = o.stage_id
WHERE o.contact_id = (SELECT id FROM contacts WHERE phone = '3137549286' LIMIT 1)
ORDER BY o.created_at DESC;
```

### Example 2: UAT scenario 5 — multi-order contact, move one out

```sql
-- Setup: pick a contact with 2 orders in activator stages
SELECT contact_id, COUNT(*) AS active_count
FROM orders o
JOIN client_activation_config cfg ON cfg.workspace_id = o.workspace_id
WHERE o.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND o.stage_id = ANY(cfg.activation_stage_ids)
  AND cfg.enabled = true
GROUP BY contact_id
HAVING COUNT(*) >= 2
LIMIT 1;
-- Note the contact_id (let's call it $TEST_CONTACT)

-- Verify is_client=true before
SELECT is_client FROM contacts WHERE id = '$TEST_CONTACT'; -- expect true

-- Move ONE order out of activator
UPDATE orders SET stage_id = '<some-non-activator-stage>'
WHERE contact_id = '$TEST_CONTACT'
  AND stage_id = ANY((SELECT activation_stage_ids FROM client_activation_config WHERE workspace_id = 'a3843b3f-...'))
LIMIT 1; -- careful: real test should target ONE specific order

-- Verify is_client STILL true (the other order still anchors)
SELECT is_client FROM contacts WHERE id = '$TEST_CONTACT'; -- expect TRUE
```

### Example 3: Routing fact lookup (read-only verification of RQ-5)

```typescript
// src/lib/agents/routing/facts.ts:187-194 — confirmed live DB read
engine.addFact('isClient', async () => {
  try {
    return await getContactIsClient(ctx.contactId, ctx.workspaceId)
  } catch (err) {
    console.error('[routing.facts] isClient failed:', err)
    return false
  }
})

// src/lib/domain/contacts.ts:672 — direct SELECT on contacts.is_client per call
export async function getContactIsClient(contactId: string, workspaceId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('is_client')
    .eq('workspace_id', workspaceId)
    .eq('id', contactId)
    .single()
  if (error || !data) return false
  return Boolean((data as { is_client: boolean | null }).is_client)
}
```

---

## Production Verification SQL Bundle

For Plan 01 task "post-deploy validation". Run AFTER applying the migration:

```sql
-- 1) Original bug case
SELECT phone, is_client FROM contacts WHERE phone = '3137549286';
-- Expected: is_client = false (assuming the contact's only order left the activator set;
-- if the contact has 0 orders linked entirely, also false)

-- 2) Sanity: count clients per workspace post-backfill
SELECT workspace_id,
       COUNT(*) FILTER (WHERE is_client = true) AS clients,
       COUNT(*) AS total_contacts
FROM contacts
WHERE workspace_id IN (SELECT workspace_id FROM client_activation_config WHERE enabled = true)
GROUP BY workspace_id;

-- 3) Cross-check: contacts marked client must have ≥1 order in activator stage
SELECT c.id, c.workspace_id, c.phone
FROM contacts c
WHERE c.is_client = true
  AND NOT EXISTS (
    SELECT 1 FROM orders o, client_activation_config cfg
    WHERE o.contact_id = c.id
      AND o.workspace_id = c.workspace_id
      AND cfg.workspace_id = c.workspace_id
      AND o.stage_id = ANY(cfg.activation_stage_ids)
  );
-- Expected: 0 rows (any rows = leftover bad data, indicates backfill missed something)

-- 4) Inverse: contacts with active orders in activator stage but is_client=false
SELECT DISTINCT c.id, c.workspace_id, c.phone
FROM contacts c
JOIN orders o ON o.contact_id = c.id
JOIN client_activation_config cfg ON cfg.workspace_id = c.workspace_id
WHERE c.is_client = false
  AND o.stage_id = ANY(cfg.activation_stage_ids)
  AND cfg.enabled = true;
-- Expected: 0 rows
```

If queries 3 or 4 return rows, the backfill missed cases — investigate before declaring success.

---

## Project Constraints (from CLAUDE.md)

| Rule | Application |
|------|-------------|
| **Regla 0** | Full GSD workflow: discuss → research (this file) → plan → execute → verify → LEARNINGS |
| **Regla 1** | NOT applicable (no code push expected — migration-only) |
| **Regla 2** | Bogota timezone: trigger uses `timezone('America/Bogota', NOW())` only if a created_at field were touched. Our trigger does not write timestamps directly. The `client_activation_config` table already has Bogota-aware defaults (lines 18-19 of original migration). |
| **Regla 3** | **EXEMPT** — Domain layer rule applies to application-layer mutations. The Postgres trigger IS the source of truth at DB level (D-03 explicitly chose trigger over domain). Document this exception in plan. |
| **Regla 4** | Documentation updates after merge: update `docs/analysis/04-estado-actual-plataforma.md` if it has a section on client-activation; add LEARNINGS entry covering the OUT branch + EXISTS pattern + dead-code Cliente tag finding. |
| **Regla 5** | **STRICT — apply migration in Supabase prod BEFORE any push.** No code dependency, but still: write migration file → commit → PAUSE → user applies → user validates → push. |
| **Regla 6** | NOT applicable (no production agent behavior change — `isClient` fact reads live DB and starts returning correct false instead of stale true; this is a bug fix, not a behavior swap). No feature flag needed per CONTEXT.md "NO agregar feature flag". |
| **agent-scope** | NOT applicable (no agent code changes). |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One-way `is_client` trigger (set true only) | Two-way trigger with IN/OUT branches + EXISTS check | This standalone | `agent-lifecycle-router` priority-900 rule now correctly routes returned/cancelled clients back to `somnio-sales-v3` instead of `somnio-recompra-v1` |
| `Cliente` tag insertion in trigger (case-sensitive 'Cliente') | Removed from trigger | This standalone | None — was dead code (zero consumers in `src/`) |
| Manual `runClientBackfill()` button only | Migration runs global backfill automatically + button still works | This standalone | One-click correction of historic mismarks during deploy |

**Deprecated/removed:**
- `auto_tag_cliente_on_ganado()` function — already removed in 2026-02-21 migration line 46. Already gone.
- `orders_auto_tag_cliente` trigger — already removed in 2026-02-21 migration line 45. Already gone.
- `SELECT t.id INTO v_tag_id ... INSERT INTO contact_tags` block in `mark_client_on_stage_change` — REMOVED in this standalone's migration.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Production has zero rows in `tags WHERE name='Cliente'` (or rows exist but no consumer cares) | RQ-1 / D-05 Resolution | LOW — even if rows exist, the planner's action is the same (drop trigger code, leave historic data). The user can run the verification SQL to close the loop with zero risk. |
| A2 | Postgres `READ COMMITTED` isolation handles concurrent OUT triggers correctly without explicit locks | RQ-2.c / Pitfall 4 | LOW — analysis shows worst-case final state matches reality due to MVCC + final-commit-wins on `UPDATE contacts`. Edge cases produce eventually-consistent correct state. If the user observes anomalies, follow-up standalone could add `SELECT FOR UPDATE` on the contact row. |
| A3 | `idx_orders_contact_stage` composite index is worth adding (vs. relying on existing `idx_orders_contact`) | Trigger SQL Pattern | VERY LOW — index is small (~5MB), creation is fast on Somnio scale, accelerates the EXISTS hot path. If skipped, the existing single-column index still functions; queries just scan a few extra rows per contact. |
| A4 | Somnio backfill runtime < 2 seconds per workspace | Backfill Strategy | LOW — based on 21,295 contacts and bulk UPDATE patterns observed in similar morfx migrations (e.g., `crm_archive_columns` ALTER + index). User can monitor NOTICE timing in SQL Editor. |
| A5 | No platform-level `statement_timeout` will interrupt the `DO $$` loop | Backfill Strategy | LOW — Supabase migrations run as `postgres` superuser equivalent (no timeout). Even if timeout is 5min, Somnio + 50 workspaces stays well under. |

---

## Open Questions

None — all RQ-1..RQ-7 resolved with HIGH/MEDIUM confidence. The single MEDIUM (RQ-1 prod confirmation) is non-blocking because the action is identical regardless of the answer.

---

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260221000000_client_activation_badge.sql` — current trigger function being replaced
- `supabase/migrations/20260203000001_crm_whatsapp_sync.sql:74-120` — origin of legacy `Cliente` tag insertion
- `src/lib/domain/client-activation.ts:115-181` — pattern reference for backfill semantics (no `archived_at` filter, batch-friendly)
- `src/lib/domain/contacts.ts:672-685` — `getContactIsClient` (the hot path the routing fact reads)
- `src/lib/agents/routing/facts.ts:187-194` — `isClient` fact resolver (live DB read)
- `src/lib/agents/routing/cache.ts:38-66` — proves cache stores rule definitions, not facts
- `src/lib/agents/routing/engine.ts:30-46` — proves engine + facts built per request
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx:127-131` — proves "Cliente" badge reads `showClientBadge` (i.e. `contacts.is_client`), not the `Cliente` tag
- `src/__tests__/integration/orders-cas.test.ts` — pattern reference for trigger integration testing
- `supabase/migrations/20260320100000_composite_indexes_orders_contacts.sql` — existing index inventory
- `supabase/migrations/20260422142336_crm_stage_integrity.sql:1-16` — pattern reference for migration header conventions, idempotency guards
- `.planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md:5-58` — D-15 priority-900 rule mechanics + Somnio volume snapshot (21,295 contacts / 17,204 clients)
- `.planning/standalone/client-activation-backfill/CONTEXT.md` — confirms `runClientBackfill()` UI already shipped (don't duplicate)

### Secondary (MEDIUM confidence)
- `rg "['\"]Cliente['\"]" src/` — exhaustive grep confirms zero tag consumers (only 3 unrelated string hits)
- Postgres official docs (PL/pgSQL trigger semantics, `IS NOT DISTINCT FROM`, `READ COMMITTED` MVCC) — applied via training knowledge cross-checked with morfx existing patterns

### Tertiary (LOW confidence)
- Production state of `tags` table (row count for `name='Cliente'`) — not directly queried in research; verification SQL provided for user to run

---

## Metadata

**Confidence breakdown:**
- D-05 resolution (legacy tag): HIGH for codebase, MEDIUM for prod data — resolved with single SQL check, action invariant
- Trigger SQL pattern: HIGH — validated against Postgres docs + existing morfx triggers
- Backfill strategy: HIGH — mirrors existing `backfillIsClient` semantics + adds atomicity
- Test strategy: HIGH — confirmed `client-activation.test.ts` does not exist; integration pattern available in `orders-cas.test.ts`
- Routing compatibility (RQ-5): HIGH — code-traced cache scope and per-request engine instantiation
- Migration filename + Regla 5 workflow: HIGH — pattern matches recent migrations, no code dependency simplifies gate

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days — stable Postgres semantics + morfx codebase patterns; refresh only if `client_activation_config` schema changes or trigger replaced again)
