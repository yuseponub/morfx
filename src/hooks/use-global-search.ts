'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSearchableItems, type SearchableItem } from '@/app/actions/search'
import { createGlobalSearcher } from '@/lib/search/global-search-config'

// ============================================================================
// Types
// ============================================================================

export type SearchFilter = 'all' | 'contact' | 'order' | 'conversation'

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for global search functionality.
 * Manages search state, keyboard shortcuts, and result filtering.
 *
 * @returns Search state and controls
 */
export function useGlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [items, setItems] = useState<SearchableItem[]>([])
  const [loading, setLoading] = useState(false)

  // ========================================================================
  // Keyboard shortcut: Cmd+K / Ctrl+K
  // ========================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ========================================================================
  // Fetch items when dialog opens
  // ========================================================================

  useEffect(() => {
    if (open && items.length === 0) {
      setLoading(true)
      getSearchableItems().then(data => {
        setItems(data)
        setLoading(false)
      })
    }
  }, [open, items.length])

  // ========================================================================
  // Memoize Fuse instance
  // ========================================================================

  const fuse = useMemo(() => createGlobalSearcher(items), [items])

  // ========================================================================
  // Filter and search
  // ========================================================================

  const results = useMemo(() => {
    let filtered = items

    // Apply type filter first
    if (filter !== 'all') {
      filtered = items.filter(item => item.type === filter)
    }

    // Then apply fuzzy search if query exists
    if (query.trim()) {
      const searchable = filter === 'all' ? items : filtered
      const fuseInstance = createGlobalSearcher(searchable)
      return fuseInstance.search(query.trim()).map(r => r.item).slice(0, 15)
    }

    // No query: return filtered items limited to 15
    return filtered.slice(0, 15)
  }, [items, query, filter, fuse])

  // ========================================================================
  // Group results by type for display
  // ========================================================================

  const groupedResults = useMemo(() => {
    if (filter !== 'all') {
      return { [filter]: results }
    }
    return {
      contact: results.filter(r => r.type === 'contact').slice(0, 5),
      order: results.filter(r => r.type === 'order').slice(0, 5),
      conversation: results.filter(r => r.type === 'conversation').slice(0, 5),
    }
  }, [results, filter])

  // ========================================================================
  // Navigation handler
  // ========================================================================

  const navigate = useCallback((href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }, [router])

  return {
    /** Dialog open state */
    open,
    /** Set dialog open state */
    setOpen,
    /** Current search query */
    query,
    /** Update search query */
    setQuery,
    /** Current filter type */
    filter,
    /** Update filter type */
    setFilter,
    /** Flat list of results */
    results,
    /** Results grouped by type */
    groupedResults,
    /** Loading state */
    loading,
    /** Navigate to result */
    navigate
  }
}
