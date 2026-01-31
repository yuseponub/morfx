// ============================================================================
// Fuse.js Search Configuration
// Fuzzy search utilities for orders with weighted field matching
// ============================================================================

import Fuse, { IFuseOptions } from 'fuse.js'
import { useMemo, useState } from 'react'
import type { OrderWithDetails } from '@/lib/orders/types'

// ============================================================================
// Fuse.js Configuration
// ============================================================================

/**
 * Fuse.js options for order search.
 * Weighted keys prioritize contact name and tracking number.
 */
const orderSearchOptions: IFuseOptions<OrderWithDetails> = {
  // Search these fields with weights (higher = more important)
  keys: [
    { name: 'contact.name', weight: 2 },       // Nombre del contacto (mas importante)
    { name: 'contact.phone', weight: 1.5 },    // Telefono del contacto
    { name: 'products.title', weight: 1 },     // Nombres de productos
    { name: 'products.sku', weight: 1 },       // SKUs de productos
    { name: 'tracking_number', weight: 1.5 },  // Numero de guia/tracking
    { name: 'contact.city', weight: 0.8 },     // Ciudad
    { name: 'description', weight: 0.5 },      // Notas/descripcion
    { name: 'carrier', weight: 0.5 },          // Transportadora
  ],
  // Fuzzy matching configuration
  threshold: 0.4,           // 0 = exact match, 1 = match anything
  distance: 100,            // How close match must be to search location
  ignoreLocation: true,     // Search entire string, not just start
  minMatchCharLength: 2,    // Ignore single character matches
  // Results configuration
  shouldSort: true,         // Sort by relevance score
  includeScore: true,       // Include match score in results
  findAllMatches: true,     // Don't stop at first match per field
}

// ============================================================================
// Fuse Instance Factory
// ============================================================================

/**
 * Create a Fuse.js instance for searching orders.
 * Memoize this - don't recreate on every search.
 *
 * @param orders - Array of orders to search
 * @returns Fuse instance configured for order search
 */
export function createOrderSearcher(orders: OrderWithDetails[]): Fuse<OrderWithDetails> {
  return new Fuse(orders, orderSearchOptions)
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * React hook for fuzzy searching orders.
 * Returns filtered orders based on search query with proper memoization.
 *
 * @param orders - Orders to search through
 * @returns Search state and filtered results
 *
 * @example
 * ```tsx
 * const { query, setQuery, results, hasQuery } = useOrderSearch(orders)
 *
 * return (
 *   <input value={query} onChange={(e) => setQuery(e.target.value)} />
 *   <OrderList orders={results} />
 * )
 * ```
 */
export function useOrderSearch(orders: OrderWithDetails[]) {
  const [query, setQuery] = useState('')

  // Memoize Fuse instance - only recreate when orders array changes
  const fuse = useMemo(() => createOrderSearcher(orders), [orders])

  // Memoize search results - recalculate when query or orders change
  const results = useMemo(() => {
    const trimmed = query.trim()

    // Return all orders if no query
    if (!trimmed) {
      return orders
    }

    // Perform fuzzy search and extract items
    return fuse.search(trimmed).map(result => result.item)
  }, [fuse, query, orders])

  return {
    /** Current search query */
    query,
    /** Update search query */
    setQuery,
    /** Filtered results (all orders if no query) */
    results,
    /** Whether there's an active search query */
    hasQuery: query.trim().length > 0,
    /** Number of results */
    resultCount: results.length,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize search input for consistent matching.
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces
 *
 * @param query - Raw search input
 * @returns Normalized query string
 */
export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
}

/**
 * Highlight matching text in a result string.
 * Useful for showing users why a result matched.
 *
 * @param text - Original text
 * @param query - Search query
 * @returns Text with matches wrapped in <mark> tags
 */
export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return text

  const normalized = normalizeSearchQuery(query)
  const regex = new RegExp(`(${escapeRegExp(normalized)})`, 'gi')

  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
