'use client'

import { useState, useCallback, useEffect } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { cn } from '@/lib/utils'
import { ConversationList } from './conversation-list'
import { ContactPanel } from './contact-panel'
import { AgentConfigSlider } from './agent-config-slider'
import { ChatView } from './chat-view'
import { DebugPanelProduction } from './debug-panel-production'
import { InboxV2Provider } from './inbox-v2-context'
import { InboxV3Provider } from './inbox-v3-context'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { markAsRead, getConversation } from '@/app/actions/conversations'
import {
  deriveSelectedConversation,
  shouldFetchById,
} from './selection-derivation'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'
import type { ClientActivationConfig } from '@/lib/domain/client-activation'

// No-op function for initial state
const noopRefreshOrders = async () => {}

type RightPanel = 'contact' | 'agent-config'

interface InboxLayoutProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
  /** Opaque keyset cursor of the SSR first page (F-1 — threads into useConversations) */
  initialCursor?: string | null
  /** Whether more pages exist after the SSR first page (F-1) */
  initialHasMore?: boolean
  /**
   * True total of active conversations from the count:'exact' query (D-04).
   * NEVER derive topbar counts from initialConversations.length — that's only
   * the first 50-row page now (RESEARCH P5).
   */
  totalCount?: number
  /** True unread total from the count:'exact' query (D-04) */
  unreadCount?: number
  /** Pre-select a conversation by ID (e.g., from URL param) */
  initialSelectedId?: string
  clientConfig?: ClientActivationConfig | null
  /**
   * Super-user flag (Phase 42.1, Decision #6). Resolved server-side
   * via `getIsSuperUser()` in `src/lib/auth/super-user.ts`. When false,
   * the production debug panel button is not rendered and the layout
   * behaves identically to before (Regla 6 — zero regression for
   * regular users).
   */
  isSuperUser?: boolean
  /**
   * UI Inbox v2 flag (Standalone ui-redesign-conversaciones, D-01/D-02).
   * Resolved server-side via `getIsInboxV2Enabled(workspaceId)` in
   * `src/lib/auth/inbox-v2.ts`. When false, the editorial re-skin is OFF
   * and the layout renders byte-identical to today (Regla 6 zero
   * regression). When true, the root div gets `.theme-editorial` class
   * which cascades all shadcn token overrides + custom paper/ink/rubric
   * tokens to the entire subtree.
   */
  v2?: boolean
  /**
   * UI Editorial v3 flag (Standalone ui-redesign-editorial-core, D-04/D-08).
   * Resolved server-side via `getIsEditorialV3Enabled(workspaceId)`. When
   * true, the inbox renders the verbatim editorial port (`.inbox` 3-column
   * grid, `.conv` rows, `.msg` Helvetica-Neue bubbles, `.ficha` contact card)
   * that resolves against the `.theme-editorial-v3` scope wired on the
   * dashboard `<main>` wrapper in Plan 00. Default false → byte-identical to
   * today (Regla 6). Independent from `v2` (distinct scope class).
   */
  v3?: boolean
}

/**
 * 3-column inbox layout:
 * - Left: Conversation list (w-80)
 * - Center: Chat view (flex-1)
 * - Right: Contact panel OR Agent config slider (w-80, collapsible)
 */
export function InboxLayout({
  workspaceId,
  initialConversations,
  initialCursor,
  initialHasMore,
  totalCount,
  unreadCount,
  initialSelectedId,
  clientConfig,
  isSuperUser = false,
  v2 = false,
  v3 = false,
}: InboxLayoutProps) {
  // F-7 (D-21): `selectedConversationId` is the SINGLE source of truth for the
  // open conversation. `selectedConversation` (the object) is always DERIVED —
  // never a parallel `useState` that could drift from the id (the class behind
  // header/content divergence + the old null-object bug). Two sources feed the
  // derivation:
  //   - `listSelectedConversation`: the loaded-list object for the selected id,
  //     pushed up from `ConversationList` (where the `useConversations` hook +
  //     its `getConversationById` live, post-Plan-05/06) on select and on every
  //     realtime field change. Authoritative copy — always wins.
  //   - `fetchedConversation`: a fetch-by-id fallback for an id not in any
  //     loaded page (e.g. an outbound-only conversation deep-linked via `?c=`).
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialSelectedId || null)
  const initialListSelected = initialSelectedId
    ? initialConversations.find(c => c.id === initialSelectedId)
    : undefined
  const [listSelectedConversation, setListSelectedConversation] =
    useState<ConversationWithDetails | undefined>(initialListSelected)
  const [fetchedConversation, setFetchedConversation] =
    useState<ConversationWithDetails | null>(null)
  // DERIVED object — list copy wins over the fetch-by-id fallback (one source
  // for header + content, by construction). Never independently `set`.
  const selectedConversation = deriveSelectedConversation(
    listSelectedConversation,
    fetchedConversation,
  )
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [rightPanel, setRightPanel] = useState<RightPanel>('contact')
  const [refreshOrdersFn, setRefreshOrdersFn] = useState<() => Promise<void>>(() => noopRefreshOrders)
  // Phase 42.1: production debug panel toggle (super-user only)
  const [debugPanelOpen, setDebugPanelOpen] = useState(false)
  // Editorial-v3 topbar action: trigger ConversationList's new-conversation modal.
  const [openNewConversationFn, setOpenNewConversationFn] = useState<() => void>(() => () => {})

  // Callback to sync the selected conversation's LIST object from the child
  // (ConversationList) — fired on select and whenever realtime mutates the
  // selected row's display fields. Stores the authoritative list copy that the
  // derivation prefers; the fetch-by-id effect clears the stale fallback.
  const handleConversationUpdatedFromList = useCallback((conversation: ConversationWithDetails) => {
    setListSelectedConversation(conversation)
  }, [])

  // Handle conversation selection — flows through the id only (single source of
  // truth). The child passes the list object on explicit select; we store it as
  // the list copy so the chat opens instantly without a fetch round-trip.
  const handleSelectConversation = useCallback(async (id: string | null, conversation?: ConversationWithDetails) => {
    setSelectedConversationId(id)
    setListSelectedConversation(conversation ?? undefined)
    // Sync URL so the link is shareable
    window.history.replaceState(null, '', id ? `/whatsapp?c=${id}` : '/whatsapp')
    if (id) {
      // Mark as read in background (don't await to keep UI snappy)
      markAsRead(id).catch(console.error)
    }
  }, [])

  // Fetch-by-id fallback (D-21): when the selected id is NOT covered by the
  // loaded list (e.g. an outbound-only conversation deep-linked via `?c=` that
  // never replied, so it's outside page 1), fetch it so the chat can render it.
  // Deps include `listSelectedConversation` (NOT []) so this re-derives when the
  // selection changes OR when the id later arrives in a page load (at which
  // point the list copy supersedes the fetched one and we clear the fallback).
  // The `cancelled` guard avoids a stale set on rapid switching.
  useEffect(() => {
    if (!shouldFetchById(selectedConversationId, listSelectedConversation)) {
      setFetchedConversation(null)
      return
    }
    let cancelled = false
    getConversation(selectedConversationId as string).then((conv) => {
      if (!cancelled) setFetchedConversation(conv)
    })
    return () => {
      cancelled = true
    }
  }, [selectedConversationId, listSelectedConversation])

  // Refresh selected conversation data (called after contact/order creation).
  // Re-derives by refreshing whichever source currently backs the selection:
  // the list copy if present (so the chat header stays the authoritative source),
  // else the fetch-by-id fallback.
  const refreshSelectedConversation = useCallback(async () => {
    if (!selectedConversationId) return
    const updated = await getConversation(selectedConversationId)
    if (!updated) return
    if (listSelectedConversation) {
      setListSelectedConversation(updated)
    } else {
      setFetchedConversation(updated)
    }
  }, [selectedConversationId, listSelectedConversation])

  // Handle refreshOrders function from ConversationList
  const handleRefreshOrdersReady = useCallback((fn: () => Promise<void>) => {
    setRefreshOrdersFn(() => fn)
  }, [])

  // Receive the new-conversation modal trigger from ConversationList (v3 topbar).
  const handleOpenNewConversationReady = useCallback((fn: () => void) => {
    setOpenNewConversationFn(() => fn)
  }, [])

  // Open agent config slider (replaces contact panel)
  const handleOpenAgentConfig = useCallback(() => {
    setRightPanel('agent-config')
    setIsPanelOpen(true)
  }, [])

  // Close agent config slider (returns to contact panel)
  const handleCloseAgentConfig = useCallback(() => {
    setRightPanel('contact')
  }, [])

  // Keyboard shortcut: 'Escape' closes the contact-panel drawer when the viewport
  // is narrow enough that the panel behaves as an overlay (<1280px per UI-SPEC §10.1).
  // Scoped to focus inside [data-module="whatsapp"] + ignored on input/textarea/
  // contenteditable so composer behavior is untouched. Only active when v2.
  // Does NOT attempt to close modals/dropdowns (Radix handles Esc natively) nor
  // to blur the composer textarea — those flows remain standard browser behavior.
  useEffect(() => {
    if (!v2) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
      if (!target.closest('[data-module="whatsapp"]')) return
      if (typeof window !== 'undefined' && window.innerWidth < 1280 && isPanelOpen) {
        e.preventDefault()
        setIsPanelOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [v2, isPanelOpen])

  // ===================== EDITORIAL V3 (verbatim port) =====================
  // Renders the canonical `ui_kits/conversaciones/index.html` 3-column inbox
  // grid (`.inbox` 340px / 1fr / 300px). The class strings resolve against the
  // `.theme-editorial-v3` block (globals.css, Plan 00) wired on the dashboard
  // `<main>` wrapper. The third column shows the contact `.ficha` always (the
  // mock layout); the agent-config slider replaces it when opened. ALL data
  // wiring (Supabase, server actions, realtime, event handlers) is preserved —
  // the children are the SAME real components, only laid out per the mock grid.
  if (v3) {
    // Count summary for the topbar `<em>` subtitle — TRUE totals from the
    // server count:'exact' query (D-04). initialConversations is only the
    // first 50-row page now and would UNDERCOUNT (RESEARCH P5). Fallbacks
    // keep older callers rendering something sane.
    const openCount = totalCount ?? initialConversations.length
    const unreadTopbarCount = unreadCount ?? initialConversations.filter((c) => !c.is_read).length

    return (
      <InboxV3Provider v3={v3}>
        {/* GAP-05 (height fill): `whatsapp/layout.tsx` wraps the page in a plain
            block `h-full` div (NOT flex), so the `.inbox` `flex:1` had no flex
            parent → the grid sized to content, leaving empty space below and the
            composer floating "too high". This flex-column anchor mirrors the v2
            path's `<div className="flex h-full">`: the topbar stays auto-height
            and `.inbox` fills the remaining height. */}
        <div className="flex flex-col h-full min-h-0">
        {/* ---------- TOPBAR (.topbar) — outside the .inbox grid, per the mock ---------- */}
        <header className="topbar">
          <div>
            <div className="eye">Agentes · Bandeja</div>
            <h1>
              Conversaciones{' '}
              <em>{openCount} abiertas · {unreadTopbarCount} sin leer</em>
            </h1>
          </div>
          <div className="actions">
            {/* GAP-02: "Nueva conversación" es la única acción del topbar. La
                asignación de conversaciones vive en el `AssignDropdown` por
                conversación dentro del `.th-head` (chat-header). El botón
                "Asignar" del topbar estaba mal cableado al toggle de la ficha;
                se elimina (no había flujo de asignación a nivel topbar). */}
            {/* Toggle de tema (light/dark/system) — vive en el topbar del módulo
                (D-04 ui-redesign-editorial-shell): consistente en las 3 pantallas v3
                (Conversaciones / Contactos / Pedidos). NO va en el sidebar (D-07). */}
            <ThemeToggle />
            <button type="button" className="btn pri" onClick={() => openNewConversationFn()}>
              Nueva conversación
            </button>
          </div>
        </header>

        {/* GAP-02: cuando la ficha está cerrada, el grid colapsa a 2 columnas
            (340px / 1fr) vía `.inbox.no-ficha`. La ficha (o el agent-config
            slider) se renderiza sólo cuando `isPanelOpen`. */}
        <div
          className={cn('inbox', !isPanelOpen && 'no-ficha')}
          data-module="whatsapp"
        >
          {/* ---------- LISTA (.conv-col) ---------- */}
          <ConversationList
            workspaceId={workspaceId}
            initialConversations={initialConversations}
            initialCursor={initialCursor}
            initialHasMore={initialHasMore}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            onSelectedUpdated={handleConversationUpdatedFromList}
            onRefreshOrdersReady={handleRefreshOrdersReady}
            onOpenNewConversationReady={handleOpenNewConversationReady}
            clientConfig={clientConfig}
          />

          {/* ---------- HILO (.thread) — optionally split with debug panel ---------- */}
          {debugPanelOpen && isSuperUser && selectedConversationId ? (
            <div className="min-w-0">
              <Allotment>
                <Allotment.Pane minSize={400}>
                  <ChatView
                    workspaceId={workspaceId}
                    conversationId={selectedConversationId}
                    conversation={selectedConversation}
                    onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
                    isPanelOpen={isPanelOpen}
                    onOpenAgentConfig={handleOpenAgentConfig}
                    onToggleDebug={() => setDebugPanelOpen((o) => !o)}
                    isDebugOpen={debugPanelOpen}
                  />
                </Allotment.Pane>
                <Allotment.Pane minSize={320} preferredSize={520}>
                  <DebugPanelProduction conversationId={selectedConversationId} />
                </Allotment.Pane>
              </Allotment>
            </div>
          ) : (
            <ChatView
              workspaceId={workspaceId}
              conversationId={selectedConversationId}
              conversation={selectedConversation}
              onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
              isPanelOpen={isPanelOpen}
              onOpenAgentConfig={handleOpenAgentConfig}
              onToggleDebug={
                isSuperUser ? () => setDebugPanelOpen((o) => !o) : undefined
              }
              isDebugOpen={debugPanelOpen}
            />
          )}

          {/* ---------- FICHA (.ficha) — GAP-02: oculta por default, se abre con
                el toggle del .th-head. Cuando está cerrada no se renderiza nada
                en la 3ª celda y el grid colapsa a 2 columnas (.no-ficha). El
                agent-config slider también pone isPanelOpen=true, así que este
                gate cubre ambos casos. ---------- */}
          {isPanelOpen &&
            (rightPanel === 'agent-config' ? (
              <AgentConfigSlider
                workspaceId={workspaceId}
                onClose={handleCloseAgentConfig}
              />
            ) : (
              <ContactPanel
                key={selectedConversationId || 'none'}
                conversation={selectedConversation}
                onClose={() => setIsPanelOpen(false)}
                onConversationUpdated={refreshSelectedConversation}
                onOrdersChanged={refreshOrdersFn}
              />
            ))}
        </div>
        </div>
      </InboxV3Provider>
    )
  }

  return (
    <InboxV2Provider v2={v2}>
      <div className={cn('flex h-full', v2 && 'theme-editorial')} data-module="whatsapp">
        {/* Left column: Conversation list */}
        <div className="w-80 flex-shrink-0 border-r bg-background">
          <ConversationList
            workspaceId={workspaceId}
            initialConversations={initialConversations}
            initialCursor={initialCursor}
            initialHasMore={initialHasMore}
            selectedId={selectedConversationId}
            onSelect={handleSelectConversation}
            onSelectedUpdated={handleConversationUpdatedFromList}
            onRefreshOrdersReady={handleRefreshOrdersReady}
            clientConfig={clientConfig}
          />
        </div>

        {/* Center column: Chat view — optionally split with production debug panel */}
        {debugPanelOpen && isSuperUser && selectedConversationId ? (
          <div className="flex-1 min-w-0">
            <Allotment>
              <Allotment.Pane minSize={400}>
                <ChatView
                  workspaceId={workspaceId}
                  conversationId={selectedConversationId}
                  conversation={selectedConversation}
                  onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
                  onOpenAgentConfig={handleOpenAgentConfig}
                  onToggleDebug={() => setDebugPanelOpen((o) => !o)}
                  isDebugOpen={debugPanelOpen}
                />
              </Allotment.Pane>
              <Allotment.Pane minSize={320} preferredSize={520}>
                <DebugPanelProduction conversationId={selectedConversationId} />
              </Allotment.Pane>
            </Allotment>
          </div>
        ) : (
          <ChatView
            workspaceId={workspaceId}
            conversationId={selectedConversationId}
            conversation={selectedConversation}
            onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
            onOpenAgentConfig={handleOpenAgentConfig}
            onToggleDebug={
              isSuperUser ? () => setDebugPanelOpen((o) => !o) : undefined
            }
            isDebugOpen={debugPanelOpen}
          />
        )}

        {/* Right column: Contact panel or Agent config slider (conditional render) */}
        {isPanelOpen && (
          <div className="w-80 flex-shrink-0 border-l bg-background">
            {rightPanel === 'agent-config' ? (
              <AgentConfigSlider
                workspaceId={workspaceId}
                onClose={handleCloseAgentConfig}
              />
            ) : (
              <ContactPanel
                key={selectedConversationId || 'none'}
                conversation={selectedConversation}
                onClose={() => setIsPanelOpen(false)}
                onConversationUpdated={refreshSelectedConversation}
                onOrdersChanged={refreshOrdersFn}
              />
            )}
          </div>
        )}
      </div>
    </InboxV2Provider>
  )
}
