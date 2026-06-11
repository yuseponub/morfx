'use client'

import { useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Bot, Plus, Search as SearchIcon, Tag, UserRoundSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getTagsForScope } from '@/app/actions/tags'
import { cn } from '@/lib/utils'
import { useConversations, type ConversationFilter } from '@/hooks/use-conversations'
import { InboxFilters } from './filters/inbox-filters'
import { SearchInput } from './filters/search-input'
import { ConversationItem } from './conversation-item'
import { AvailabilityToggle } from './availability-toggle'
import { NewConversationModal } from './new-conversation-modal'
import { useInboxV2 } from './inbox-v2-context'
import { useInboxV3 } from './inbox-v3-context'
import type { ConversationWithDetails, OrderSummary } from '@/lib/whatsapp/types'
import type { ClientActivationConfig } from '@/lib/domain/client-activation'

interface ConversationListProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
  /** Opaque keyset cursor of the SSR first page (F-1 — threads into the hook) */
  initialCursor?: string | null
  /** Whether more pages exist after the SSR first page (F-1) */
  initialHasMore?: boolean
  selectedId: string | null
  onSelect: (id: string | null, conversation?: ConversationWithDetails) => void
  /** Called when selected conversation data changes via realtime */
  onSelectedUpdated?: (conversation: ConversationWithDetails) => void
  /** Callback to expose refreshOrders function to parent */
  onRefreshOrdersReady?: (refreshOrders: () => Promise<void>) => void
  /**
   * Callback to expose an "open new conversation modal" trigger to the parent
   * (used by the editorial-v3 topbar "Nueva conversación" action, which lives
   * in inbox-layout outside this column). Preserves the existing modal wiring.
   */
  onOpenNewConversationReady?: (open: () => void) => void
  clientConfig?: ClientActivationConfig | null
}

// ============================================================================
// Virtualized list body (F-1 / D-03 — @tanstack/react-virtual, same pattern
// as chat-view.tsx). Plain overflow-auto scroll container (NOT Radix
// ScrollArea — its nested viewport fights getScrollElement, RESEARCH Q7/P8).
// Infinite-scroll trigger derived from the last virtual item (no
// IntersectionObserver).
// ============================================================================

interface VirtualizedConversationListProps {
  conversations: ConversationWithDetails[]
  ordersByContact: Map<string, OrderSummary[]>
  selectedId: string | null
  onSelectItem: (id: string, conversation: ConversationWithDetails) => void
  clientConfig?: ClientActivationConfig | null
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => Promise<void>
  /** ~76px v3 (.conv grid) / ~88px v2 / ~100px legacy — measureElement corrects it */
  estimateSize: number
  className: string
}

function VirtualizedConversationList({
  conversations,
  ordersByContact,
  selectedId,
  onSelectItem,
  clientConfig,
  hasMore,
  isLoadingMore,
  loadMore,
  estimateSize,
  className,
}: VirtualizedConversationListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    // Dynamic height — tags row / badges vary per conversation (P9)
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const lastIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1

  // Infinite-scroll: when the last rendered virtual item reaches the loaded
  // tail (minus overscan), pull the next keyset page (RESEARCH Q7).
  useEffect(() => {
    if (lastIndex < 0) return
    if (lastIndex >= conversations.length - 1 - 5 && hasMore && !isLoadingMore) {
      loadMore()
    }
  }, [lastIndex, conversations.length, hasMore, isLoadingMore, loadMore])

  return (
    <div ref={parentRef} className={className} role="list" aria-label="Lista de conversaciones">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const conversation = conversations[virtualItem.index]
          if (!conversation) return null
          const contactOrders = conversation.contact?.id
            ? ordersByContact.get(conversation.contact.id) || []
            : []
          const showClientBadge = clientConfig?.enabled && (
            clientConfig.all_are_clients || conversation.contact?.is_client === true
          )
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ConversationItem
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onSelect={(id) => onSelectItem(id, conversation)}
                orders={contactOrders}
                showClientBadge={!!showClientBadge}
              />
            </div>
          )
        })}
      </div>
      {isLoadingMore && (
        <div className="flex items-center justify-center py-3" aria-label="Cargando más conversaciones">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
        </div>
      )}
    </div>
  )
}

/**
 * Conversation list with search and filters.
 * Uses real-time subscription via useConversations hook.
 */
export function ConversationList({
  workspaceId,
  initialConversations,
  initialCursor,
  initialHasMore,
  selectedId,
  onSelect,
  onSelectedUpdated,
  onRefreshOrdersReady,
  onOpenNewConversationReady,
  clientConfig,
}: ConversationListProps) {
  const v2 = useInboxV2()
  const v3 = useInboxV3()
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Locate the `.theme-editorial` wrapper so Radix Popover can re-root inside
  // the editorial token scope (same pattern as chat-header.tsx — Plan 04). When
  // v2 is false, ref stays null → Popover falls back to default document.body portal.
  const themeContainerRef = useRef<HTMLElement | null>(null)

  const [showNewModal, setShowNewModal] = useState(false)
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])

  // tag + agent filters now live in the HOOK as server-side RPC params (Q4/P4)
  // — a client-side pass here would only filter LOADED pages (same invisibility
  // class F-1 fixes).
  const {
    conversations,
    ordersByContact,
    query,
    setQuery,
    filter,
    setFilter,
    tagFilter,
    setTagFilter,
    agentFilter,
    setAgentFilter,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    hasQuery,
    refresh,
    refreshOrders,
    getConversationById,
    markAsReadLocally,
    sortMode,
    setSortMode,
  } = useConversations({
    workspaceId,
    initialConversations,
    initialCursor,
    initialHasMore,
  })

  // Resolve the `.theme-editorial`/`.theme-editorial-v3` wrapper for Radix
  // portal re-rooting. Needed when v2 OR v3 (else ref stays null → default
  // body portal). Both render `[data-module="whatsapp"]` on the scope root.
  useEffect(() => {
    if (!v2 && !v3) return
    themeContainerRef.current = document.querySelector('[data-module="whatsapp"]') as HTMLElement | null
  }, [v2, v3])

  // Keyboard shortcut: '/' focuses the list search input (D-23).
  // Scoped to focus inside [data-module="whatsapp"] (set by InboxLayout), and
  // ignored when focus is in another input/textarea/contenteditable. Only active when v2.
  useEffect(() => {
    if (!v2 && !v3) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
      if (!target.closest('[data-module="whatsapp"]')) return
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [v2, v3])

  // Expose refreshOrders to parent
  useEffect(() => {
    onRefreshOrdersReady?.(refreshOrders)
  }, [onRefreshOrdersReady, refreshOrders])

  // Expose the new-conversation modal trigger to the parent (v3 topbar action).
  useEffect(() => {
    onOpenNewConversationReady?.(() => setShowNewModal(true))
  }, [onOpenNewConversationReady])

  // Load whatsapp-scope tags when filter popover opens
  useEffect(() => {
    if (!tagFilterOpen) return
    getTagsForScope('whatsapp').then(setAvailableTags).catch(console.error)
  }, [tagFilterOpen])

  // Sync selected conversation when realtime updates arrive
  // This ensures the chat header shows current window status
  const prevConversationsRef = useRef(conversations)
  useEffect(() => {
    if (!selectedId || !onSelectedUpdated) return

    // Find selected in updated conversations
    const updated = getConversationById(selectedId)
    if (!updated) return

    // Find in previous conversations to compare
    const prev = prevConversationsRef.current.find(c => c.id === selectedId)

    // If key fields changed, notify parent
    if (prev && (
      prev.last_customer_message_at !== updated.last_customer_message_at ||
      prev.last_message_at !== updated.last_message_at ||
      prev.is_read !== updated.is_read ||
      JSON.stringify(prev.tags) !== JSON.stringify(updated.tags)
    )) {
      onSelectedUpdated(updated)
    }

    prevConversationsRef.current = conversations
  }, [conversations, selectedId, onSelectedUpdated, getConversationById])

  // Handle new conversation created
  const handleConversationCreated = async (conversationId: string) => {
    // Refresh the list to include the new conversation
    await refresh()
    // Select the new conversation
    onSelect(conversationId)
  }

  // Keyboard shortcuts: '[' previous / ']' next conversation (D-23, UI-SPEC §10.1).
  // Same scoping rules as '/': only fires when focus is inside [data-module="whatsapp"],
  // ignored on input/textarea/contenteditable, only active when v2.
  // Navigates through the FILTERED list (what the user actually sees — matches '/' focus semantics).
  // Wraps at ends: '[' at first item goes to last, ']' at last goes to first.
  useEffect(() => {
    if (!v2 && !v3) return
    function handleBracketKey(e: KeyboardEvent) {
      if (e.key !== '[' && e.key !== ']') return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
      if (!target.closest('[data-module="whatsapp"]')) return
      if (!conversations.length) return

      const currentIdx = conversations.findIndex((c) => c.id === selectedId)

      if (e.key === '[') {
        const prevIdx = currentIdx <= 0 ? conversations.length - 1 : currentIdx - 1
        const prev = conversations[prevIdx]
        if (prev) {
          e.preventDefault()
          markAsReadLocally(prev.id)
          onSelect(prev.id, prev)
        }
        return
      }

      if (e.key === ']') {
        const nextIdx =
          currentIdx < 0 || currentIdx >= conversations.length - 1 ? 0 : currentIdx + 1
        const next = conversations[nextIdx]
        if (next) {
          e.preventDefault()
          markAsReadLocally(next.id)
          onSelect(next.id, next)
        }
      }
    }
    document.addEventListener('keydown', handleBracketKey)
    return () => document.removeEventListener('keydown', handleBracketKey)
  }, [v2, v3, conversations, selectedId, onSelect, markAsReadLocally])

  // Tab configuration for editorial header (v2). Maps editorial labels to
  // existing ConversationFilter values — D-19 no hook mutation.
  // Note: 'Cerradas' maps to 'archived' (closed = archivada in this CRM).
  const editorialTabs: Array<{ value: ConversationFilter; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'unassigned', label: 'Sin asignar' },
    { value: 'mine', label: 'Mías' },
    { value: 'archived', label: 'Cerradas' },
  ]

  // Detect whether any non-default filter is active (D-16 empty-filter state).
  const isFiltered =
    filter !== 'all' ||
    hasQuery ||
    agentFilter === 'agent-attended' ||
    !!tagFilter

  // Shared item-select handler — used by the virtualized list rows.
  const handleSelectItem = (id: string, conversation: ConversationWithDetails) => {
    markAsReadLocally(id)
    onSelect(id, conversation)
  }

  // ===================== EDITORIAL V3 (.conv-col verbatim) =====================
  // Mock `ui_kits/conversaciones/index.html` list column: `.conv-head` (search)
  // + `.conv-filters` (chips) + `.conv-list`. Filter chips map to the existing
  // filter/agentFilter state (D-08 — no hook mutation). All data wiring preserved.
  if (v3) {
    // Chip active-state helpers bound to existing state.
    const isTodas = filter === 'all' && agentFilter === 'all'
    const isSinLeer = filter === 'unread'
    const isMias = filter === 'mine'
    const isSinAsignar = filter === 'unassigned'
    const isSinRespuesta = filter === 'unanswered'
    const isAgenteIA = agentFilter === 'agent-attended'
    const isCerradas = filter === 'archived'

    return (
      <section className="conv-col">
        {/* Search head */}
        <div className="conv-head">
          <div className="conv-search">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversación…"
              aria-label="Buscar conversaciones"
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="conv-filters">
          <button
            type="button"
            className={cn('chip', isTodas && 'on')}
            onClick={() => { setFilter('all'); setAgentFilter('all') }}
          >
            Todas
          </button>
          <button
            type="button"
            className={cn('chip', isSinLeer && 'on')}
            onClick={() => setFilter('unread')}
          >
            Sin leer
          </button>
          <button
            type="button"
            className={cn('chip', isMias && 'on')}
            onClick={() => setFilter('mine')}
          >
            Mías
          </button>
          <button
            type="button"
            className={cn('chip', isSinAsignar && 'on')}
            onClick={() => setFilter('unassigned')}
          >
            Sin asignar
          </button>
          <button
            type="button"
            className={cn('chip', isSinRespuesta && 'on')}
            onClick={() => setFilter('unanswered')}
          >
            Sin respuesta
          </button>
          <button
            type="button"
            className={cn('chip', isAgenteIA && 'on')}
            onClick={() => setAgentFilter((prev) => (prev === 'all' ? 'agent-attended' : 'all'))}
          >
            Agente IA
          </button>
          <button
            type="button"
            className={cn('chip', isCerradas && 'on')}
            onClick={() => setFilter('archived')}
          >
            Cerradas
          </button>
          <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn('chip', tagFilter && 'on')}
                title={tagFilter
                  ? `Filtrando: ${availableTags.find(t => t.id === tagFilter)?.name || 'etiqueta'}`
                  : 'Filtrar por etiqueta'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Tag style={{ width: 12, height: 12 }} aria-hidden />
                {tagFilter
                  ? (availableTags.find(t => t.id === tagFilter)?.name || 'Etiqueta')
                  : 'Etiqueta'}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[200px] p-2"
              align="start"
              portalContainer={themeContainerRef.current ?? undefined}
            >
              <div className="space-y-1">
                {tagFilter && (
                  <button
                    onClick={() => { setTagFilter(null); setTagFilterOpen(false) }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent text-muted-foreground"
                  >
                    Quitar filtro
                  </button>
                )}
                {availableTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2 py-1.5">Sin etiquetas</p>
                ) : (
                  availableTags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => { setTagFilter(tag.id); setTagFilterOpen(false) }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent flex items-center gap-2",
                        tagFilter === tag.id && "bg-accent font-medium"
                      )}
                    >
                      <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className={cn('chip', sortMode === 'last_message' && 'on')}
            onClick={() => setSortMode(prev =>
              prev === 'last_customer_message' ? 'last_message' : 'last_customer_message')}
            title={sortMode === 'last_message'
              ? 'Ordenando por última interacción'
              : 'Ordenar por última interacción'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <UserRoundSearch style={{ width: 12, height: 12 }} aria-hidden />
            Orden
          </button>
        </div>

        {/* Conversation list — virtualized (F-1/D-03) */}
        {isLoading && !initialConversations.length ? (
          <div className="conv-list" role="list" aria-label="Lista de conversaciones">
            <div className="flex items-center justify-center py-16">
              <span className="mx-caption">Cargando…</span>
            </div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="conv-list" role="list" aria-label="Lista de conversaciones">
            {isFiltered ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center gap-2">
                <p className="mx-h4">Nada coincide con los filtros activos.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all')
                    setQuery('')
                    setAgentFilter('all')
                    setTagFilter(null)
                  }}
                  className="mx-ui underline"
                  style={{ color: 'var(--ink-2)' }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center gap-2">
                <p className="mx-h4">No hay conversaciones nuevas.</p>
              </div>
            )}
          </div>
        ) : (
          <VirtualizedConversationList
            className="conv-list"
            estimateSize={76}
            conversations={conversations}
            ordersByContact={ordersByContact}
            selectedId={selectedId}
            onSelectItem={handleSelectItem}
            clientConfig={clientConfig}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            loadMore={loadMore}
          />
        )}

        {/* New conversation modal (shared trigger via header in topbar; kept here for parity) */}
        <NewConversationModal
          open={showNewModal}
          onOpenChange={setShowNewModal}
          onConversationCreated={handleConversationCreated}
        />
      </section>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ===================== v2 EDITORIAL HEADER ===================== */}
      {v2 && (
        <>
          {/* Utility row: new-conversation button + availability toggle (kept minimal) */}
          <div className="px-4 pt-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowNewModal(true)}
              title="Nueva conversación"
              aria-label="Nueva conversación"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <AvailabilityToggle />
          </div>

          {/* Editorial header: eyebrow + h1 + underlined tabs */}
          <div className="px-4 pt-2 pb-2 border-b border-[var(--ink-1)]">
            <span
              className="block text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · whatsapp
            </span>
            <h1
              className="mt-1 mb-2 text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Conversaciones
            </h1>
            <div className="flex gap-4 mt-2" role="tablist" aria-label="Filtros de conversaciones">
              {editorialTabs.map((tab) => {
                const isActive = filter === tab.value
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setFilter(tab.value)}
                    className={cn(
                      'pb-1 text-[13px] transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-1)]',
                      isActive
                        ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                        : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
                    )}
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Editorial search input with lucide Search icon + '/' shortcut */}
          <div className="px-4 py-2 border-b border-[var(--border)] relative">
            <SearchIcon
              className="absolute left-[22px] top-1/2 -translate-y-1/2 h-[14px] w-[14px] text-[var(--ink-3)] pointer-events-none"
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono o etiqueta…"
              className="w-full bg-[var(--paper-0)] border border-[var(--border)] rounded-[4px] py-2 pr-3 text-[13px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-sans)', paddingLeft: '28px' }}
              aria-label="Buscar conversaciones"
            />
          </div>

          {/* Secondary filter row: sort mode + agent filter + tag filter (preserve functionality) */}
          <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-2">
            <Button
              variant={sortMode === 'last_message' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => setSortMode(prev =>
                prev === 'last_customer_message' ? 'last_message' : 'last_customer_message'
              )}
              title={sortMode === 'last_message'
                ? 'Ordenando por última interacción'
                : 'Ordenar por última interacción'}
            >
              <UserRoundSearch className="h-4 w-4" />
            </Button>
            <Button
              variant={agentFilter === 'agent-attended' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => setAgentFilter(prev => prev === 'all' ? 'agent-attended' : 'all')}
              title={agentFilter === 'agent-attended' ? 'Mostrando solo con agente' : 'Filtrar por agente'}
            >
              <Bot className="h-4 w-4" />
            </Button>
            <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={tagFilter ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  title={tagFilter
                    ? `Filtrando: ${availableTags.find(t => t.id === tagFilter)?.name || 'tag'}`
                    : 'Filtrar por etiqueta'}
                >
                  <Tag className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[200px] p-2"
                align="start"
                portalContainer={v2 ? themeContainerRef.current : undefined}
              >
                <div className="space-y-1">
                  {tagFilter && (
                    <button
                      onClick={() => { setTagFilter(null); setTagFilterOpen(false) }}
                      className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent text-muted-foreground"
                    >
                      Quitar filtro
                    </button>
                  )}
                  {availableTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-2 py-1.5">Sin etiquetas</p>
                  ) : (
                    availableTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => { setTagFilter(tag.id); setTagFilterOpen(false) }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent flex items-center gap-2",
                          tagFilter === tag.id && "bg-accent font-medium"
                        )}
                      >
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}

      {/* ===================== LEGACY HEADER (flag-OFF) ===================== */}
      {!v2 && (
        <>
          {/* Header with new button and availability toggle */}
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Conversaciones</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowNewModal(true)}
                title="Nueva conversacion"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <AvailabilityToggle />
          </div>

          {/* Filters */}
          <div className="p-3 border-b space-y-3">
            <InboxFilters value={filter} onChange={setFilter} />
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchInput value={query} onChange={setQuery} />
              </div>
              {/* Sort mode toggle: default=last_customer_message, toggled=last_message */}
              <Button
                variant={sortMode === 'last_message' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setSortMode(prev =>
                  prev === 'last_customer_message' ? 'last_message' : 'last_customer_message'
                )}
                title={sortMode === 'last_message'
                  ? 'Ordenando por última interacción'
                  : 'Ordenar por última interacción'}
              >
                <UserRoundSearch className="h-4 w-4" />
              </Button>
              {/* Agent filter toggle */}
              <Button
                variant={agentFilter === 'agent-attended' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setAgentFilter(prev => prev === 'all' ? 'agent-attended' : 'all')}
                title={agentFilter === 'agent-attended' ? 'Mostrando solo con agente' : 'Filtrar por agente'}
              >
                <Bot className="h-4 w-4" />
              </Button>
              {/* Tag filter */}
              <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={tagFilter ? 'default' : 'ghost'}
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    title={tagFilter
                      ? `Filtrando: ${availableTags.find(t => t.id === tagFilter)?.name || 'tag'}`
                      : 'Filtrar por etiqueta'}
                  >
                    <Tag className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2" align="start">
                  <div className="space-y-1">
                    {tagFilter && (
                      <button
                        onClick={() => { setTagFilter(null); setTagFilterOpen(false) }}
                        className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent text-muted-foreground"
                      >
                        Quitar filtro
                      </button>
                    )}
                    {availableTags.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-2 py-1.5">Sin etiquetas</p>
                    ) : (
                      availableTags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => { setTagFilter(tag.id); setTagFilterOpen(false) }}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent flex items-center gap-2",
                            tagFilter === tag.id && "bg-accent font-medium"
                          )}
                        >
                          <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </>
      )}

      {/* New conversation modal (shared by both modes) */}
      <NewConversationModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onConversationCreated={handleConversationCreated}
      />

      {/* Conversation list — virtualized (F-1/D-03). Plain overflow-auto div
          replaces Radix ScrollArea: its nested viewport fights the
          virtualizer's getScrollElement (RESEARCH Q7/P8). */}
      {isLoading && !initialConversations.length ? (
        <div className="flex-1 overflow-auto">
          {v2 ? (
            /* D-14 editorial skeleton — 6 conversation-item shaped placeholders
               using .mx-skeleton utility (globals.css: paper-2 bg + 1px border +
               mx-pulse 1.5s animation, disabled by prefers-reduced-motion). */
            <div role="list" aria-busy="true" aria-label="Cargando conversaciones" className="flex flex-col">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)]"
                  aria-hidden
                >
                  {/* Avatar skeleton */}
                  <div className="mx-skeleton h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    {/* Name skeleton */}
                    <div className="mx-skeleton h-[14px] w-[120px] rounded-[2px]" />
                    {/* Preview skeleton */}
                    <div className="mx-skeleton h-[12px] w-[180px] rounded-[2px]" />
                  </div>
                  {/* Timestamp skeleton */}
                  <div className="mx-skeleton h-[10px] w-[40px] rounded-[2px] mt-1" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex-1 overflow-auto">
          {v2 ? (
            isFiltered ? (
              /* D-16 empty filter state */
              <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center gap-2">
                <p className="mx-h4">Nada coincide con los filtros activos.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all')
                    setQuery('')
                    setAgentFilter('all')
                    setTagFilter(null)
                  }}
                  className="text-[13px] font-medium text-[var(--ink-2)] border-b border-[var(--ink-2)] hover:text-[var(--rubric-2)] hover:border-[var(--rubric-2)] transition-colors"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              /* D-15 empty bandeja state */
              <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center gap-3">
                <p className="mx-h3">La bandeja está limpia.</p>
                <p className="mx-caption">Cuando llegue un mensaje nuevo aparecerá aquí.</p>
                <p className="mx-rule-ornament">· · ·</p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <p className="text-muted-foreground">
                {tagFilter
                  ? 'No hay conversaciones con esta etiqueta'
                  : agentFilter === 'agent-attended'
                  ? 'No hay conversaciones con agente activo'
                  : hasQuery
                    ? 'No se encontraron conversaciones'
                    : filter === 'unread'
                      ? 'No hay mensajes sin leer'
                      : filter === 'mine'
                        ? 'No tienes chats asignados'
                        : filter === 'unassigned'
                          ? 'No hay chats sin asignar'
                          : filter === 'unanswered'
                            ? 'No hay conversaciones sin respuesta'
                            : filter === 'archived'
                            ? 'No hay conversaciones archivadas'
                            : 'No hay conversaciones aun'
                }
              </p>
            </div>
          )}
        </div>
      ) : (
        <VirtualizedConversationList
          className="flex-1 overflow-auto"
          estimateSize={v2 ? 88 : 100}
          conversations={conversations}
          ordersByContact={ordersByContact}
          selectedId={selectedId}
          onSelectItem={handleSelectItem}
          clientConfig={clientConfig}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMore={loadMore}
        />
      )}

      {/* Results count when searching or filtering — loaded count; '+' signals
          more pages exist server-side (counts never derive from .length of the
          full set anymore — D-04) */}
      {(hasQuery || agentFilter === 'agent-attended' || tagFilter) && conversations.length > 0 && (
        <div className="p-2 border-t text-xs text-muted-foreground text-center">
          {conversations.length}{hasMore ? '+' : ''} resultado{(conversations.length !== 1 || hasMore) && 's'}
        </div>
      )}
    </div>
  )
}
