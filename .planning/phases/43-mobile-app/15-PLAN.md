---
phase: 43-mobile-app
plan: 15
type: execute
wave: 8
depends_on: [5, 9]
files_modified:
  - apps/mobile/package.json
  - apps/mobile/src/lib/db/watermelon/schema.ts
  - apps/mobile/src/lib/db/watermelon/index.ts
  - apps/mobile/src/lib/db/watermelon/models/CachedConversation.ts
  - apps/mobile/src/lib/db/watermelon/models/CachedMessage.ts
  - apps/mobile/src/lib/db/watermelon/models/OutboxEntry.ts
  - apps/mobile/src/lib/db/watermelon/migrate-from-sqlite.ts
  - apps/mobile/src/lib/db/outbox.ts
  - apps/mobile/src/lib/db/conversations-cache.ts
  - apps/mobile/src/lib/db/messages-cache.ts
  - apps/mobile/eas.json
  - apps/mobile/README.md
autonomous: false
user_setup:
  - service: apple-developer
    why: "iOS development build for WatermelonDB native module requires Apple Developer Program membership"
    env_vars: []
    dashboard_config:
      - task: "Enroll in Apple Developer Program ($99 USD/year)"
        location: "developer.apple.com/programs"
      - task: "Generate APNs Authentication Key (optional — used later for iOS push activation)"
        location: "Apple Developer → Keys → Create Key → Apple Push Notifications service"
must_haves:
  truths:
    - "User has confirmed purchase of Apple Developer Program membership BEFORE this plan executes"
    - "WatermelonDB is installed and an iOS dev build is produced by EAS that the user can install on their iPhone"
    - "A one-shot migration reads every row from the existing expo-sqlite database and writes it into the new WatermelonDB database, inside ONE transaction per table, idempotent"
    - "After migration, outbox.ts and the conversations/messages cache helpers re-export WatermelonDB-backed implementations with the EXACT same function signatures — NO consumer (Plan 07/08/09/10) needs to change"
    - "On first launch post-migration, the old sqlite db is renamed to morfx.db.legacy (not deleted) so rollback is possible"
    - "Plan 09 offline-queue behavior is preserved (UI write + outbox share a transaction, idempotency_key unique, drain on online/active)"
  artifacts:
    - apps/mobile/src/lib/db/watermelon/schema.ts
    - apps/mobile/src/lib/db/watermelon/migrate-from-sqlite.ts
  key_links:
    - "This plan is GATED on the user confirming they have purchased Apple Developer Program"
    - "Once this plan ships, iOS is no longer in Expo Go — all iOS testing is via EAS dev builds"
---

<objective>
**Phase B storage migration.** Per Research Open Question #5, we started Phase A on raw `expo-sqlite` so iOS could run in Expo Go during v1 MVP development ($0 budget). Once the user has acquired Apple Developer Program membership, this plan migrates to WatermelonDB — the durable long-term choice — and switches iOS to EAS dev builds.

This plan is GATED: it does NOT execute until the user explicitly confirms they have purchased Apple Developer Program ($99 USD/year). If called earlier, pause and wait.

Output: WatermelonDB schema + models + sync primitives, a one-shot migration from expo-sqlite, updated build profiles for iOS dev build, and a repo README update documenting the new iOS workflow.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@.planning/phases/43-mobile-app/43-05-SUMMARY.md
</context>

<tasks>

<task type="checkpoint:decision">
  <name>Task 1: GATE — confirm Apple Developer purchase</name>
  <files>n/a</files>
  <action>STOP. Ask the user:
  "Have you purchased the Apple Developer Program membership ($99 USD/year) and do you want to switch iOS from Expo Go to EAS dev builds now?"

  Options:
  - YES → proceed with Task 2
  - NO → DO NOT proceed. Explain: "Phase A (expo-sqlite) continues to work for both devices. When you're ready, re-run this plan."
  - NOT SURE → explain the tradeoffs: Phase A keeps $0 spend and iOS in Expo Go but uses raw sqlite. Phase B adds WatermelonDB (better at scale) but requires the $99 + iOS dev builds from now on.

  Do NOT proceed without explicit YES.</action>
  <verify>User confirms YES.</verify>
  <done>Gate passed.</done>
</task>

<task type="auto">
  <name>Task 2: Install WatermelonDB, define schema + models, update eas.json for iOS dev build</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/lib/db/watermelon/schema.ts
    apps/mobile/src/lib/db/watermelon/index.ts
    apps/mobile/src/lib/db/watermelon/models/CachedConversation.ts
    apps/mobile/src/lib/db/watermelon/models/CachedMessage.ts
    apps/mobile/src/lib/db/watermelon/models/OutboxEntry.ts
    apps/mobile/eas.json
  </files>
  <action>
  1. `npm install @nozbe/watermelondb` + its expo config plugin per the Supabase blog post "Offline-first React Native Apps with Expo, WatermelonDB, and Supabase" linked in 43-RESEARCH.md Sources.
  2. Add the Watermelon Babel plugin to `babel.config.js` per docs.
  3. Update `app.json` plugins array with the watermelon config plugin.
  4. `watermelon/schema.ts`: mirror the Phase A schema (cached_conversations, cached_messages, outbox, kv) as `appSchema({ version: 1, tables: [...] })`. Same columns, same unique on outbox.idempotency_key.
  5. Models in `models/*.ts`: one class per table extending `Model` with `@field` / `@date` decorators.
  6. `watermelon/index.ts`: initializes the `Database` with `SQLiteAdapter` (jsi: true, schema, dbName: 'morfx_watermelon'). Export a `getDb()` mirroring the Phase A API.
  7. Add a new `eas.json` profile `development-ios` that targets iOS and uses EAS credentials (requires the user to authenticate with Apple inside `eas credentials` once).</action>
  <verify>`npx tsc --noEmit` passes. `npx expo-doctor` passes.</verify>
  <done>Watermelon installed + schema + models exist. eas.json has an iOS dev profile.</done>
</task>

<task type="auto">
  <name>Task 3: One-shot migration from expo-sqlite → WatermelonDB + rewire consumers</name>
  <files>
    apps/mobile/src/lib/db/watermelon/migrate-from-sqlite.ts
    apps/mobile/src/lib/db/outbox.ts
    apps/mobile/src/lib/db/conversations-cache.ts
    apps/mobile/src/lib/db/messages-cache.ts
  </files>
  <action>
  1. `migrate-from-sqlite.ts`: export `migrateSqliteToWatermelon()` that:
     - Checks a kv flag `migration.watermelon.done`. If set, returns immediately.
     - Opens the old `morfx.db` via expo-sqlite.
     - For each table (cached_conversations, cached_messages, outbox, kv), reads all rows and writes them to the Watermelon database inside ONE `database.write(async () => { ... })` per table. Uses the idempotency_key from outbox to dedupe.
     - On success, renames the sqlite file from `morfx.db` to `morfx.db.legacy` via `expo-file-system` (do NOT delete — keep for rollback).
     - Sets `migration.watermelon.done` = true in kv.
     - Call this function from `app/_layout.tsx` on app startup, BEFORE any cache read.
  2. Replace the internal implementations of `outbox.ts`, `conversations-cache.ts`, `messages-cache.ts` to call into the Watermelon DB instead of expo-sqlite. KEEP THE EXACT SAME EXPORTED FUNCTION SIGNATURES so consumers (Plans 07/08/09/10) do not need to change. Each function now:
     - Uses `database.get('outbox').query(...)` etc.
     - The enqueueOutboundMessage transaction uses `database.write(async () => { await messages.create(...); await outbox.create(...) })` — Watermelon treats this as atomic.
     - drainOutbox reads via `query.fetch()`, iterates, calls the same mobile API, updates the records.
  3. Update imports — the old schema.ts / migrations.ts files can remain as legacy or be removed (safer: keep them for the migration read path).</action>
  <verify>`npx tsc --noEmit` passes. All consumer files (hooks, components) should still import from the same paths and still compile.</verify>
  <done>Watermelon-backed cache + outbox ship with consumer-transparent API.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: Build + install iOS dev build, verify migration and full MVP still works</name>
  <files>apps/mobile/README.md</files>
  <action>
  1. Update `apps/mobile/README.md` with the new iOS workflow: Expo Go is no longer used; iOS testing now requires an EAS dev build. Include the commands to run.
  2. Have the user run `npx eas credentials` → Apple → generate provisioning profile + distribution certificate (one-time, interactive).
  3. Have the user run `npx eas build --profile development-ios --platform ios` → installs on the user's iPhone via TestFlight-internal OR direct install URL.
  4. Once installed, verify:
     - Existing account logs in
     - Migration runs once on first launch — log shows "migrated N rows to watermelon"
     - Inbox loads as before
     - Conversation + composer + CRM drawer + bot toggle all work
     - Send a message offline → enqueue, reconnect → sent
     - push_tokens row for ios now appears (IF `MOBILE_IOS_PUSH_ENABLED=true` has ALSO been set — otherwise iOS is still stubbed, which is fine; push activation is a separate decision)
     - The renamed `morfx.db.legacy` exists in the app file system
  5. Also re-test Android (rebuild via `eas build --profile preview --platform android`) — migration should run there too and nothing should break.
  6. If any regression, STOP and diagnose before marking done. Rollback path: delete `morfx.db.legacy` check and restore original outbox.ts if catastrophic.</action>
  <verify>User confirms both devices still work end-to-end, migration completed exactly once, no data lost.</verify>
  <done>Phase B storage migration complete.</done>
</task>

</tasks>

<verification>
- Gate: Apple Developer confirmed purchased
- WatermelonDB + config plugin installed
- Migration is idempotent (kv flag prevents re-run)
- Old sqlite file renamed, not deleted
- All consumer APIs (outbox.ts, conversations-cache.ts, messages-cache.ts) preserve their signatures — no edits to Plans 07/08/09/10 code
- iOS dev build produced via EAS and installed on the user's iPhone
- Android still works after migration
- Existing Android keystore is STILL the same fingerprint (verify with `eas credentials` — do NOT generate a new one for this build)
</verification>

<success_criteria>
The mobile app runs on WatermelonDB with full MVP feature set preserved. Migration from Phase A ran cleanly once with no data loss. iOS is out of Expo Go and onto EAS dev builds. Android still ships via the same keystore.
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-15-SUMMARY.md` with: gate decision timestamp, migration row counts (by table), iOS dev build URL, any rollback notes, confirmation that Android keystore fingerprint is unchanged.
</output>
