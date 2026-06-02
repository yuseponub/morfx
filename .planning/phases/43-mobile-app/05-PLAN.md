---
phase: 43-mobile-app
plan: 05
type: execute
wave: 2
depends_on: [2]
files_modified:
  - apps/mobile/package.json
  - apps/mobile/src/lib/db/schema.ts
  - apps/mobile/src/lib/db/index.ts
  - apps/mobile/src/lib/db/outbox.ts
  - apps/mobile/src/lib/db/conversations-cache.ts
  - apps/mobile/src/lib/db/messages-cache.ts
  - apps/mobile/src/lib/db/migrations.ts
autonomous: true
must_haves:
  truths:
    - "expo-sqlite is the Phase A local storage engine (Expo Go compatible — survives iOS Expo Go constraint)"
    - "DB schema includes tables: cached_conversations, cached_messages, outbox, kv"
    - "outbox has a UNIQUE index on idempotency_key (prevents duplicate sends on retry)"
    - "UI writes to cached_messages + outbox insert happen inside a single transaction (ACID send-queue guarantee)"
    - "DB migrations are idempotent and run at app startup before any query"
    - "enqueueOutboundMessage() returns the local message id so the UI can render optimistically"
    - "drainOutbox() is exported and can be called on network online / AppState active"
  artifacts:
    - apps/mobile/src/lib/db/schema.ts
    - apps/mobile/src/lib/db/outbox.ts
    - apps/mobile/src/lib/db/index.ts
  key_links:
    - "Plan 09 (send message) and Plan 07 (inbox list) both read/write via this DB layer"
    - "Plan 14 (WatermelonDB migration, Phase B) replaces this layer AFTER user has Apple Developer account"
---

<objective>
Ship the Phase A local storage layer: raw `expo-sqlite` (in Expo Go's prebuilt set — see Research "What works $0 on iOS") with an outbox pattern and read cache for conversations/messages. This gives us a durable offline queue that survives OS kill without locking iOS out of Expo Go. WatermelonDB migration comes later in Plan 14 once the $99 Apple account is acquired.

Purpose: Research Open Question #5 ("WatermelonDB now vs later") is resolved as two-phase. Phase A (this plan) uses `expo-sqlite` directly so we can keep iOS in Expo Go. Phase B (Plan 14) migrates to WatermelonDB for scale.

Output: a working SQLite-backed cache + outbox module with ACID semantics, ready to be consumed by the send-message and inbox plans.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install expo-sqlite and expo-crypto, define schema + migrations</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/lib/db/schema.ts
    apps/mobile/src/lib/db/migrations.ts
    apps/mobile/src/lib/db/index.ts
  </files>
  <action>From `apps/mobile/`:
  1. `npx expo install expo-sqlite expo-crypto` — both are in Expo Go's prebuilt set.
  2. `src/lib/db/schema.ts`: define the schema as SQL strings.
     - `cached_conversations`: id TEXT PK, workspace_id TEXT, contact_name TEXT, contact_phone TEXT, last_message_body TEXT, last_message_at INTEGER, last_customer_message_at INTEGER, unread_count INTEGER DEFAULT 0, tags_json TEXT, pipeline_stage_id TEXT, bot_mode TEXT, bot_mute_until INTEGER, updated_at INTEGER
     - `cached_messages`: id TEXT PK, conversation_id TEXT, workspace_id TEXT, body TEXT, media_uri TEXT, media_type TEXT, direction TEXT ('in' | 'out'), status TEXT ('sent' | 'queued' | 'sending' | 'failed'), idempotency_key TEXT, server_id TEXT, created_at INTEGER, updated_at INTEGER
     - `outbox`: id TEXT PK, message_id TEXT NOT NULL REFERENCES cached_messages(id), idempotency_key TEXT NOT NULL UNIQUE, payload_json TEXT, attempts INTEGER DEFAULT 0, last_attempt_at INTEGER, last_error TEXT, created_at INTEGER
     - `kv`: key TEXT PK, value TEXT, updated_at INTEGER (for last-sync cursors, etc.)
     Indexes: `idx_messages_conv_created` on (conversation_id, created_at), `idx_outbox_attempts` on (attempts, created_at), unique on outbox.idempotency_key, unique on cached_messages.idempotency_key.
  3. `src/lib/db/migrations.ts`: export `runMigrations(db)` that reads the current `user_version` via `PRAGMA user_version`, runs each migration function in order, and bumps the version. Migration 1 = creates the initial tables above. This lets later plans add migrations without rewriting the schema.
  4. `src/lib/db/index.ts`: export a lazily-opened SQLite database singleton (`openDatabaseSync('morfx.db')`) and call `runMigrations` the first time it's opened. Export `getDb()` that returns the ready instance.</action>
  <verify>`npx tsc --noEmit` passes. Launching the app via Expo Go on iPhone + Android apk does not crash on startup (deferred to Task 4 verification in Plan 04 after the DB is imported).

  **Migration idempotency proof**: in a dev harness (temporary function wired to a dev button OR a Jest unit test if practical), call `runMigrations(db)` twice back-to-back. The second call MUST NOT error. After the second call, `PRAGMA user_version` MUST still equal 1 (not 2). Also `console.log('[db] user_version =', await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))` at startup in `index.ts` so every cold launch records the migration state in the Metro logs. Only mark done when the double-run test succeeds AND the startup log shows `user_version = 1`.</verify>
  <done>DB module exists, schema is defined, migrations run idempotently at startup.</done>
</task>

<task type="auto">
  <name>Task 2: Implement outbox enqueue + drain with transactional writes</name>
  <files>
    apps/mobile/src/lib/db/outbox.ts
    apps/mobile/src/lib/db/messages-cache.ts
  </files>
  <action>
  `src/lib/db/messages-cache.ts`: helpers to upsert a cached message, list messages for a conversation (ordered by created_at DESC), update message status by local id.

  `src/lib/db/outbox.ts`: export:
  - `enqueueOutboundMessage(input: { conversationId, body?, mediaUri?, mediaType? }): Promise<{ localId: string, idempotencyKey: string }>` — generates a UUID idempotency_key via `expo-crypto.randomUUID()`. Opens a SINGLE transaction (`db.withTransactionAsync`) that (a) inserts into cached_messages with status='queued', (b) inserts into outbox. Atomic guarantee per Research Pattern 2.
  - `drainOutbox(): Promise<void>` — with a module-level mutex (simple boolean lock), selects all outbox rows ordered by created_at ASC, for each: calls `mobileApi.post('/api/mobile/conversations/:id/messages', { body, mediaUri, idempotencyKey })` (endpoint shipped in Plan 09). On 2xx: update cached_messages status='sent', set server_id from response, delete from outbox. On network error: increment attempts, store last_error. On 4xx (unrecoverable): status='failed', delete from outbox, keep cached_message with status='failed' so UI can show. Use exponential backoff for retries (but do NOT loop — caller is responsible for re-invoking drain).
  - `getPendingCount()` returns the outbox row count.

  Crucially: import `mobileApi` lazily inside `drainOutbox` to avoid circular deps.

  Add a comment at the top: "Phase A implementation per 43-RESEARCH.md Open Question #5. Plan 14 will migrate this to WatermelonDB."</action>
  <verify>`npx tsc --noEmit` passes. A small inline dev test (a throwaway function) can enqueue a message, crash the import of api-client, and confirm the row exists in sqlite.</verify>
  <done>enqueueOutboundMessage is transactional; drainOutbox exists with retry + failure semantics; mutex prevents concurrent drains.</done>
</task>

<task type="auto">
  <name>Task 3: Implement conversations-cache helpers</name>
  <files>apps/mobile/src/lib/db/conversations-cache.ts</files>
  <action>
  `src/lib/db/conversations-cache.ts`: export
  - `upsertCachedConversations(workspaceId, conversations[])` — bulk upsert from a server fetch
  - `listCachedConversations(workspaceId)` — ordered by last_message_at DESC
  - `getCachedConversation(id)`
  - `updateCachedConversationBotMode(id, mode, muteUntil)` — writes locally for optimistic UI
  - `setKv(key, value)` / `getKv(key)` — small helper on the kv table

  All queries filter by `workspace_id` (matches the multi-workspace pattern from the web). Use `db.getAllAsync` and `db.runAsync` from expo-sqlite.</action>
  <verify>`npx tsc --noEmit` passes. Functions have explicit TS return types.</verify>
  <done>Conversations cache module exposes the helpers later plans need.</done>
</task>

</tasks>

<verification>
- expo-sqlite is the only storage engine; NO WatermelonDB, NO react-native-mmkv (Expo Go compatibility preserved)
- outbox insert + cached_messages insert share one transaction
- idempotency_key is UNIQUE in outbox
- drainOutbox has a mutex preventing concurrent runs
- All helpers filter by workspace_id
</verification>

<success_criteria>
Phase A local storage layer is ready to be consumed by Plan 07 (inbox) and Plan 09 (send message). Survives OS kill (ACID SQLite). iOS Expo Go still works (no native module added).
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-05-SUMMARY.md` with: schema SQL, migration version, outbox flow diagram in text, list of exported helpers.
</output>
