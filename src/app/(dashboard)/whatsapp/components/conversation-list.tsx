'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Bot, Plus, Search as SearchIcon, Tag, UserRoundSearch } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import type { ConversationWithDetails } from '@/lib/whatsapp/types'
import type { ClientActivationConfig } from '@/lib/domain/client-activation'

interface ConversationListProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
  selectedId: string | null
  onSelect: (id: string | null, conversation?: ConversationWithDetails) => void
  /** Called when selected conversation data changes via realtime */
  onSelectedUpdated?: (conversation: ConversationWithDetails) => void
  /** Callback to expose refreshOrders function to parent */
  onRefreshOrdersReady?: (refreshOrders: () => Promise<void>) => void
  clientConfig?: ClientActivationConfig | null
}

/**
 * Conversation list with search and filters.
 * Uses real-time subscription via useConversations hook.
 */
export function ConversationList({
  workspaceId,
  initialConversations,
  selectedId,
  onSelect,
  onSelectedUpdated,
  onRefreshOrdersReady,
  clientConfig,
}: ConversationListProps) {
  const v2 = useInboxV2()
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Locate the `.theme-editorial` wrapper so Radix Popover can re-root inside
  // the editorial token scope (same pattern as chat-header.tsx — Plan 04). When
  // v2 is false, ref stays null → Popover falls back to default document.body portal.
  const themeContainerRef = useRef<HTMLElement | null>(null)

  const [showNewModal, setShowNewModal] = useState(false)
  const [agentFilter, setAgentFilter] = useState<'all' | 'agent-attended'>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])

  const {
    conversations,
    ordersByContact,
    query,
    setQuery,
    filter,
    setFilter,
    isLoading,
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
  })

  // Resolve the `.theme-editorial` wrapper for Radix portal re-rooting.
  // Only needed when v2 (else ref stays null → default body portal).
  useEffect(() => {
    if (!v2) return
    themeContainerRef.current = document.querySelector('[data-module="whatsapp"]') as HTMLElement | null
  }, [v2])

  // Keyboard shortcut: '/' focuses the list search input (D-23).
  // Scoped to focus inside [data-module="whatsapp"] (set by InboxLayout), and
  // ignored when focus is in another input/textarea/contenteditable. Only active when v2.
  useEffect(() => {
    if (!v2) return
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
  }, [v2])

  // Expose refreshOrders to parent
  useEffect(() => {
    onRefreshOrdersReady?.(refreshOrders)
  }, [onRefreshOrdersReady, refreshOrders])

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

  // Apply agent + tag filters after existing search/filter logic
  const filteredConversations = useMemo(() => {
    let result = conversations
    if (agentFilter === 'agent-attended') {
      result = result.filter(c => c.agent_conversational !== false)
    }
    if (tagFilter) {
      result = result.filter(c => c.tags?.some(t => t.id === tagFilter))
    }
    return result
  }, [conversations, agentFilter, tagFilter])

  // Keyboard shortcuts: '[' previous / ']' next conversation (D-23, UI-SPEC §10.1).
  // Same scoping rules as '/': only fires when focus is inside [data-module="whatsapp"],
  // ignored on input/textarea/contenteditable, only active when v2.
  // Navigates through the FILTERED list (what the user actually sees — matches '/' focus semantics).
  // Wraps at ends: '[' at first item goes to last, ']' at last goes to first.
  useEffect(() => {
    if (!v2) return
    function handleBracketKey(e: KeyboardEvent) {
      if (e.key !== '[' && e.key !== ']') return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
      if (!target.closest('[data-module="whatsapp"]')) return
      if (!filteredConversations.length) return

      const currentIdx = filteredConversations.findIndex((c) => c.id === selectedId)

      if (e.key === '[') {
        const prevIdx = currentIdx <= 0 ? filteredConversations.length - 1 : currentIdx - 1
        const prev = filteredConversations[prevIdx]
        if (prev) {
          e.preventDefault()
          markAsReadLocally(prev.id)
          onSelect(prev.id, prev)
        }
        return
      }

      if (e.key === ']') {
        const nextIdx =
          currentIdx < 0 || currentIdx >= filteredConversations.length - 1 ? 0 : currentIdx + 1
        const next = filteredConversations[nextIdx]
        if (next) {
          e.preventDefault()
          markAsReadLocally(next.id)
          onSelect(next.id, next)
        }
      }
    }
    document.addEventListener('keydown', handleBracketKey)
    return () => document.removeEventListener('keydown', handleBracketKey)
  }, [v2, filteredConversations, selectedId, onSelect, markAsReadLocally])

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

      {/* Conversation list */}
      <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
        {isLoading && !initialConversations.length ? (
          v2 ? (
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
          )
        ) : filteredConversations.length === 0 ? (
          v2 ? (
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
          )
        ) : (
          <div role="list" aria-label="Lista de conversaciones">
            {filteredConversations.map((conversation) => {
              // Get orders for this conversation's contact
              const contactOrders = conversation.contact?.id
                ? ordersByContact.get(conversation.contact.id) || []
                : []

              const showClientBadge = clientConfig?.enabled && (
                clientConfig.all_are_clients || conversation.contact?.is_client === true
              )

              return (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={selectedId === conversation.id}
                  onSelect={(id) => {
                    markAsReadLocally(id)
                    onSelect(id, conversation)
                  }}
                  orders={contactOrders}
                  showClientBadge={!!showClientBadge}
                />
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* Results count when searching or filtering */}
      {(hasQuery || agentFilter === 'agent-attended' || tagFilter) && filteredConversations.length > 0 && (
        <div className="p-2 border-t text-xs text-muted-foreground text-center">
          {filteredConversations.length} resultado{filteredConversations.length !== 1 && 's'}
        </div>
      )}
    </div>
  )
}
