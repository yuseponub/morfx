/**
 * Phase A local storage schema (expo-sqlite).
 *
 * Per 43-RESEARCH.md Open Question #5: we intentionally use raw expo-sqlite
 * instead of WatermelonDB for the first 2-4 weeks so iOS can run in Expo Go
 * (Pitfall 3 — prebuilt native modules only until Apple Developer account exists).
 * Plan 14 will migrate this module to WatermelonDB.
 *
 * Table contract:
 * - cached_conversations / cached_messages: read cache for inbox (Plan 07)
 * - outbox: durable send queue (Plan 09) — ACID paired with cached_messages insert
 * - kv: generic singleton key/value store (auth token expiry, last_sync_at, etc.)
 */

export const LATEST_SCHEMA_VERSION = 1;

/**
 * Migration 1: initial schema.
 *
 * All CREATEs are IF NOT EXISTS so re-running the migration (e.g. after a crash
 * between CREATE TABLE and PRAGMA user_version bump) is idempotent.
 *
 * Notes on schema choices:
 * - All timestamps are stored as INTEGER milliseconds since epoch (Date.now()).
 * - cached_messages.idempotency_key is NULLable for inbound messages but must be
 *   UNIQUE when present — SQLite supports partial unique indexes via WHERE clause.
 * - outbox.idempotency_key is NOT NULL UNIQUE (every outbound write has one).
 * - outbox.message_id references cached_messages(id) but we do NOT enable
 *   PRAGMA foreign_keys at open time; we enforce the relationship in app code.
 *   Reason: keeps migrations simple and lets us drop outbox rows without
 *   cascading surprises when a send finishes.
 */
export const MIGRATION_1_SQL = `
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
`;
