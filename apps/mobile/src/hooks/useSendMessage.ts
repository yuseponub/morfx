/**
 * useSendMessage — composer send entry points.
 *
 * Phase 43 Plan 09.
 *
 * Responsibilities:
 *   - `sendText(conversationId, body)`: optimistic enqueue + best-effort
 *     drain tick. Returns immediately so the UI can clear the input and
 *     paint the queued bubble with no awaited work.
 *   - `sendMedia(conversationId, localUri, mediaType, [mimeType, caption])`:
 *     same shape, but persists the local file URI into the outbox row so
 *     the drain loop owns the upload -> mediaKey -> POST chain.
 *
 * Design notes:
 *   - The hook is stateless on purpose — it is a set of callbacks that wrap
 *     `enqueueOutboundMessage` + `drainOutbox`. All durable state lives in
 *     sqlite (outbox + cached_messages). This avoids React state drift
 *     during rapid-fire sends and aligns with the Plan 05 ACID contract.
 *   - The drain tick is fire-and-forget (`void drainOutbox()`): if the UI
 *     still has a queued row after the tick resolves, the user sees a
 *     queued badge and the NetInfo / AppState listeners retry.
 *   - workspaceId is sourced from WorkspaceContext (Plan 06) at call time
 *     so switching workspaces mid-thread doesn't send messages to the
 *     wrong workspace.
 *   - No MorfX server call happens inside this hook — every network hit is
 *     owned by drainOutbox for uniform retry semantics.
 */

import { useCallback } from 'react';

import {
  drainOutbox,
  enqueueOutboundMessage,
  type OutboundMediaType,
} from '@/lib/db/outbox';
import { useWorkspace } from '@/lib/workspace/use-workspace';

export interface UseSendMessageResult {
  sendText: (conversationId: string, body: string) => Promise<string>;
  sendMedia: (
    conversationId: string,
    localUri: string,
    mediaType: OutboundMediaType,
    opts?: { mimeType?: string; caption?: string | null }
  ) => Promise<string>;
}

export function useSendMessage(): UseSendMessageResult {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const sendText = useCallback(
    async (conversationId: string, body: string): Promise<string> => {
      if (!workspaceId) {
        throw new Error('Sin workspace activo');
      }
      const trimmed = body.trim();
      if (!trimmed) {
        throw new Error('Mensaje vacio');
      }

      const { localId } = await enqueueOutboundMessage({
        conversationId,
        workspaceId,
        body: trimmed,
      });

      // Best-effort drain tick — doesn't block the UI return.
      void drainOutbox();

      return localId;
    },
    [workspaceId]
  );

  const sendMedia = useCallback(
    async (
      conversationId: string,
      localUri: string,
      mediaType: OutboundMediaType,
      opts?: { mimeType?: string; caption?: string | null }
    ): Promise<string> => {
      if (!workspaceId) {
        throw new Error('Sin workspace activo');
      }
      if (!localUri) {
        throw new Error('URI de archivo vacia');
      }

      const caption = opts?.caption ? opts.caption.trim() : null;

      const { localId } = await enqueueOutboundMessage({
        conversationId,
        workspaceId,
        body: caption && caption.length > 0 ? caption : null,
        mediaUri: localUri,
        mediaType,
        mediaMimeType: opts?.mimeType ?? null,
      });

      void drainOutbox();

      return localId;
    },
    [workspaceId]
  );

  return { sendText, sendMedia };
}
