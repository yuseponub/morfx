// ============================================================================
// Global Search Configuration
// Fuse.js configuration for searching across contacts, orders, conversations
// ============================================================================

import Fuse, { IFuseOptions } from 'fuse.js'
import type { SearchableItem } from '@/app/actions/search'

// ============================================================================
// Fuse.js Configuration
// ============================================================================

/**
 * Fuse.js options for global search.
 * Weighted keys prioritize title over subtitle.
 */
export const globalSearchOptions: IFuseOptions<SearchableItem> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'subtitle', weight: 1 },
  ],
  threshold: 0.4,           // 0 = exact match, 1 = match anything
  ignoreLocation: true,     // Search entire string
  minMatchCharLength: 2,    // Ignore single character matches
  shouldSort: true,         // Sort by relevance score
  includeScore: true,       // Include match score in results
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Fuse.js instance for global search.
 *
 * @param items - Array of searchable items
 * @returns Fuse instance configured for global search
 */
export function createGlobalSearcher(items: SearchableItem[]): Fuse<SearchableItem> {
  return new Fuse(items, globalSearchOptions)
}
