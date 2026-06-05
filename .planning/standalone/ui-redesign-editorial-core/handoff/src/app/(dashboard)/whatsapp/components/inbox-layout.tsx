'use client'

import { useState, useCallback, useEffect } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { ConversationList } from './conversation-list'
import { ContactPanel } from './contact-panel'
import { AgentConfigSlider } from './agent-config-slider'
import { ChatView } from './chat-view'
import { DebugPanelProduction } from './debug-panel-production'
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

  return (
    <div className="flex h-full">
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
  )
}
