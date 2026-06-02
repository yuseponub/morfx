---
phase: 43-mobile-app
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260409_bot_mode_and_mute_until.sql
autonomous: false
must_haves:
  truths:
    - "conversations.bot_mode is an enum-typed column with values on | off | muted and default 'on'"
    - "conversations.bot_mute_until is a nullable timestamptz"
    - "Existing rows have bot_mode='on' and bot_mute_until=NULL after backfill"
    - "Production database has the migration applied BEFORE any mobile code that references these columns ships"
  artifacts:
    - supabase/migrations/20260409_bot_mode_and_mute_until.sql
  key_links:
    - "Migration unblocks mobile Plan 11 (bot toggle three-state hook) and any web work that wants to show mute state"
---

<objective>
Introduce the three-state bot toggle schema (On / Off / Muted-for-duration) on the `conversations` table so the mobile app (and eventually the web) can persist the mute-until timestamp. This is a STANDALONE migration plan per CLAUDE.md Regla 5: the SQL must ship and be applied to production BEFORE any application code referencing the new columns is pushed.

Purpose: the current schema only supports a boolean-ish bot toggle (via existing `toggleConversationAgent`). Phase 43 requires a three-state model with a mute timestamp that auto-resumes. Research section Pattern 3 + Open Question #4 flagged this explicitly.

Output: one forward-only SQL migration file plus a human checkpoint confirming it's been applied to production.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit current conversations schema for bot toggle fields</name>
  <files>supabase/migrations/</files>
  <action>Use Grep on `supabase/migrations/` for "conversations" and for any existing `bot_` columns (e.g. `bot_enabled`, `agent_enabled`) to find the current representation. Also Grep `src/lib/domain/` and `src/app/(dashboard)/whatsapp/` for "bot_enabled", "agent_enabled", "toggleConversationAgent" to map the current web code path. Record findings in a short comment header inside the migration file you write in Task 2 so the executor of later plans knows what already existed.</action>
  <verify>Grep returns either the existing column name OR confirms there is none; findings written as a comment inside the new migration file.</verify>
  <done>You know the exact current column name (if any) and whether we are adding new columns or renaming. The migration file you write in Task 2 accounts for the current state.</done>
</task>

<task type="auto">
  <name>Task 2: Write forward-only migration adding bot_mode enum + bot_mute_until timestamptz</name>
  <files>supabase/migrations/20260409_bot_mode_and_mute_until.sql</files>
  <action>Create a new migration file. It MUST:
  1. Create a Postgres enum type `conversation_bot_mode` with values 'on', 'off', 'muted' (guarded with `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` so re-running is safe).
  2. `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_mode conversation_bot_mode NOT NULL DEFAULT 'on';`
  3. `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_mute_until timestamptz NULL;`
  4. If Task 1 found an existing boolean column (e.g. `bot_enabled`) — backfill `bot_mode` from it: `UPDATE conversations SET bot_mode = CASE WHEN bot_enabled = false THEN 'off' ELSE 'on' END;` Otherwise skip backfill.
  5. Add a CHECK constraint: `bot_mute_until IS NULL OR bot_mode = 'muted'` so muted state and the timestamp stay consistent.
  6. Add an index on `(bot_mode, bot_mute_until) WHERE bot_mode = 'muted'` for the auto-resume worker (future phase will read this).
  7. Do NOT drop the existing boolean column in this migration — leave it for a later cleanup phase so rollback is easy.
  All timestamp columns use `timestamptz`. Per CLAUDE.md Regla 2, display-side TZ conversion happens in JS, storage is UTC.</action>
  <verify>`grep -c "bot_mode" supabase/migrations/20260409_bot_mode_and_mute_until.sql` >= 3. `grep "CHECK" supabase/migrations/20260409_bot_mode_and_mute_until.sql` finds the mute consistency constraint. `grep "CREATE TYPE" supabase/migrations/20260409_bot_mode_and_mute_until.sql` present.</verify>
  <done>Migration file exists at the specified path, is idempotent, and does not reference any columns not present in current production.</done>
</task>

<task type="checkpoint:human-action">
  <name>Task 3: User applies migration to production</name>
  <files>n/a</files>
  <action>STOP. Print the full SQL content of `supabase/migrations/20260409_bot_mode_and_mute_until.sql` to the conversation. Ask the user to apply it to production via Supabase SQL Editor or `supabase db push`. Wait for explicit confirmation ("applied" or equivalent) before marking the plan complete. Per CLAUDE.md Regla 5, subsequent plans that reference `bot_mode` or `bot_mute_until` MUST NOT ship until this confirmation exists.</action>
  <verify>User explicitly confirms the migration ran successfully in production.</verify>
  <done>Production schema has `bot_mode` and `bot_mute_until` columns with the default + check constraint. Confirmed by the user.</done>
</task>

</tasks>

<verification>
- Migration file is idempotent (safe to re-run)
- No application code in this plan references the new columns (app code comes in Plan 11)
- User confirmation of production apply is captured before the plan is marked done
</verification>

<success_criteria>
Production `conversations` table has `bot_mode conversation_bot_mode NOT NULL DEFAULT 'on'` and `bot_mute_until timestamptz NULL` with the CHECK constraint. User has confirmed this.
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-01-SUMMARY.md` with: migration file path, columns added, production-apply confirmation timestamp from the user, any rows backfilled.
</output>
