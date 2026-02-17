'use client'

import { useState, useCallback } from 'react'
import { ConversationList } from './conversation-list'
import { ContactPanel } from './contact-panel'
import { AgentConfigSlider } from './agent-config-slider'
import { ChatView } from './chat-view'
import { markAsRead, getConversation } from '@/app/actions/conversations'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

// No-op function for initial state
const noopRefreshOrders = async () => {}

type RightPanel = 'contact' | 'agent-config'

interface InboxLayoutProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
  /** Pre-select a conversation by ID (e.g., from URL param) */
  initialSelectedId?: string
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

  // Callback to sync selected conversation from list updates (realtime)
  const handleConversationUpdatedFromList = useCallback((conversation: ConversationWithDetails) => {
    setSelectedConversation(conversation)
  }, [])

  // Handle conversation selection - receives conversation from list
  const handleSelectConversation = useCallback(async (id: string | null, conversation?: ConversationWithDetails) => {
    setSelectedConversationId(id)
    setSelectedConversation(conversation || null)
    if (id) {
      // Mark as read in background (don't await to keep UI snappy)
      markAsRead(id).catch(console.error)
    }
  }, [])

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
        />
      </div>

      {/* Center column: Chat view */}
      <ChatView
        conversationId={selectedConversationId}
        conversation={selectedConversation}
        onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
        onOpenAgentConfig={handleOpenAgentConfig}
      />

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
