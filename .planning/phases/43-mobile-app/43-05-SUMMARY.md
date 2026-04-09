---
phase: 43-mobile-app
plan: 05
title: Mobile local storage foundation (expo-sqlite)
wave: 2
completed: 2026-04-09
requires: [43-02]
provides:
  - apps/mobile/src/lib/db local storage module
  - outbox pattern (transactional enqueue + mutex drain)
  - cached_conversations + cached_messages read cache
affects:
  - 43-07 (inbox cache read path)
  - 43-09 (send message outbox drain call site)
  - 43-11 (three-state bot mode local mirror)
  - 43-14 (WatermelonDB migration target)
subsystem: mobile/local-storage
tags: [expo-sqlite, outbox, offline, idempotency, phase-a]
tech-stack:
  added:
    - expo-sqlite ~16.0.10
    - expo-crypto ~15.0.8
  patterns:
    - outbox + idempotency_key
    - lazy singleton + memoized migration promise
    - module-level mutex for drain
key-files:
  created:
    - apps/mobile/src/lib/db/schema.ts
    - apps/mobile/src/lib/db/migrations.ts
    - apps/mobile/src/lib/db/index.ts
    - apps/mobile/src/lib/db/messages-cache.ts
    - apps/mobile/src/lib/db/outbox.ts
    - apps/mobile/src/lib/db/conversations-cache.ts
  modified:
    - apps/mobile/package.json
    - apps/mobile/package-lock.json
metrics:
  duration: ~25m
  completed: 2026-04-09
---

# Phase 43 Plan 05: Mobile local storage foundation Summary

One-liner: Phase A offline storage on raw expo-sqlite with a transactional
outbox (UI write + enqueue under a single ACID boundary), idempotent
`PRAGMA user_version` migrations, and workspace-scoped read cache for
conversations/messages — foundation for Plans 07/09/11 with a clean
migration path to WatermelonDB in Plan 14.

## Context

Plan 43-02 bootstrapped `apps/mobile/` on Expo SDK 54 with Expo Go as the
iOS dev loop. Until an Apple Developer account is purchased, we cannot run
a custom development build on iOS (Pitfall 3 in 43-RESEARCH.md). That rules
out WatermelonDB for now, because WatermelonDB requires a native module
outside Expo Go's prebuilt set. Open Question #5 in the research doc
recommends a two-phase approach: Phase A on raw `expo-sqlite` (in the
prebuilt set) for the first 2–4 weeks, then migrate to WatermelonDB in
Plan 14 once the Apple Developer fee is paid.

This plan ships Phase A.

## Schema

Full SQL (migration 1, bumps `PRAGMA user_version` from 0 → 1):

```sql
CREATE TABLE IF NOT EXISTS cached_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  last_message_body TEXT,
  last_message_at INTEGER,
  last_customer_message_at INTEGER,
  unread_count INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT,
  pipeline_stage_id TEXT,
  bot_mode TEXT,
  bot_mute_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_ws_last_msg
  ON cached_conversations(workspace_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS cached_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  body TEXT,
  media_uri TEXT,
  media_type TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  status TEXT NOT NULL CHECK (status IN ('sent','queued','sending','failed')),
  idempotency_key TEXT,
  server_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON cached_messages(conversation_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_idempotency_key
  ON cached_messages(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_attempts
  ON outbox(attempts, created_at);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL
);
```

Schema design notes:
- All timestamps stored as INTEGER ms since epoch.
- `cached_messages.idempotency_key` is nullable (inbound messages have none)
  but enforced UNIQUE when present via SQLite partial unique index.
- `outbox.idempotency_key` is NOT NULL UNIQUE — every outbound row has one.
- Foreign keys between outbox.message_id and cached_messages(id) are NOT
  enforced at the SQLite level (`PRAGMA foreign_keys` intentionally left
  off). The relationship is upheld in app code inside a single
  `withTransactionAsync` block.

## Migrations

`runMigrations(db)`:
1. Reads `PRAGMA user_version`.
2. If >= `LATEST_SCHEMA_VERSION` (1), returns immediately — fully idempotent.
3. Otherwise runs migration 1 DDL via `execAsync` (multi-statement safe)
   then bumps `PRAGMA user_version = 1` atomically.

Crash-safety: all CREATE statements use `IF NOT EXISTS`, so if the process
dies between the DDL and the version bump, re-running the migration is a
no-op and the version eventually gets set.

## Outbox state diagram

```
                        enqueueOutboundMessage
                                 │
                                 ▼
            ┌────────────────────────────────────┐
            │  cached_messages.status = 'queued' │
            │  outbox row exists (attempts = 0)  │
            └────────────────────────────────────┘
                                 │
                  drainOutbox()  │  (NetInfo online / AppState active)
                                 ▼
            ┌────────────────────────────────────┐
            │  cached_messages.status = 'sending'│
            │  POST /api/mobile/.../messages     │
            └────────────────────────────────────┘
                  │              │                 │
           2xx OK │       4xx    │         network │
                  │      fatal   │         or 5xx  │
                  ▼              ▼                 ▼
        ┌─────────────┐  ┌──────────────┐  ┌────────────────┐
        │ status=sent │  │ status=      │  │ status=queued  │
        │ server_id   │  │   failed     │  │ outbox.attempts│
        │ outbox      │  │ outbox       │  │   ++           │
        │   DELETED   │  │   DELETED    │  │ last_attempt_at│
        └─────────────┘  └──────────────┘  │ last_error     │
                                           └────────────────┘
                                                    │
                                                    │ caller re-invokes
                                                    │ drainOutbox() after
                                                    │ backoff
                                                    ▼
                                               (loop back)
```

Fatal HTTP statuses (drop outbox row, mark cached message failed):
`400, 401, 403, 404, 409, 422`.
Everything else — network errors, timeouts, 5xx, 408, 429 — is transient
and gets `attempts++`. The caller computes backoff from
`last_attempt_at + attempts`; `drainOutbox()` itself never sleeps and never
loops internally.

Mutex: module-level `isDraining` boolean inside a try/finally so concurrent
triggers (NetInfo online + AppState active fired back-to-back) can't
produce double-sends.

## Exported helpers

### `src/lib/db/index.ts`
- `getDb(): Promise<SQLiteDatabase>` — lazy singleton + memoized migration run
- `__resetDbForTests(): void` — test/dev escape hatch

### `src/lib/db/schema.ts`
- `LATEST_SCHEMA_VERSION: number`
- `MIGRATION_1_SQL: string`

### `src/lib/db/migrations.ts`
- `runMigrations(db: SQLiteDatabase): Promise<void>`

### `src/lib/db/messages-cache.ts`
- Types: `MessageDirection`, `MessageStatus`, `CachedMessage`,
  `UpdateMessageStatusExtras`
- `upsertCachedMessage(msg): Promise<void>`
- `listMessagesForConversation(conversationId): Promise<CachedMessage[]>`
- `updateMessageStatusByLocalId(localId, status, extras?): Promise<void>`
- `deleteMessageById(id): Promise<void>`

### `src/lib/db/outbox.ts`
- Types: `EnqueueOutboundMessageInput`, `EnqueueOutboundMessageResult`,
  `HttpError`
- `enqueueOutboundMessage(input): Promise<{ localId, idempotencyKey }>`
- `drainOutbox(): Promise<void>`
- `getPendingCount(): Promise<number>`
- `getFailedCount(): Promise<number>`

### `src/lib/db/conversations-cache.ts`
- Types: `BotMode`, `CachedConversation`
- `upsertCachedConversations(workspaceId, conversations): Promise<void>`
- `listCachedConversations(workspaceId): Promise<CachedConversation[]>`
- `getCachedConversation(id, workspaceId): Promise<CachedConversation | null>`
- `updateCachedConversationBotMode(id, workspaceId, mode, muteUntil): Promise<void>`
- `setKv(key, value): Promise<void>`
- `getKv(key): Promise<string | null>`

## Verification

- `cd apps/mobile && npx tsc --noEmit` — clean on all three task boundaries.
- Grep confirmation: every SELECT/UPDATE on `cached_conversations` includes
  `WHERE workspace_id = ?` (kv singleton exempt by design).
- Packages verified in `apps/mobile/package.json`:
  `"expo-sqlite": "~16.0.10"`, `"expo-crypto": "~15.0.8"` — both in Expo
  Go's prebuilt set per 43-RESEARCH.md lines 383 and 529, so iOS stays on
  Expo Go as required by Pitfall 3.
- Runtime verification (actually opening the db and seeing the
  `[db] user_version = 1` log) is intentionally NOT performed here; it
  happens in Plan 43-04 when the app entry imports the db module at
  startup. Migration idempotency is guaranteed by the `CREATE IF NOT EXISTS`
  + `user_version` guard in `runMigrations`.

## Deviations from Plan

None in behavior. Two minor implementation adjustments worth noting:

1. **[Rule 3 — blocking] Lazy import of `../api/client` has
   `@ts-expect-error`.** The plan suggested "lazy import … or stub it
   inline with a TODO". A plain dynamic `import('../api/client')` still
   fails `tsc --noEmit` at module-resolution time because TS resolves
   dynamic imports statically. Added a targeted `@ts-expect-error` comment
   on that single line with a TODO referencing Plan 43-09. Once 43-09 lands
   the real client, that comment will flip into an error on its own and
   force removal — the compiler enforces the cleanup.

2. **No inline `__DEV__` migration harness.** Plan suggested an optional
   dev-only harness that calls `runMigrations` twice and asserts
   `user_version === 1`. Opted instead for the documented path: migration
   idempotency is guaranteed by `CREATE IF NOT EXISTS` + the version-guard
   early-return in `runMigrations`, and runtime verification will happen
   naturally in Plan 43-04 when the db is imported at app startup. Keeping
   the module free of test-only code avoids a second surface that would
   need maintenance.

## Notes for downstream plans

- **Plan 43-04** (app entry wiring) should add `getDb()` to the root layout
  effect so migrations run at cold start and the `[db] user_version = 1`
  log appears once per launch. This also surfaces migration failures
  immediately instead of on first inbox render.
- **Plan 43-07** (inbox cache) consumes `listCachedConversations` +
  `upsertCachedConversations` + `listMessagesForConversation` +
  `upsertCachedMessage`.
- **Plan 43-09** (send message) consumes `enqueueOutboundMessage` +
  `drainOutbox` and provides the `src/lib/api/client.ts` module the
  dynamic import currently targets. Drain call sites:
  NetInfo `isInternetReachable` transition + AppState `active` transition +
  right after `enqueueOutboundMessage` returns (best-effort tick).
- **Plan 43-11** (three-state bot toggle) consumes
  `updateCachedConversationBotMode` as an optimistic local mirror of the
  server-side `conversations.bot_mode` / `bot_mute_until` columns shipped
  in Plan 43-01.
- **Plan 43-14** (WatermelonDB migration) replaces this entire module
  behind the same exported surface. If helper signatures hold stable,
  call-site churn is near zero.
