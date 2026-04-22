'use client'

import { cn } from '@/lib/utils'
import { Bot, Check, User } from 'lucide-react'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Badge } from '@/components/ui/badge'
import { RelativeTime } from '@/components/ui/relative-time'
import { getStageEmoji, type StageWithOrderState } from '@/lib/orders/stage-phases'
import { useInboxV2 } from './inbox-v2-context'
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
  /** Show client activation badge on avatar */
  showClientBadge?: boolean
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
  showClientBadge = false,
}: ConversationItemProps) {
  const v2 = useInboxV2()
  const displayName = conversation.contact?.name || conversation.profile_name || conversation.phone
  const preview = conversation.last_message_preview || 'Sin mensajes'

  // Always show last_customer_message_at (blue + User icon), fallback to last_message_at
  const timerDate = conversation.last_customer_message_at || conversation.last_message_at
  const isCustomerTimer = !!conversation.last_customer_message_at

  // Unread state — drives editorial weight on preview text
  const hasUnread = !conversation.is_read

  // Tags from linked contact (source of truth)
  const conversationTags = conversation.tags || []

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
      role="listitem"
      aria-selected={isSelected}
      aria-current={isSelected || undefined}
      className={cn(
        'w-full text-left transition-colors',
        v2
          ? cn(
              'border-b border-[var(--border)] hover:bg-[var(--paper-2)]',
              isSelected
                ? 'bg-[var(--paper-0)] border-l-[3px] border-l-[var(--rubric-2)] py-3 pr-4 pl-[13px]'
                : 'p-3'
            )
          : cn(
              'p-3 border-b hover:bg-muted/50',
              isSelected && 'bg-muted'
            )
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Avatar with emoji indicator + Name and unread badge */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Avatar with optional emoji indicator (Callbell style) */}
          <div className="relative flex-shrink-0">
            {/* Avatar circle with initials */}
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center',
                v2
                  ? 'bg-[var(--paper-3)] border border-[var(--ink-1)]'
                  : 'bg-primary/20'
              )}
            >
              <span
                className={cn(
                  v2
                    ? 'text-[var(--ink-1)]'
                    : 'text-sm font-medium text-primary'
                )}
                style={
                  v2
                    ? { fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.02em' }
                    : undefined
                }
              >
                {getInitials(displayName)}
              </span>
            </div>
            {/* Emoji indicator on top-right corner */}
            {primaryEmoji && (
              <span className="absolute -top-1 -right-1 text-sm leading-none bg-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm border border-gray-100">
                {primaryEmoji}
              </span>
            )}
            {/* Client badge on bottom-left */}
            {showClientBadge && (
              <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shadow-sm border border-white" title="Cliente">
                <Check className="h-2.5 w-2.5 text-white" />
              </span>
            )}
            {/* Bot overlay when agent is active */}
            {conversation.agent_conversational === true && (
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-sm border border-white">
                <Bot className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </div>

          {/* Name, channel icon, and unread badge */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Channel icon */}
            {conversation.channel === 'facebook' && (
              <span title="Facebook Messenger" className="flex-shrink-0">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.018 1.793-4.685 4.533-4.685 1.313 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.274h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </svg>
              </span>
            )}
            {conversation.channel === 'instagram' && (
              <span title="Instagram" className="flex-shrink-0">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-gradient)" strokeWidth="2" />
                  <circle cx="12" cy="12" r="5" stroke="url(#ig-gradient)" strokeWidth="2" />
                  <circle cx="18" cy="6" r="1.5" fill="url(#ig-gradient)" />
                  <defs>
                    <linearGradient id="ig-gradient" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FD1D1D" />
                      <stop offset="0.5" stopColor="#E1306C" />
                      <stop offset="1" stopColor="#C13584" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            )}
            <span
              className={cn(
                'truncate',
                v2
                  ? cn(
                      'text-[14px] tracking-[-0.005em] text-[var(--ink-1)]',
                      hasUnread ? 'font-semibold' : 'font-semibold'
                    )
                  : cn(
                      'text-sm font-medium',
                      !conversation.is_read && 'font-semibold'
                    )
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              {displayName}
            </span>
            {conversation.unread_count > 0 && (
              v2 ? (
                conversation.unread_count <= 9 ? (
                  <span
                    className="h-2 w-2 rounded-full bg-[var(--rubric-2)] flex-shrink-0"
                    aria-label={`${conversation.unread_count} sin leer`}
                  />
                ) : (
                  <span
                    className="flex-shrink-0 inline-flex items-center justify-center h-[22px] min-w-[22px] rounded-full bg-[var(--ink-1)] px-1.5 text-[11px] text-[var(--paper-0)]"
                    style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                    aria-label={`${conversation.unread_count} sin leer`}
                  >
                    {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                  </span>
                )
              ) : (
                <span className="flex-shrink-0 inline-flex items-center justify-center h-[22px] min-w-[22px] px-1.5 text-xs font-semibold text-white bg-primary rounded-full">
                  {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                </span>
              )
            )}
          </div>
        </div>

        {/* Timestamp — single line, client-only to avoid hydration mismatch */}
        {timerDate && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {isCustomerTimer && (
              <User className={cn('h-3 w-3', v2 ? 'text-[var(--ink-3)]' : 'text-blue-500')} />
            )}
            {v2 ? (
              <span
                className="text-[11px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, letterSpacing: '0.02em' }}
              >
                <RelativeTime date={timerDate} />
              </span>
            ) : (
              <RelativeTime
                date={timerDate}
                className={cn(
                  'text-xs',
                  isCustomerTimer ? 'text-blue-500' : 'text-muted-foreground'
                )}
              />
            )}
          </div>
        )}
      </div>

      {/* Last message preview */}
      <p
        className={cn(
          'mt-1 truncate',
          v2
            ? cn(
                'text-[13px] leading-[1.4]',
                hasUnread ? 'text-[var(--ink-1)] font-medium' : 'text-[var(--ink-2)]'
              )
            : cn(
                'text-sm',
                conversation.is_read ? 'text-muted-foreground' : 'text-foreground'
              )
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        {preview}
      </p>

      {/* Assignment status and Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {/* Unassigned badge - shows for managers to identify chats needing attention */}
        {!conversation.assigned_to && (
          v2 ? (
            <span className="mx-tag mx-tag--ink">Sin asignar</span>
          ) : (
            <Badge variant="outline" className="text-xs font-normal">
              Sin asignar
            </Badge>
          )
        )}

        {/* Conversation-specific tags (direct) */}
        {conversationTags.slice(0, 2).map((tag) => (
          <TagBadge key={`conv-${tag.id}`} tag={tag} size="sm" />
        ))}

        {/* Overflow indicator */}
        {conversationTags.length > 2 && (
          v2 ? (
            <span className="mx-tag mx-tag--ink">+{conversationTags.length - 2}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              +{conversationTags.length - 2}
            </span>
          )
        )}
      </div>
    </button>
  )
}
