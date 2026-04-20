/**
 * Phase A implementation per 43-RESEARCH.md Open Question #5.
 * Plan 14 will migrate to WatermelonDB.
 *
 * CRUD helpers for cached_conversations + generic kv store.
 *
 * Multi-workspace safety: every query against cached_conversations filters by
 * workspace_id (Pitfall in MEMORY.md — "Multi-workspace safety:
 * workspace_members .single() MUST filter by workspace_id"). The kv table is
 * a process-wide singleton store and does NOT filter by workspace — callers
 * are expected to namespace keys themselves (e.g. `auth.token.${workspaceId}`).
 */

import { getDb } from './index';

export type BotMode = 'on' | 'off' | 'muted';

export interface CachedConversation {
  id: string;
  workspaceId: string;
  contactName: string | null;
  contactPhone: string | null;
  lastMessageBody: string | null;
  lastMessageAt: number | null;
  lastCustomerMessageAt: number | null;
  unreadCount: number;
  tagsJson: string | null;
  pipelineStageId: string | null;
  botMode: BotMode | null;
  botMuteUntil: number | null;
  updatedAt: number;
}

interface CachedConversationRow {
  id: string;
  workspace_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message_body: string | null;
  last_message_at: number | null;
  last_customer_message_at: number | null;
  unread_count: number;
  tags_json: string | null;
  pipeline_stage_id: string | null;
  bot_mode: BotMode | null;
  bot_mute_until: number | null;
  updated_at: number;
}

function rowToConversation(row: CachedConversationRow): CachedConversation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    lastMessageBody: row.last_message_body,
    lastMessageAt: row.last_message_at,
    lastCustomerMessageAt: row.last_customer_message_at,
    unreadCount: row.unread_count,
    tagsJson: row.tags_json,
    pipelineStageId: row.pipeline_stage_id,
    botMode: row.bot_mode,
    botMuteUntil: row.bot_mute_until,
    updatedAt: row.updated_at,
  };
}

/**
 * Bulk upsert a batch of conversations for a given workspace. The caller
 * passes in the authoritative workspace_id — this function will OVERWRITE
 * workspace_id on each row so a misrouted server response can never poison
 * another workspace's cache.
 */
export async function upsertCachedConversations(
  workspaceId: string,
  conversations: CachedConversation[]
): Promise<void> {
  if (conversations.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const c of conversations) {
      await db.runAsync(
        `INSERT INTO cached_conversations (
           id, workspace_id, contact_name, contact_phone, last_message_body,
           last_message_at, last_customer_message_at, unread_count, tags_json,
           pipeline_stage_id, bot_mode, bot_mute_until, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           contact_name = excluded.contact_name,
           contact_phone = excluded.contact_phone,
           last_message_body = excluded.last_message_body,
           last_message_at = excluded.last_message_at,
           last_customer_message_at = excluded.last_customer_message_at,
           unread_count = excluded.unread_count,
           tags_json = excluded.tags_json,
           pipeline_stage_id = excluded.pipeline_stage_id,
           bot_mode = excluded.bot_mode,
           bot_mute_until = excluded.bot_mute_until,
           updated_at = excluded.updated_at`,
        [
          c.id,
          workspaceId,
          c.contactName,
          c.contactPhone,
          c.lastMessageBody,
          c.lastMessageAt,
          c.lastCustomerMessageAt,
          c.unreadCount,
          c.tagsJson,
          c.pipelineStageId,
          c.botMode,
          c.botMuteUntil,
          c.updatedAt,
        ]
      );
    }
  });
}

export async function listCachedConversations(
  workspaceId: string
): Promise<CachedConversation[]> {
  const db = await getDb();
  // Match the web + mobile API inbox order: `last_customer_message_at DESC
  // NULLS LAST` primary (so outbound-only traffic does NOT bump a thread to
  // the top), `last_message_at DESC NULLS LAST` as the tiebreaker, `id DESC`
  // as the final tiebreaker. The `last_customer_message_at` column was
  // already added to the cache schema in Plan 43-05 (migration 1) so no
  // schema bump is required here.
  const rows = await db.getAllAsync<CachedConversationRow>(
    `SELECT * FROM cached_conversations
     WHERE workspace_id = ?
     ORDER BY
       last_customer_message_at IS NULL,
       last_customer_message_at DESC,
       last_message_at IS NULL,
       last_message_at DESC,
       id DESC`,
    [workspaceId]
  );
  return rows.map(rowToConversation);
}

export async function getCachedConversation(
  id: string,
  workspaceId: string
): Promise<CachedConversation | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CachedConversationRow>(
    `SELECT * FROM cached_conversations
     WHERE id = ? AND workspace_id = ?`,
    [id, workspaceId]
  );
  return row ? rowToConversation(row) : null;
}

/**
 * Update the local three-state bot toggle (on / off / muted). When the user
 * picks 'muted', botMuteUntil carries the expiry timestamp. For 'on'/'off'
 * pass null so the cache does not hold a stale mute horizon.
 *
 * Server-side authoritative state lives in Phase 43-01's `conversations`
 * table (bot_mode + bot_mute_until). This cache row is an optimistic mirror
 * updated by the hook in Plan 43-11.
 */
export async function updateCachedConversationBotMode(
  id: string,
  workspaceId: string,
  mode: BotMode,
  muteUntil: number | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cached_conversations
       SET bot_mode = ?, bot_mute_until = ?, updated_at = ?
     WHERE id = ? AND workspace_id = ?`,
    [mode, muteUntil, Date.now(), id, workspaceId]
  );
}

/**
 * Optimistic local update of `unread_count` for one conversation.
 *
 * Called right after the mark-read POST succeeds so the inbox card reflects
 * the cleared badge without waiting for Realtime UPDATE (best-effort) or the
 * next foreground refetch.
 */
export async function updateCachedConversationUnread(
  id: string,
  workspaceId: string,
  unreadCount: number
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cached_conversations
       SET unread_count = ?, updated_at = ?
     WHERE id = ? AND workspace_id = ?`,
    [unreadCount, Date.now(), id, workspaceId]
  );
}

/* ------------------------------ kv singleton ------------------------------ */

export async function setKv(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [key, value, Date.now()]
  );
}

export async function getKv(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    `SELECT value FROM kv WHERE key = ?`,
    [key]
  );
  return row?.value ?? null;
}
