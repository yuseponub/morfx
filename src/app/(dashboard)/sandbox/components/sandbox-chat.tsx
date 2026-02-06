'use client'

/**
 * Sandbox Chat Component
 * Phase 15: Agent Sandbox
 *
 * Chat panel with message list, typing indicator, and input.
 * Messages scroll to bottom on new message.
 */

import { useRef, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SandboxMessageBubble } from './sandbox-message-bubble'
import { SandboxInput } from './sandbox-input'
import { TypingIndicator } from './typing-indicator'
import type { SandboxMessage } from '@/lib/sandbox/types'

interface SandboxChatProps {
  messages: SandboxMessage[]
  isTyping: boolean
  onSendMessage: (content: string) => void
  agentId: string
  currentMode: string
}

export function SandboxChat({
  messages,
  isTyping,
  onSendMessage,
  currentMode,
}: SandboxChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Chat de prueba</span>
          <span className="text-xs text-muted-foreground">
            Modo: {currentMode}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="py-4 space-y-1">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Escribe un mensaje para iniciar la conversacion
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <SandboxMessageBubble key={message.id} message={message} />
              ))}
            </>
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="px-4 py-1">
              <TypingIndicator />
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <SandboxInput
        onSend={onSendMessage}
        disabled={isTyping}
        placeholder="Escribe como cliente..."
      />
    </div>
  )
}
