'use client'

import { cn } from '@/lib/utils'
import { Bot, User } from 'lucide-react'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Badge } from '@/components/ui/badge'
import { RelativeTime } from '@/components/ui/relative-time'
import { getStageEmoji, type StageWithOrderState } from '@/lib/orders/stage-phases'
import type { ConversationWithDetails, OrderSummary } from '@/lib/whatsapp/types'

/**
 * Get initials from a name (up to 2 characters).
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0] || '')
    .join('')
    .toUpperCase()
}

interface ConversationItemProps {
  conversation: ConversationWithDetails
  isSelected: boolean
  onSelect: (id: string) => void
  /** Orders for this conversation's contact (for status indicators) */
  orders?: OrderSummary[]
}

/**
 * Single conversation item in the inbox list.
 * Shows contact name/phone, last message preview, timestamp, order indicators, and tags.
 */
export function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  orders = [],
}: ConversationItemProps) {
  const displayName = conversation.contact?.name || conversation.profile_name || conversation.phone
  const preview = conversation.last_message_preview || 'Sin mensajes'

  // Use last_customer_message_at (blue) as primary, last_message_at (gray) as fallback
  // Both use RelativeTime (client-only) to avoid SSR hydration mismatch
  const timerDate = conversation.last_customer_message_at || conversation.last_message_at
  const isCustomerTimer = !!conversation.last_customer_message_at

  // Combine tags: conversation tags first, then contact tags (marked as inherited)
  const conversationTags = conversation.tags || []
  const contactTags = conversation.contactTags || []

  // Get primary order emoji for avatar indicator
  // Try to find first order with emoji (even if closed, if it has order_state configured)
  let primaryEmoji: string | null = null
  for (const order of orders) {
    const emoji = getStageEmoji(order.stage as StageWithOrderState)
    if (emoji) {
      primaryEmoji = emoji
      break
    }
  }

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'w-full text-left p-3 border-b transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Avatar with emoji indicator + Name and unread badge */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar with optional emoji indicator (Callbell style) */}
          <div className="relative flex-shrink-0">
            {/* Avatar circle with initials */}
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {getInitials(displayName)}
              </span>
            </div>
            {/* Emoji indicator on top-right corner */}
            {primaryEmoji && (
              <span className="absolute -top-1 -right-1 text-sm leading-none bg-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm border border-gray-100">
                {primaryEmoji}
              </span>
            )}
            {/* Bot overlay when agent is active */}
            {conversation.agent_conversational === true && (
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-sm border border-white">
                <Bot className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </div>

          {/* Name and unread badge */}
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              'font-medium truncate',
              !conversation.is_read && 'font-semibold'
            )}>
              {displayName}
            </span>
            {conversation.unread_count > 0 && (
              <span className="flex-shrink-0 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-semibold text-white bg-primary rounded-full">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            )}
          </div>
        </div>

        {/* Timestamp — single line, client-only to avoid hydration mismatch */}
        {timerDate && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {isCustomerTimer && <User className="h-3 w-3 text-blue-500" />}
            <RelativeTime
              date={timerDate}
              className={cn(
                'text-xs',
                isCustomerTimer ? 'text-blue-500' : 'text-muted-foreground'
              )}
            />
          </div>
        )}
      </div>

      {/* Last message preview */}
      <p className={cn(
        'mt-1 text-sm truncate',
        conversation.is_read ? 'text-muted-foreground' : 'text-foreground'
      )}>
        {preview}
      </p>

      {/* Assignment status and Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {/* Unassigned badge - shows for managers to identify chats needing attention */}
        {!conversation.assigned_to && (
          <Badge variant="outline" className="text-xs font-normal">
            Sin asignar
          </Badge>
        )}

        {/* Conversation-specific tags (direct) */}
        {conversationTags.slice(0, 2).map((tag) => (
          <TagBadge key={`conv-${tag.id}`} tag={tag} size="sm" />
        ))}

        {/* Contact tags (inherited) - shown with opacity to distinguish */}
        {contactTags.slice(0, 2).map((tag) => (
          <TagBadge
            key={`contact-${tag.id}`}
            tag={tag}
            size="sm"
            className="opacity-60"
          />
        ))}

        {/* Overflow indicator */}
        {(conversationTags.length + contactTags.length) > 4 && (
          <span className="text-xs text-muted-foreground">
            +{conversationTags.length + contactTags.length - 4}
          </span>
        )}
      </div>
    </button>
  )
}
