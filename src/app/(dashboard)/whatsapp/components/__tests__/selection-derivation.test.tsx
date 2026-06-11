/**
 * F-7 (D-21) — selectedConversation derived selection.
 *
 * Default vitest env is Node (vitest.config.ts) and neither jsdom nor
 * @testing-library/react are installed in this repo. Rather than add browser
 * test deps for a single test (MEMORY: extra deps risk breaking `next build`
 * / Vercel deploy), the DERIVATION LOGIC — which is what D-21 is actually
 * about (one source of truth: the id; the object is always derived, never
 * parallel state) — is extracted into a pure, dependency-free module
 * (`selection-derivation.ts`) and exercised here directly.
 *
 * The five behaviors asserted mirror the plan's <behavior> block:
 *   - id in loaded list   → selectedConversation === the list object
 *   - id NOT in list      → the fetch-by-id path runs and provides the object
 *   - id null             → selectedConversation null + fetched cleared
 *   - id arrives in a page → re-derives to the list object (list wins)
 *   - after create(newId)  → never null for a real id (list or fetched covers it)
 */
import { describe, it, expect } from 'vitest'
import {
  deriveSelectedConversation,
  shouldFetchById,
  resolveFetchedConversation,
} from '../selection-derivation'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

// Minimal conversation fixtures — only the id is load-bearing for derivation.
function conv(id: string): ConversationWithDetails {
  return { id } as ConversationWithDetails
}

const listObj = conv('a')
const fetchedObj = conv('z')

describe('F-7 deriveSelectedConversation — single source of truth', () => {
  it('id-in-list → returns the LIST object (header + content from one source)', () => {
    // listObject present wins over any fetched object.
    expect(deriveSelectedConversation(listObj, fetchedObj)).toBe(listObj)
  })

  it('id-absent-from-list → returns the FETCHED object (fetch-by-id covered it)', () => {
    expect(deriveSelectedConversation(undefined, fetchedObj)).toBe(fetchedObj)
  })

  it('id-null (no list, no fetched) → null', () => {
    expect(deriveSelectedConversation(undefined, null)).toBeNull()
  })

  it('arrival-in-page → list object takes precedence over a stale fetched object', () => {
    // Same id arrived in a page load: the list object (fresh, realtime-merged)
    // must win over the earlier fetch-by-id snapshot for the same id.
    const arrived = conv('z') // same id as fetchedObj, different reference
    expect(deriveSelectedConversation(arrived, fetchedObj)).toBe(arrived)
  })
})

describe('F-7 shouldFetchById — fetch-by-id effect predicate', () => {
  it('null id → never fetch', () => {
    expect(shouldFetchById(null, undefined)).toBe(false)
  })

  it('id present + already in loaded list → do NOT fetch (list covers it)', () => {
    expect(shouldFetchById('a', listObj)).toBe(false)
  })

  it('id present + NOT in loaded list → fetch by id', () => {
    expect(shouldFetchById('b', undefined)).toBe(true)
  })
})

describe('F-7 resolveFetchedConversation — what fetched state should become', () => {
  it('null id → clears fetched (returns null)', () => {
    expect(resolveFetchedConversation(null, undefined, fetchedObj)).toBeNull()
  })

  it('id now present in list → clears fetched (list is the source now)', () => {
    // Once the id lands in a loaded page, the parallel fetched copy must clear
    // so derivation never reads a stale object for an id the list now owns.
    expect(resolveFetchedConversation('a', listObj, fetchedObj)).toBeNull()
  })

  it('id absent from list → keeps the freshly fetched object', () => {
    const fresh = conv('b')
    expect(resolveFetchedConversation('b', undefined, fresh)).toBe(fresh)
  })

  it('after handleConversationCreated(newId): id in page-1 list → derivation never null', () => {
    // The new conversation lands on page 1 (newest first), so the list object
    // exists immediately → selectedConversation is the list object, not null.
    const created = conv('new-1')
    const derived = deriveSelectedConversation(created, null)
    expect(derived).not.toBeNull()
    expect(derived).toBe(created)
  })

  it('after handleConversationCreated(newId): not yet in list → fetch-by-id covers it (never null)', () => {
    // Edge: if the new id is somehow not on page 1 yet, shouldFetchById fires,
    // the effect fetches it, and derivation resolves to the fetched object.
    expect(shouldFetchById('new-2', undefined)).toBe(true)
    expect(deriveSelectedConversation(undefined, conv('new-2'))).not.toBeNull()
  })
})
