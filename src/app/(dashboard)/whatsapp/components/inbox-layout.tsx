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
import { markAsRead, getConversation } from '@/app/actions/conversations'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'
import type { ClientActivationConfig } from '@/lib/domain/client-activation'

// No-op function for initial state
const noopRefreshOrders = async () => {}

type RightPanel = 'contact' | 'agent-config'

interface InboxLayoutProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
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
  initialSelectedId,
  clientConfig,
  isSuperUser = false,
  v2 = false,
}: InboxLayoutProps) {
  // Initialize with pre-selected conversation if provided
  const initialConversation = initialSelectedId
    ? initialConversations.find(c => c.id === initialSelectedId) || null
    : null

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialSelectedId || null)
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(initialConversation)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [rightPanel, setRightPanel] = useState<RightPanel>('contact')
  const [refreshOrdersFn, setRefreshOrdersFn] = useState<() => Promise<void>>(() => noopRefreshOrders)
  // Phase 42.1: production debug panel toggle (super-user only)
  const [debugPanelOpen, setDebugPanelOpen] = useState(false)

  // Callback to sync selected conversation from list updates (realtime)
  const handleConversationUpdatedFromList = useCallback((conversation: ConversationWithDetails) => {
    setSelectedConversation(conversation)
  }, [])

  // Handle conversation selection - receives conversation from list
  const handleSelectConversation = useCallback(async (id: string | null, conversation?: ConversationWithDetails) => {
    setSelectedConversationId(id)
    setSelectedConversation(conversation || null)
    // Sync URL so the link is shareable
    window.history.replaceState(null, '', id ? `/whatsapp?c=${id}` : '/whatsapp')
    if (id) {
      // Mark as read in background (don't await to keep UI snappy)
      markAsRead(id).catch(console.error)
    }
  }, [])

  // If we have an initialSelectedId but it's not in the pre-loaded list
  // (e.g., outbound-only conversation where customer hasn't replied),
  // fetch it directly from DB so the chat view can display it.
  useEffect(() => {
    if (selectedConversationId && !selectedConversation) {
      getConversation(selectedConversationId).then((conv) => {
        if (conv) setSelectedConversation(conv)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh selected conversation data (called after contact/order creation)
  const refreshSelectedConversation = useCallback(async () => {
    if (!selectedConversationId) return
    const updated = await getConversation(selectedConversationId)
    if (updated) {
      setSelectedConversation(updated)
    }
  }, [selectedConversationId])

  // Handle refreshOrders function from ConversationList
  const handleRefreshOrdersReady = useCallback((fn: () => Promise<void>) => {
    setRefreshOrdersFn(() => fn)
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

  return (
    <InboxV2Provider v2={v2}>
      <div className={cn('flex h-full', v2 && 'theme-editorial')} data-module="whatsapp">
        {/* Left column: Conversation list */}
        <div className="w-80 flex-shrink-0 border-r bg-background">
          <ConversationList
            workspaceId={workspaceId}
            initialConversations={initialConversations}
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
