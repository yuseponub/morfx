'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { ConversationList } from './conversation-list'
import { ContactPanel } from './contact-panel'
import { ChatView } from './chat-view'
import { markAsRead, getConversation } from '@/app/actions/conversations'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

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
 * - Right: Contact panel (w-80, collapsible)
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
  const [isPanelOpen, setIsPanelOpen] = useState(true)

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
        />
      </div>

      {/* Center column: Chat view */}
      <ChatView
        conversationId={selectedConversationId}
        conversation={selectedConversation}
        onTogglePanel={() => setIsPanelOpen(!isPanelOpen)}
      />

      {/* Right column: Contact panel (collapsible) */}
      <div
        className={cn(
          'flex-shrink-0 border-l bg-background transition-all duration-200',
          isPanelOpen ? 'w-80' : 'w-0 overflow-hidden'
        )}
      >
        <ContactPanel
          conversation={selectedConversation}
          onClose={() => setIsPanelOpen(false)}
          onConversationUpdated={refreshSelectedConversation}
        />
      </div>
    </div>
  )
}
