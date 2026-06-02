---
phase: 43-mobile-app
plan: 12
type: execute
wave: 6
depends_on: [3, 7]
files_modified:
  - supabase/migrations/20260410_messages_fts.sql
  - src/app/api/mobile/search/route.ts
  - shared/mobile-api/schemas.ts
  - apps/mobile/src/hooks/useMessageSearch.ts
  - apps/mobile/src/components/search/SearchBar.tsx
  - apps/mobile/src/components/search/SearchResultRow.tsx
  - apps/mobile/app/(tabs)/inbox.tsx
  - apps/mobile/src/lib/i18n/es.json
  - .planning/phases/43-mobile-app/SEARCH-MEASUREMENT.md
autonomous: false
must_haves:
  truths:
    - "A migration adds a generated tsvector column `fts` on messages using `to_tsvector('spanish', coalesce(body, ''))` with a GIN index"
    - "Migration is applied to production BEFORE the search endpoint code ships (Regla 5)"
    - "GET /api/mobile/search?q=... returns up to 50 results, each row with: conversation_id, contact_name, message_body snippet (highlighted), created_at"
    - "Search matches both contact name AND message body — per 43-CONTEXT.md 'Search by contact name AND by message content'"
    - "Mobile inbox gains a search bar at the top; tapping it expands a full-screen search UI"
    - "A measurement task runs against seeded realistic data and records p50/p95 latency in SEARCH-MEASUREMENT.md with an explicit escalation criterion (>500ms p95 → escalate to Meilisearch/Typesense in a follow-up phase)"
  artifacts:
    - supabase/migrations/20260410_messages_fts.sql
    - src/app/api/mobile/search/route.ts
    - .planning/phases/43-mobile-app/SEARCH-MEASUREMENT.md
  key_links:
    - "Open Question #1 is settled in this plan via measurement not hand-waving"
---

<objective>
Ship message search. Per Research Open Question #1, decision is **Postgres FTS** as the default path. This plan adds the migration, the endpoint, the mobile UI, AND a measurement task that proves or disproves the hypothesis on realistic data.

Output: FTS column + index, search endpoint, mobile search UI, recorded measurement + escalation criterion.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write + ship FTS migration</name>
  <files>
    supabase/migrations/20260410_messages_fts.sql
  </files>
  <action>Create the migration:
  ```
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(body, ''))) STORED;
  CREATE INDEX IF NOT EXISTS messages_fts_idx ON messages USING GIN (fts);
  -- also index body for contact-name join fast path:
  CREATE INDEX IF NOT EXISTS messages_workspace_created_idx ON messages (workspace_id, created_at DESC);
  ```
  Backfill is automatic (GENERATED ALWAYS populates existing rows on next SELECT — no, actually STORED means it runs at write time; existing rows will be null until touched). Add a backfill statement:
  ```
  UPDATE messages SET body = body WHERE fts IS NULL;
  ```
  (self-write to trigger the generated column — acceptable because it's idempotent and one-time).
  
  Per Regla 5, pause after writing the file and ask the user to apply this migration in production before continuing.</action>
  <verify>Migration file exists and is idempotent.</verify>
  <done>File exists.</done>
</task>

<task type="checkpoint:human-action">
  <name>Task 2: User applies FTS migration to production</name>
  <files>n/a</files>
  <action>STOP. Ask user to apply `supabase/migrations/20260410_messages_fts.sql` in production. The backfill UPDATE may take time on large workspaces — warn user that it rewrites every message row once. Wait for explicit confirmation.</action>
  <verify>User confirms.</verify>
  <done>Production has fts column + GIN index + backfill done.</done>
</task>

<task type="auto">
  <name>Task 3: Search endpoint + mobile UI + measurement doc</name>
  <files>
    src/app/api/mobile/search/route.ts
    shared/mobile-api/schemas.ts
    apps/mobile/src/hooks/useMessageSearch.ts
    apps/mobile/src/components/search/SearchBar.tsx
    apps/mobile/src/components/search/SearchResultRow.tsx
    apps/mobile/app/(tabs)/inbox.tsx
    apps/mobile/src/lib/i18n/es.json
    .planning/phases/43-mobile-app/SEARCH-MEASUREMENT.md
  </files>
  <action>
  1. Extend schemas: `SearchResultSchema` = `{ message_id, conversation_id, contact_name, contact_phone, snippet, created_at }`, `SearchResponseSchema` = `{ results: [] }`.
  2. `src/app/api/mobile/search/route.ts` GET:
     - Auth + workspaceId.
     - Query param `q` (min 2 chars).
     - Runs TWO queries in parallel:
       a) Message FTS: `SELECT m.id, m.conversation_id, m.body, m.created_at, c.id as contact_id, ct.name as contact_name, ct.phone as contact_phone FROM messages m JOIN conversations c ON c.id = m.conversation_id LEFT JOIN contacts ct ON ct.id = c.contact_id WHERE m.workspace_id = $1 AND m.fts @@ websearch_to_tsquery('spanish', $2) ORDER BY m.created_at DESC LIMIT 30`.
       b) Contact name ILIKE: a simpler query for matching contact name — `WHERE ct.name ILIKE $query OR ct.phone ILIKE $query LIMIT 20` returning the latest conversation per contact.
     - Merges + dedupes + sorts by created_at DESC.
     - Response includes a `snippet` field built from `ts_headline('spanish', body, websearch_to_tsquery(...))` for highlight.
  3. `useMessageSearch.ts` hook with debounce (300ms) — exposes `{ query, setQuery, results, loading, clear }`.
  4. `SearchBar.tsx`: top row with a TextInput + clear button. Tapping it pushes a full-screen search overlay that renders `<SearchResultRow>` items. Tapping a result navigates to `/chat/[id]` (could also scroll to the message, but that's nice-to-have).
  5. `SearchResultRow.tsx`: contact name (bold), phone (muted), snippet with matched term highlighted (render the highlighted snippet — ts_headline uses `<b>` tags; strip/replace with styled Text spans), timestamp.
  6. Wire `<SearchBar>` at the top of `(tabs)/inbox.tsx`, above the FlashList.
  7. i18n keys: `search.placeholder`, `search.no_results`, `search.min_chars`.
  8. `.planning/phases/43-mobile-app/SEARCH-MEASUREMENT.md` — create a document with:
     - Seed plan: instructions to insert ~50k synthetic messages into a dev workspace (SQL snippet with `generate_series`)
     - Measurement commands: use `EXPLAIN ANALYZE` for 5 representative queries and record the execution time
     - Table to fill: query, p50, p95, result count, pass/fail
     - Escalation criterion: "If p95 > 500ms on a workspace with 50k+ messages, create a follow-up phase for Meilisearch/Typesense. Until then, Postgres FTS stays."
     - Leave fields blank — user will run the measurements and fill them after the migration is applied.
  </action>
  <verify>`npm run build` passes. curl search endpoint returns results.</verify>
  <done>Search endpoint + UI + measurement doc exist.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: Run the measurement and verify mobile search UX</name>
  <files>.planning/phases/43-mobile-app/SEARCH-MEASUREMENT.md</files>
  <action>
  1. Ask user to seed 50k messages in a dev workspace using the SQL snippet in SEARCH-MEASUREMENT.md.
  2. Run the 5 EXPLAIN ANALYZE queries listed and fill in the table.
  3. If any p95 > 500ms, CREATE a new phase-gaps entry documenting the Meilisearch escalation. If all pass, record "PASS — Postgres FTS is adequate."
  4. On both mobile devices: search for a contact name → get results. Search for a word from a message body → get results with highlighted snippet. Tap result → navigates to conversation.
  
  Fix bugs before marking done.</action>
  <verify>SEARCH-MEASUREMENT.md has filled-in numbers + pass/fail decision. User confirms mobile search works on both devices.</verify>
  <done>Search shipped + measurement recorded.</done>
</task>

</tasks>

<verification>
- FTS migration applied to production BEFORE search endpoint code ships
- Endpoint queries both messages.fts and contacts.name
- Measurement doc has real numbers, not hand-waving
- Escalation criterion is concrete (p95 > 500ms)
</verification>

<success_criteria>
User can search by contact name or message content from the mobile inbox and see highlighted results in <500ms on realistic data.
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-12-SUMMARY.md` with: migration applied confirmation, measurement results table (copy from SEARCH-MEASUREMENT.md), decision (Postgres FTS pass or escalate).
</output>
