---
phase: 43-mobile-app
plan: 01
subsystem: database
tags: [postgres, supabase, enum, migration, conversations, bot-toggle, mobile]

# Dependency graph
requires:
  - phase: 42-session-lifecycle
    provides: "conversations table with agent_conversational tri-state column (baseline per-conversation bot toggle)"
provides:
  - "conversations.bot_mode enum column (on | off | muted) with default 'on'"
  - "conversations.bot_mute_until timestamptz column (nullable)"
  - "conversation_bot_mode Postgres enum type"
  - "CHECK constraint enforcing bot_mute_until requires bot_mode='muted'"
  - "Partial index idx_conversations_bot_muted for auto-resume worker"
affects: [43-mobile-app Plan 11 (mobile bot toggle three-state hook), future auto-resume worker, future consolidation cleanup of agent_conversational]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forward-only idempotent migrations (DO block + duplicate_object rescue)"
    - "Additive schema evolution: new columns coexist with legacy without rename/drop (full reversibility)"
    - "Partial index gated by enum value for cheap targeted scans"

key-files:
  created:
    - supabase/migrations/20260409000000_bot_mode_and_mute_until.sql
  modified: []

key-decisions:
  - "bot_mode is ADDITIVE and coexists with agent_conversational — not a rename. Consolidation deferred to later cleanup phase to preserve reversibility and avoid disrupting production agent runtime (Regla 6)."
  - "No rows backfilled: agent_conversational tri-state NULL/true/false does not map cleanly onto on/off/muted, and NULL='inherit workspace' is effectively 'on' from mobile perspective. Leaving default 'on' avoids silently muting/disabling rows."
  - "Storage as timestamptz (UTC). Display-side America/Bogota conversion happens in app layer per CLAUDE.md Regla 2."
  - "Partial index idx_conversations_bot_muted (WHERE bot_mode='muted') keeps the auto-resume worker scan cheap without bloating writes on the 99%+ non-muted rows."

patterns-established:
  - "Idempotent enum creation: DO block with EXCEPTION WHEN duplicate_object THEN NULL"
  - "Additive-only schema changes when legacy column semantics do not cleanly map to new model"

# Metrics
duration: ~15min (across two executors, including human-action checkpoint wait)
completed: 2026-04-09
---

# Phase 43 Plan 01: Bot Mode Three-State Migration Summary

**conversation_bot_mode enum + bot_mode/bot_mute_until columns on conversations table, additive alongside legacy agent_conversational, unblocking mobile three-state bot toggle**

## Performance

- **Tasks:** 3/3 complete
- **Files created:** 1 (migration)
- **Files modified:** 0
- **Rows backfilled:** 0 (no legacy boolean to map from)

## Accomplishments
- New Postgres enum type `conversation_bot_mode` with values `on`, `off`, `muted`
- `conversations.bot_mode conversation_bot_mode NOT NULL DEFAULT 'on'` column added
- `conversations.bot_mute_until timestamptz NULL` column added
- CHECK constraint `conversations_bot_mute_until_requires_muted` ensuring `bot_mute_until IS NULL OR bot_mode = 'muted'`
- Partial index `idx_conversations_bot_muted ON conversations (bot_mute_until) WHERE bot_mode = 'muted'`
- Column comments documenting semantics and the CHECK constraint relationship
- Migration applied to production and verified via information_schema SELECT

## Task Commits

1. **Task 1: Audit current conversations schema for bot toggle fields** — `a69fd97` (feat)
2. **Task 2: Write forward-only migration adding bot_mode enum + bot_mute_until timestamptz** — `a69fd97` (feat, same commit as Task 1)
3. **Task 3: User applies migration to production** — no commit (human-action checkpoint, verified 2026-04-09 via information_schema SELECT)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified

- `supabase/migrations/20260409000000_bot_mode_and_mute_until.sql` — Forward-only idempotent migration creating enum type, two columns, CHECK constraint, partial index, and column comments. Includes a detailed audit header documenting findings from Task 1 (no pre-existing `bot_enabled` column; legacy tri-state `agent_conversational` left intact).

## Audit Findings (Task 1)

Grep of `supabase/migrations/` and `src/`:

- **NO pre-existing `bot_enabled` boolean column on conversations.** The plan's backfill step was conditional ("if Task 1 found an existing boolean column") and is therefore skipped.
- Existing per-conversation bot toggle is `conversations.agent_conversational BOOLEAN DEFAULT NULL` (from `supabase/migrations/20260209000000_agent_production.sql`) with tri-state semantics:
  - `NULL` = inherit workspace setting
  - `true` = explicitly enabled
  - `false` = explicitly disabled
- Companion column `conversations.agent_crm BOOLEAN DEFAULT NULL` with identical tri-state semantics for the CRM agent subset.
- Workspace-level default lives in `workspace_agent_config.agent_enabled`.
- Web code paths that read/write `agent_conversational` today:
  - `src/app/(dashboard)/whatsapp/components/chat-header.tsx`
  - `src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx`
  - `src/app/(dashboard)/agentes/components/config-panel.tsx`
  - `src/app/actions/agent-config.ts`
  - `src/lib/agents/production/agent-config.ts`
  - `src/inngest/functions/agent-timers.ts`
  - `src/inngest/functions/agent-timers-v3.ts`

**Conclusion:** The new `bot_mode` column is purely additive. It coexists with `agent_conversational` and will be consolidated in a later cleanup phase once both the mobile app (Plan 11) and the web code paths migrate to the three-state model.

## Production Apply Confirmation

- **Applied:** 2026-04-09
- **Verification method:** User ran the following SELECT in the Supabase production SQL Editor:

  ```sql
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'conversations'
    AND column_name IN ('bot_mode', 'bot_mute_until');
  ```

- **Result:**

  | column_name    | data_type                | is_nullable |
  | -------------- | ------------------------ | ----------- |
  | bot_mode       | USER-DEFINED             | NO          |
  | bot_mute_until | timestamp with time zone | YES         |

  Both columns exist with the expected types (`USER-DEFINED` confirms the enum binding). CLAUDE.md Regla 5 satisfied: production schema has the migration before any application code referencing the new columns ships.

## Decisions Made

1. **Additive, not rename.** Keep `agent_conversational` intact so this migration is fully reversible and does not disrupt the production agent runtime (Regla 6 — protect agent in production). A future cleanup phase consolidates once mobile + web fully migrate.
2. **No backfill.** `agent_conversational` NULL/true/false does not map cleanly onto on/off/muted. NULL means "inherit workspace default", which is effectively "on" from the mobile app's perspective. Default `'on'` for all existing rows is the correct, least-surprising behavior.
3. **timestamptz for `bot_mute_until`.** Storage is UTC; display-side timezone conversion to America/Bogota happens in the application layer per CLAUDE.md Regla 2.
4. **Partial index gated by enum value.** `idx_conversations_bot_muted ... WHERE bot_mode = 'muted'` keeps the auto-resume worker scan cheap and keeps the index tiny since the overwhelming majority of conversations will not be in muted state at any given time.
5. **Idempotent migration.** Enum creation and CHECK constraint wrapped in `DO` blocks with `duplicate_object`/`duplicate_table` rescue so re-runs are safe (matches project convention for forward-only migrations).

## Deviations from Plan

### 1. Plan assumed a legacy `bot_enabled` column that did not exist

- **Found during:** Task 1 (audit)
- **Plan assumption:** Task 2 step 4 said "If Task 1 found an existing boolean column (e.g. `bot_enabled`) — backfill `bot_mode` from it: `UPDATE conversations SET bot_mode = CASE WHEN bot_enabled = false THEN 'off' ELSE 'on' END;` Otherwise skip backfill."
- **Actual finding:** No `bot_enabled` column exists. The closest legacy column is `agent_conversational` with tri-state NULL/true/false semantics that do NOT map cleanly onto on/off/muted.
- **Resolution:** Took the plan's "otherwise skip backfill" branch. Documented prominently in the migration file header and in this summary so later consolidation work knows why the new columns started life untethered from the legacy ones.
- **Impact:** None on runtime. All existing rows default to `bot_mode = 'on'`, which matches the pre-migration behavior (bot replies unless explicitly disabled via `agent_conversational`). `agent_conversational` is left untouched, so the production agent runtime continues to read its existing source of truth without any change.

### 2. Migration filename uses timestamp format `20260409000000_...` instead of `20260409_...`

- **Plan filename:** `supabase/migrations/20260409_bot_mode_and_mute_until.sql`
- **Actual filename:** `supabase/migrations/20260409000000_bot_mode_and_mute_until.sql`
- **Rationale:** Matches the Supabase CLI convention already used elsewhere in `supabase/migrations/` (14-digit `YYYYMMDDHHMMSS` timestamps). Purely cosmetic — same file, same SQL, same apply semantics.

### 3. Task 3 was a `checkpoint:human-action` that crossed executor boundaries

- **Context:** The previous executor stopped at Task 3 after committing Tasks 1+2 in a single commit `a69fd97`. The user applied the migration to production on 2026-04-09 and verified via `information_schema` SELECT. A second executor (this one) resumed, validated the confirmation, and created this SUMMARY + metadata commit.
- **Impact:** Expected continuation flow per `/gsd:execute-phase` checkpoint protocol. No rework or rollback needed.

---

**Total deviations:** 3 (1 audit-driven skip of a conditional backfill, 1 cosmetic filename, 1 expected continuation handoff)
**Impact on plan:** None on correctness. All deviations fall inside the plan's own conditional branches or project conventions.

## Issues Encountered

None. The audit cleanly resolved the only ambiguity in the plan (legacy column existence), and the migration applied without errors in production.

## User Setup Required

None — migration is live in production. Future plans that write to `bot_mode = 'muted'` must also set `bot_mute_until`; violating this throws on insert/update via the `conversations_bot_mute_until_requires_muted` CHECK constraint.

## Next Phase Readiness

- **Unblocks Plan 43-11:** Mobile bot toggle three-state hook can now read and write `bot_mode` / `bot_mute_until` on `conversations`.
- **Unblocks future auto-resume worker:** The partial index `idx_conversations_bot_muted` is ready for a periodic scan that flips `bot_mode` back to `'on'` when `bot_mute_until <= now()`.
- **Consolidation deferred:** A later cleanup phase should unify `agent_conversational` and `bot_mode` once all code paths (mobile + web inbox + agent-timers + agent-config server action + production agent-config reader) migrate to the three-state model. Until then, both columns coexist and the production agent runtime continues to honor `agent_conversational`.

---
*Phase: 43-mobile-app*
*Plan: 01*
*Completed: 2026-04-09*
