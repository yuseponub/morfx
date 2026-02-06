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
          <p className="whitespace-pre-line break-words">{message.content}</p>
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
