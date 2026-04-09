/**
 * Phase A implementation per 43-RESEARCH.md Open Question #5.
 * Plan 14 will migrate to WatermelonDB.
 *
 * Outbox pattern for reliable message sending on flaky mobile networks.
 *
 * Core invariants:
 *  1. enqueueOutboundMessage inserts BOTH the cached_messages row and the
 *     outbox row in a single db.withTransactionAsync — the UI never sees a
 *     queued row without a matching outbox entry, and vice versa (ACID).
 *  2. Every outbound message has a stable idempotency_key generated on the
 *     client (Crypto.randomUUID) so server-side dedupe is possible even
 *     across retries, app restarts, and network flips.
 *  3. drainOutbox() is mutex-protected at the module level: only one drain
 *     loop runs at a time per JS process, preventing double-sends when
 *     NetInfo "online" and AppState "active" fire back-to-back.
 *  4. drainOutbox() does NOT loop internally. Caller re-invokes after a
 *     backoff computed from last_attempt_at + attempts.
 *
 * Outbox row lifecycle:
 *
 *     enqueue           drain success             drain fatal (4xx)
 *   [cached:queued] ──────────────▶ [cached:sent]      ┌─▶ [cached:failed]
 *         +                          (outbox row         │   (outbox row
 *   [outbox row]                      DELETED)           │    DELETED)
 *         │                                              │
 *         └────────── drain transient (network / 5xx) ───┘ attempts++
 *                                                            last_error,
 *                                                            last_attempt_at
 */

import { randomUUID } from 'expo-crypto';
import { getDb } from './index';
import { updateMessageStatusByLocalId } from './messages-cache';

export interface EnqueueOutboundMessageInput {
  conversationId: string;
  workspaceId: string;
  body?: string | null;
  mediaUri?: string | null;
  mediaType?: string | null;
}

export interface EnqueueOutboundMessageResult {
  localId: string;
  idempotencyKey: string;
}

interface OutboxRow {
  id: string;
  message_id: string;
  idempotency_key: string;
  payload_json: string;
  attempts: number;
  last_attempt_at: number | null;
  last_error: string | null;
  created_at: number;
}

/**
 * Atomically insert a queued cached_messages row AND its outbox row. Both go
 * in under a single withTransactionAsync — if either statement throws, SQLite
 * rolls back both inserts so we never end up with half-committed state.
 */
export async function enqueueOutboundMessage(
  input: EnqueueOutboundMessageInput
): Promise<EnqueueOutboundMessageResult> {
  const db = await getDb();
  const localId = randomUUID();
  const idempotencyKey = randomUUID();
  const now = Date.now();

  const body = input.body ?? null;
  const mediaUri = input.mediaUri ?? null;
  const mediaType = input.mediaType ?? null;

  const payloadJson = JSON.stringify({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
    body,
    mediaUri,
    mediaType,
  });

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cached_messages (
         id, conversation_id, workspace_id, body, media_uri, media_type,
         direction, status, idempotency_key, server_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'out', 'queued', ?, NULL, ?, ?)`,
      [
        localId,
        input.conversationId,
        input.workspaceId,
        body,
        mediaUri,
        mediaType,
        idempotencyKey,
        now,
        now,
      ]
    );
    await db.runAsync(
      `INSERT INTO outbox (
         id, message_id, idempotency_key, payload_json, attempts,
         last_attempt_at, last_error, created_at
       ) VALUES (?, ?, ?, ?, 0, NULL, NULL, ?)`,
      [randomUUID(), localId, idempotencyKey, payloadJson, now]
    );
  });

  return { localId, idempotencyKey };
}

/**
 * Module-level mutex. A single JS process only ever has one drain in flight.
 * Protects against concurrent triggers (NetInfo online + AppState active) and
 * against the caller accidentally invoking drain from multiple hooks.
 */
let isDraining = false;

interface SendMessageResponse {
  id: string;
}

// Unrecoverable HTTP statuses — drop the outbox row and mark the cached
// message as failed so the UI can surface it. Anything else (network error,
// 5xx, 408/429) is treated as transient and retried with attempts++.
const FATAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Send one outbox row via the mobile API client. Kept as a standalone helper
 * so drainOutbox stays readable.
 *
 * The api-client module is lazy-imported to dodge any risk of circular
 * imports between db/ and the api client layer. Plan 43-04 shipped the real
 * client at ../api-client; this file now resolves it normally.
 */
async function postOutboxRow(row: OutboxRow): Promise<SendMessageResponse> {
  const payload = JSON.parse(row.payload_json) as {
    conversationId: string;
    workspaceId: string;
    body: string | null;
    mediaUri: string | null;
    mediaType: string | null;
  };

  // Lazy import to dodge potential circular deps between db/ and api-client.
  const { mobileApi } = await import('../api-client');

  return mobileApi.sendMessage({
    conversationId: payload.conversationId,
    body: payload.body,
    mediaUri: payload.mediaUri,
    mediaType: payload.mediaType,
    idempotencyKey: row.idempotency_key,
  });
}

/**
 * Attempt to send every queued outbox row, oldest-first.
 *
 * Does NOT loop internally — the caller (NetInfo listener, AppState listener,
 * or a send-triggered tick) re-invokes drain. Exponential backoff is computed
 * by the caller from last_attempt_at + attempts, not here.
 */
export async function drainOutbox(): Promise<void> {
  if (isDraining) return;
  isDraining = true;
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox ORDER BY created_at ASC`
    );

    for (const row of rows) {
      try {
        // Mark the cached message as in-flight so the UI can render a spinner.
        await updateMessageStatusByLocalId(row.message_id, 'sending');

        const resp = await postOutboxRow(row);

        // Success: record serverId, mark sent, drop outbox row.
        await updateMessageStatusByLocalId(row.message_id, 'sent', {
          serverId: resp.id,
        });
        await db.runAsync(`DELETE FROM outbox WHERE id = ?`, [row.id]);
      } catch (err) {
        const isHttp = err instanceof HttpError;
        const fatal = isHttp && FATAL_HTTP_STATUSES.has(err.status);
        const errMsg = err instanceof Error ? err.message : String(err);

        if (fatal) {
          await updateMessageStatusByLocalId(row.message_id, 'failed', {
            lastError: errMsg,
          });
          await db.runAsync(`DELETE FROM outbox WHERE id = ?`, [row.id]);
        } else {
          // Transient: bump attempts, keep row, caller will retry later.
          await db.runAsync(
            `UPDATE outbox
               SET attempts = attempts + 1,
                   last_attempt_at = ?,
                   last_error = ?
             WHERE id = ?`,
            [Date.now(), errMsg, row.id]
          );
          // Revert the cached message back to 'queued' so the UI doesn't get
          // stuck on a permanent spinner.
          await updateMessageStatusByLocalId(row.message_id, 'queued');
        }
      }
    }
  } finally {
    isDraining = false;
  }
}

/** Number of outbox rows still pending send (attempts >= 0). */
export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox`
  );
  return row?.c ?? 0;
}

/**
 * Count cached_messages rows marked failed. Failed rows are kept in
 * cached_messages (outbox row was deleted) so the UI can show a retry affordance.
 */
export async function getFailedCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM cached_messages WHERE status = 'failed'`
  );
  return row?.c ?? 0;
}

// Exported for tests that need to surface transport errors with a specific
// HTTP status code. Plan 09's api-client will throw HttpError for non-2xx.
export { HttpError };
