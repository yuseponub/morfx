---
phase: v4-media-audio-image
plan: 01
type: execute
wave: 0
depends_on: []
baseline_sha: "85092058e4495fc0e97ff0be2c6da582ca06c563"  # HEAD of exec/debounce-v2-wave6 at plan time; verified only .planning docs added since
files_modified:
  - supabase/migrations/<ts>_messages_transcription.sql
autonomous: false  # Regla 5 PAUSE — user applies migration in prod before any code push
requirements:
  - D-04   # Persistencia: solo transcript de audio
  - D-09   # Migración messages.transcription (Regla 5)
must_haves:
  truths:
    - "messages.transcription TEXT NULL exists in PROD before any Wave 1+ code is pushed"
    - "No backfill — existing audio rows keep transcription NULL (D-04 forward-looking)"
  artifacts:
    - path: "supabase/migrations/<ts>_messages_transcription.sql"
      provides: "ALTER TABLE messages ADD COLUMN transcription TEXT NULL"
      contains: "ADD COLUMN transcription"
  key_links:
    - from: "migration file"
      to: "PROD messages table"
      via: "user-applied SQL (Regla 5 pause)"
      pattern: "transcription TEXT"
---

<objective>
Create the `messages.transcription TEXT NULL` migration and PAUSE for the user to apply it
in production BEFORE any code that reads/writes the column is pushed (Regla 5 — the 20h-lost-
messages incident root cause was deploying code referencing a column that didn't exist in prod).

Purpose: D-04/D-09 — persist audio transcripts so the operator can see what the client said in
an audio (debug/audit), rendered under the inbox audio player (Wave 4).
Output: One additive, non-destructive migration. NO backfill (old audios stay NULL — acceptable
per D-04, the feature is forward-looking).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-media-audio-image/DISCUSSION-LOG.md
@.planning/standalone/v4-media-audio-image/RESEARCH.md

<facts>
- `messages` schema today: `media_url` / `media_mime_type` / `media_filename` exist, NO `transcription`.
  Evidence: `supabase/migrations/20260130000002_whatsapp_conversations.sql:71-73`; grep `transcription` in migrations = 0.
- Regla 5 (CLAUDE.md): migration MUST be applied in prod and confirmed by the user BEFORE pushing code
  that uses the column. This plan is the ONLY plan that touches the DB schema.
- D-04: only the audio transcript is persisted. Image descriptions are ephemeral (never persisted).
</facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write the migration file</name>
  <files>supabase/migrations/&lt;ts&gt;_messages_transcription.sql</files>
  <read_first>
    - `supabase/migrations/20260130000002_whatsapp_conversations.sql:46-82` (current messages columns — confirm `transcription` absent and pattern for ADD COLUMN style used in this repo).
    - List existing migration filenames to derive the next timestamp prefix: `ls supabase/migrations/ | tail -5`.
  </read_first>
  <action>
    Create `supabase/migrations/&lt;ts&gt;_messages_transcription.sql` where `&lt;ts&gt;` follows the
    repo's existing timestamp convention (e.g. `20260601HHMMSS`). Content (per D-09 / RESEARCH Wave 0):

    ```sql
    -- v4-media-audio-image (#3) — Wave 0 / D-09 / Regla 5
    -- Persist audio transcripts for somnio-sales-v4 (written via domain setMessageTranscription, Wave 1).
    -- Additive, non-destructive, NO backfill (D-04 forward-looking — old audios stay NULL).
    ALTER TABLE messages ADD COLUMN transcription TEXT NULL;
    ```

    NO index, NO NOT NULL, NO default, NO backfill — keep it minimal and non-blocking. Do NOT touch
    any other table or column. Do NOT add RLS changes (transcription is read via the same row the
    existing select('*') already returns).
  </action>
  <acceptance_criteria>
    - File exists at `supabase/migrations/&lt;ts&gt;_messages_transcription.sql` with the exact `ALTER TABLE messages ADD COLUMN transcription TEXT NULL;` statement.
    - `grep -c "ADD COLUMN transcription" supabase/migrations/&lt;ts&gt;_messages_transcription.sql` returns 1.
    - No `NOT NULL`, no `DEFAULT`, no backfill `UPDATE`, no other DDL in the file.
  </acceptance_criteria>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <what-built>
    The migration file `supabase/migrations/&lt;ts&gt;_messages_transcription.sql`
    (`ALTER TABLE messages ADD COLUMN transcription TEXT NULL;`).
  </what-built>
  <how-to-verify>
    REGLA 5 — APLICAR EN PROD ANTES DE CUALQUIER PUSH DE CÓDIGO (Waves 1-5).

    1. Open the Supabase SQL editor for the PROD project (or run via your prod migration tooling).
    2. Execute:
       `ALTER TABLE messages ADD COLUMN transcription TEXT NULL;`
    3. Confirm the column exists:
       `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name='messages' AND column_name='transcription';`
       Expected: one row, `text`, `YES`.
    4. NO backfill needed (D-04).

    Until you confirm this is applied in prod, DO NOT push any of Waves 1-5
    (they read/write `messages.transcription` — pushing before the column exists
    reproduces the 20h incident, Regla 5 / Pitfall 3).
  </how-to-verify>
  <resume-signal>Type "migración aplicada en prod" once the column exists in production, or describe any error.</resume-signal>
</task>

</tasks>

<verification>
- Migration file present and minimal (1 ADD COLUMN, no backfill).
- User has confirmed the column exists in PROD (`information_schema.columns` shows it).
- Regla 5 satisfied: no code touching `transcription` has been pushed yet.
</verification>

<success_criteria>
- `messages.transcription TEXT NULL` exists in production, confirmed by the user.
- The migration file is committed but NO Wave 1+ code is pushed until the pause is cleared.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-media-audio-image/01-SUMMARY.md` noting:
the migration filename/timestamp, the exact SQL, and the user's confirmation that it is applied
in prod (with the timestamp of confirmation).
</output>
