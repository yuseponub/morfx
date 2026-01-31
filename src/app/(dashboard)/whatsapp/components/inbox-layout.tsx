'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ConversationList } from './conversation-list'
import { ContactPanel } from './contact-panel'
import { ChatView } from './chat-view'
import { markAsRead } from '@/app/actions/conversations'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

interface InboxLayoutProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
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
}: InboxLayoutProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(true)

  // Handle conversation selection - receives conversation from list
  const handleSelectConversation = useCallback(async (id: string | null, conversation?: ConversationWithDetails) => {
    setSelectedConversationId(id)
    setSelectedConversation(conversation || null)
    if (id) {
      // Mark as read in background (don't await to keep UI snappy)
      markAsRead(id).catch(console.error)
    }
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
        />
      </div>
    </div>
  )
}
