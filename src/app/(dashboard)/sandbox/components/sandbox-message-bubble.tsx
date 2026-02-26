'use client'

/**
 * Sandbox Message Bubble Component
 * Phase 15: Agent Sandbox
 *
 * Message bubble with INVERTED theme from real inbox:
 * - User messages (playing as customer): right side, primary color
 * - Agent messages: left side, muted color
 *
 * This is opposite of the real inbox where own messages are outbound (agent)
 * and received are customer. Here we're simulating being the customer.
 */

import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { SandboxMessage } from '@/lib/sandbox/types'

// Regex to detect image URLs in message content
const IMAGE_URL_REGEX = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s]*)?)/gi

/** Render message content with inline images for detected image URLs */
function MessageContent({ content }: { content: string }) {
  const parts = content.split(IMAGE_URL_REGEX)

  if (parts.length === 1) {
    // No image URLs found — render as plain text
    return <p className="whitespace-pre-line break-words">{content}</p>
  }

  return (
    <div className="space-y-1">
      {parts.map((part, i) => {
        if (IMAGE_URL_REGEX.test(part)) {
          // Reset regex lastIndex (global flag)
          IMAGE_URL_REGEX.lastIndex = 0
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={part}
              alt="Media"
              className="rounded-md max-w-full max-h-60 object-contain my-1"
              loading="lazy"
            />
          )
        }
        const trimmed = part.trim()
        if (!trimmed) return null
        return <p key={i} className="whitespace-pre-line break-words">{trimmed}</p>
      })}
    </div>
  )
}

interface SandboxMessageBubbleProps {
  message: SandboxMessage
}

export function SandboxMessageBubble({ message }: SandboxMessageBubbleProps) {
  // In sandbox: user = customer (right), assistant = agent (left)
  const isUser = message.role === 'user'

  // Format timestamp as HH:MM:SS per CONTEXT.md requirement
  const timestamp = format(new Date(message.timestamp), 'HH:mm:ss')

  return (
    <div
      className={cn(
        'flex px-4 py-1',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'relative max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-none' // User = right, primary
            : 'bg-muted rounded-bl-none' // Agent = left, muted
        )}
      >
        {/* Message content */}
        <div className="text-sm">
          <MessageContent content={message.content} />
        </div>

        {/* Timestamp - always visible per CONTEXT.md */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          <span
            className={cn(
              'text-[10px]',
              isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {timestamp}
          </span>
        </div>
      </div>
    </div>
  )
}
