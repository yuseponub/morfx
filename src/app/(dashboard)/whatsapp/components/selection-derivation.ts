/**
 * F-7 (D-21) — Derived selection helpers for the inbox.
 *
 * The single source of truth for which conversation is open is the
 * `selectedConversationId` string. The `selectedConversation` OBJECT is always
 * DERIVED from that id — never kept as a parallel `useState` that could drift
 * from the id (the class behind "el chat de otra conversación bajo el nombre
 * de otra persona" + the `handleConversationCreated` null-object bug).
 *
 * Two sources can provide the object for a given id:
 *   1. the loaded conversation list (owned by `useConversations` in
 *      `ConversationList`, pushed up to the parent reactively) — the
 *      authoritative, realtime-merged copy; ALWAYS wins when present.
 *   2. a fetch-by-id fallback (`getConversation(id)`) for an id that is not in
 *      any loaded page yet (e.g. an outbound-only conversation deep-linked via
 *      `?c=<id>` whose customer never replied, so it falls outside page 1).
 *
 * These helpers are pure so the derivation contract is unit-testable in the
 * repo's default Node test env without browser/test-render dependencies.
 */
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

/**
 * Derive the selected conversation object from its two possible sources.
 * The loaded-list object always wins over the fetch-by-id fallback so the
 * chat header and chat content can never read from divergent sources, and so
 * a fresh realtime-merged list row supersedes a stale fetched snapshot for the
 * same id. Returns null when neither source has the conversation.
 */
export function deriveSelectedConversation(
  listObject: ConversationWithDetails | undefined,
  fetchedObject: ConversationWithDetails | null,
): ConversationWithDetails | null {
  return listObject ?? fetchedObject ?? null
}

/**
 * Whether the fetch-by-id effect must run for the current selection: only when
 * there is a real id AND it is not already covered by the loaded list.
 */
export function shouldFetchById(
  selectedConversationId: string | null,
  listObject: ConversationWithDetails | undefined,
): boolean {
  if (!selectedConversationId) return false
  return listObject === undefined
}

/**
 * What the `fetchedConversation` state should become for the current selection,
 * given the loaded-list object and any just-fetched object. Clears (null) when
 * there is no id or when the list now owns the id (so derivation never reads a
 * stale fetched copy); otherwise keeps the freshly fetched object.
 */
export function resolveFetchedConversation(
  selectedConversationId: string | null,
  listObject: ConversationWithDetails | undefined,
  fetchedObject: ConversationWithDetails | null,
): ConversationWithDetails | null {
  if (!selectedConversationId) return null
  if (listObject !== undefined) return null
  return fetchedObject
}
