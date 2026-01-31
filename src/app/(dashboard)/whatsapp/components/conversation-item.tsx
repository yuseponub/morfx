'use client'

import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Badge } from '@/components/ui/badge'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

interface ConversationItemProps {
  conversation: ConversationWithDetails
  isSelected: boolean
  onSelect: (id: string) => void
}

/**
 * Single conversation item in the inbox list.
 * Shows contact name/phone, last message preview, timestamp, and tags.
 */
export function ConversationItem({
  conversation,
  isSelected,
  onSelect,
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

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'w-full text-left p-3 border-b transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted'
      )}
    >
      <div className="flex items-start justify-between gap-2">
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

        {/* Timestamp */}
        {timeAgo && (
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {timeAgo}
          </span>
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

        {/* Tags */}
        {conversation.tags.slice(0, 3).map((tag) => (
          <TagBadge key={tag.id} tag={tag} size="sm" />
        ))}
        {conversation.tags.length > 3 && (
          <span className="text-xs text-muted-foreground">
            +{conversation.tags.length - 3}
          </span>
        )}
      </div>
    </button>
  )
}
