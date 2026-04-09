/**
 * Phase A implementation per 43-RESEARCH.md Open Question #5.
 * Plan 14 will migrate to WatermelonDB.
 *
 * CRUD helpers for the cached_messages table. All writes go through getDb()
 * so migrations are guaranteed to have run.
 */

import { getDb } from './index';

export type MessageDirection = 'in' | 'out';
export type MessageStatus = 'sent' | 'queued' | 'sending' | 'failed';

export interface CachedMessage {
  id: string;
  conversationId: string;
  workspaceId: string;
  body: string | null;
  mediaUri: string | null;
  mediaType: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  idempotencyKey: string | null;
  serverId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface CachedMessageRow {
  id: string;
  conversation_id: string;
  workspace_id: string;
  body: string | null;
  media_uri: string | null;
  media_type: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  idempotency_key: string | null;
  server_id: string | null;
  created_at: number;
  updated_at: number;
}

function rowToMessage(row: CachedMessageRow): CachedMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    workspaceId: row.workspace_id,
    body: row.body,
    mediaUri: row.media_uri,
    mediaType: row.media_type,
    direction: row.direction,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    serverId: row.server_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertCachedMessage(msg: CachedMessage): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO cached_messages (
       id, conversation_id, workspace_id, body, media_uri, media_type,
       direction, status, idempotency_key, server_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       conversation_id = excluded.conversation_id,
       workspace_id = excluded.workspace_id,
       body = excluded.body,
       media_uri = excluded.media_uri,
       media_type = excluded.media_type,
       direction = excluded.direction,
       status = excluded.status,
       idempotency_key = excluded.idempotency_key,
       server_id = excluded.server_id,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    [
      msg.id,
      msg.conversationId,
      msg.workspaceId,
      msg.body,
      msg.mediaUri,
      msg.mediaType,
      msg.direction,
      msg.status,
      msg.idempotencyKey,
      msg.serverId,
      msg.createdAt,
      msg.updatedAt,
    ]
  );
}

export async function listMessagesForConversation(
  conversationId: string
): Promise<CachedMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CachedMessageRow>(
    `SELECT * FROM cached_messages
     WHERE conversation_id = ?
     ORDER BY created_at DESC`,
    [conversationId]
  );
  return rows.map(rowToMessage);
}

export interface UpdateMessageStatusExtras {
  serverId?: string | null;
  lastError?: string | null;
}

export async function updateMessageStatusByLocalId(
  localId: string,
  status: MessageStatus,
  extras?: UpdateMessageStatusExtras
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  // Narrow path: the three writes we actually need — status only, status + serverId,
  // status + lastError. Keeps SQL predictable instead of dynamic column list.
  if (extras?.serverId !== undefined) {
    await db.runAsync(
      `UPDATE cached_messages
         SET status = ?, server_id = ?, updated_at = ?
       WHERE id = ?`,
      [status, extras.serverId, now, localId]
    );
    return;
  }
  if (extras?.lastError !== undefined) {
    await db.runAsync(
      `UPDATE cached_messages
         SET status = ?, updated_at = ?
       WHERE id = ?`,
      [status, now, localId]
    );
    return;
  }
  await db.runAsync(
    `UPDATE cached_messages
       SET status = ?, updated_at = ?
     WHERE id = ?`,
    [status, now, localId]
  );
}

export async function deleteMessageById(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM cached_messages WHERE id = ?`, [id]);
}
