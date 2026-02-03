'use client'

import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Badge } from '@/components/ui/badge'
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

  // Format timestamp as relative time (e.g., "hace 5 min")
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: true,
        locale: es,
      })
    : null

  // Combine tags: conversation tags first, then contact tags (marked as inherited)
  const conversationTags = conversation.tags || []
  const contactTags = conversation.contactTags || []

  // Get primary order emoji for avatar indicator (first active order)
  const firstOrder = orders.find(o => !o.stage.is_closed)
  const primaryEmoji = firstOrder ? getStageEmoji(firstOrder.stage as StageWithOrderState) : null

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
              <span className="absolute -top-0.5 -right-0.5 text-xs leading-none">
                {primaryEmoji}
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

        {/* Timestamp (no inline order indicators - now on avatar) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {timeAgo && (
            <span className="text-xs text-muted-foreground">
              {timeAgo}
            </span>
          )}
        </div>
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
