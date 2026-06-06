---
phase: godentist-fbig-meta-direct-cutover
plan: 06
type: execute
wave: 5
depends_on: [05]
files_modified:
  - supabase/migrations/
autonomous: false
requirements: [D-07, OQ-7, OQ-6, A2]
must_haves:
  truths:
    - "The manychat_pending_replies table is dropped (its only reader, the dynamic-reply route, was deleted in Plan 05)"
    - "The OPTIONAL provider-CHECK enum drop is a user decision; deferred by research recommendation"
  artifacts:
    - path: "supabase/migrations/{ts}_drop_manychat_pending_replies.sql"
      provides: "Drop the orphaned table"
      contains: "DROP TABLE"
  key_links:
    - from: "dynamic-reply route deleted (Plan 05)"
      to: "manychat_pending_replies orphaned"
      via: "no remaining reader"
      pattern: "manychat_pending_replies"
---

<objective>
BLOCK B — finalize the decommission with DB migrations (Regla 5 — apply in prod BEFORE deploy). Two parts:

1. **DROP `manychat_pending_replies`** (mandatory): its only reader (the dynamic-reply route) was deleted in Plan 05; RESEARCH A2 confirms no other reader/writer. A NEW migration drops it (do NOT edit the old migration file).

2. **OPTIONAL enum/CHECK drop (OQ-7) — DEFERRED by research recommendation.** Dropping `'manychat'` from the CHECK constraint on `messenger_provider`/`instagram_provider` + changing DEFAULT to `'meta_direct'` is COSMETIC. RESEARCH RECOMMENDS DEFER (the value is simply unused after Plan 04 re-point; the migration adds risk for no functional gain). This plan presents it as a user decision; the default is to DEFER. WhatsApp's `whatsapp_provider` CHECK is NEVER touched.

Regla 5: both migrations require the operator to apply in prod and confirm BEFORE the migration file is considered shipped. Precondition for the OPTIONAL part: `SELECT COUNT(*) FROM workspaces WHERE messenger_provider='manychat' OR instagram_provider='manychat'` = 0 (Plan 04) — else the new CHECK fails validation.

Purpose: remove the orphaned table; let the user decide on the cosmetic enum cleanup.
Output: drop-table migration applied; enum decision recorded.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md
@CLAUDE.md
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Create + apply the DROP manychat_pending_replies migration (Regla 5)</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md §Decommission Map + A2 (no other reader)
    - supabase/migrations/20260327150000_manychat_pending_replies.sql (the original CREATE — do NOT edit it)
    - CLAUDE.md Regla 5
  </read_first>
  <what-built>
    A NEW migration file dropping the orphaned table. The dynamic-reply route (its sole reader) was deleted in Plan 05; A2 confirms no writer in the codebase.
  </what-built>
  <how-to-verify>
    1. Confirm no code references the table: `grep -rln "manychat_pending_replies" src/` returns 0 (Plan 05 deleted the reader).
    2. Create `supabase/migrations/{YYYYMMDDHHMMSS}_drop_manychat_pending_replies.sql` with:
       ```sql
       -- Decommission ManyChat (standalone godentist-fbig-meta-direct-cutover, Plan 06).
       -- The only reader (src/app/api/manychat/dynamic-reply/route.ts) was deleted in Plan 05.
       -- RESEARCH A2: no remaining reader/writer in the codebase.
       DROP TABLE IF EXISTS manychat_pending_replies;
       ```
    3. Regla 5 — PAUSE: ask the operator to apply this migration in prod. After they confirm applied, verify:
       ```sql
       SELECT to_regclass('public.manychat_pending_replies'); -- Expected: NULL (table gone)
       ```
  </how-to-verify>
  <resume-signal>Type "table-dropped" once the operator confirms the migration is applied in prod and to_regclass returns NULL.</resume-signal>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 2: OPTIONAL — decide on the provider-CHECK enum drop (OQ-7, DEFERRED by default)</name>
  <read_first>
    - .planning/standalone/godentist-fbig-meta-direct-cutover/RESEARCH.md §OQ-7 + §MIGRATION (OQ-7) + Open Question 2
    - supabase/migrations/20260604120000_add_messenger_provider.sql (the CHECK constraint)
    - supabase/migrations/20260605120000_add_instagram_provider.sql (the CHECK constraint)
  </read_first>
  <decision>
    Drop `'manychat'` from the CHECK constraint on workspaces.messenger_provider + instagram_provider and change the DEFAULT to 'meta_direct'? RESEARCH recommends DEFER (cosmetic; the value is already unused after Plan 04; the migration adds risk for no functional gain). WhatsApp's whatsapp_provider CHECK is never touched.
  </decision>
  <context>
    Precondition for "apply now": no row on manychat (Plan 04 verified COUNT=0), else `ADD CONSTRAINT` fails validation. If applied, the migration (Regla 5 — apply in prod before deploy) is:
    ```sql
    -- OPTIONAL enum cleanup (OQ-7). Apply ONLY if user chooses "apply-now".
    ALTER TABLE workspaces DROP CONSTRAINT workspaces_messenger_provider_check;
    ALTER TABLE workspaces ADD  CONSTRAINT workspaces_messenger_provider_check
      CHECK (messenger_provider IN ('meta_direct'));
    ALTER TABLE workspaces ALTER COLUMN messenger_provider SET DEFAULT 'meta_direct';

    ALTER TABLE workspaces DROP CONSTRAINT workspaces_instagram_provider_check;
    ALTER TABLE workspaces ADD  CONSTRAINT workspaces_instagram_provider_check
      CHECK (instagram_provider IN ('meta_direct'));
    ALTER TABLE workspaces ALTER COLUMN instagram_provider SET DEFAULT 'meta_direct';
    -- whatsapp_provider CHECK UNTOUCHED (Regla 6).
    ```
    (Confirm the exact constraint names in prod first: `SELECT conname FROM pg_constraint WHERE conrelid='workspaces'::regclass AND conname LIKE '%provider%';`)
  </context>
  <options>
    <option id="defer">
      <name>DEFER (research recommendation, default)</name>
      <pros>Zero migration risk; the 'manychat' value is already unused; ManyChat is functionally gone</pros>
      <cons>The CHECK still lists 'manychat' as an allowed (but unused) value — cosmetic only</cons>
    </option>
    <option id="apply-now">
      <name>Apply the enum drop now</name>
      <pros>'manychat' fully removed from the schema (clean)</pros>
      <cons>Extra migration; must verify constraint names + COUNT=0 first; small risk for no functional gain</cons>
    </option>
  </options>
  <resume-signal>Select: "defer" (record as deferred — done) or "apply-now" (then create + apply the enum migration with the verified constraint names, Regla 5 PAUSE, and verify the new CHECK rejects 'manychat').</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| migration → prod schema | DDL applied to the live workspaces table |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cut-15 | Availability | Drop table with a live reader | mitigate | Reader deleted in Plan 05; grep + A2 confirm no reader before drop |
| T-cut-16 | Availability | ADD CHECK fails on remaining manychat row | mitigate | Precondition COUNT=0 (Plan 04) verified before the OPTIONAL enum drop |
| T-cut-17 | Availability | WhatsApp provider CHECK altered | mitigate | whatsapp_provider explicitly excluded from all DDL (Regla 6) |
</threat_model>

<verification>
- `to_regclass('public.manychat_pending_replies')` returns NULL (table dropped)
- `grep -rln "manychat_pending_replies" src/` returns 0
- If enum drop applied: `SELECT conname FROM pg_constraint WHERE conrelid='workspaces'::regclass AND conname LIKE '%provider%'` shows the new CHECK; whatsapp_provider CHECK unchanged
- If deferred: SUMMARY records the deferral with the un-defer SQL for later
</verification>

<success_criteria>
- manychat_pending_replies dropped in prod (Regla 5 confirmed).
- Enum drop decision recorded (defer = done; apply-now = applied + verified).
- WhatsApp schema untouched.
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-fbig-meta-direct-cutover/06-SUMMARY.md`
</output>
