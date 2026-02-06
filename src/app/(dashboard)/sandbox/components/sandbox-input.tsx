'use client'

/**
 * Sandbox Input Component
 * Phase 15: Agent Sandbox
 *
 * Message input fixed at bottom of chat panel.
 * Simple text input with send button.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface SandboxInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function SandboxInput({ onSend, disabled, placeholder }: SandboxInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed || disabled) return

    onSend(trimmed)
    setMessage('')

    // Focus back on textarea
    textareaRef.current?.focus()
  }, [message, disabled, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }, [message])

  return (
    <div className="flex items-end gap-2 p-4 border-t bg-background">
      <Textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Escribe como cliente...'}
        disabled={disabled}
        className="min-h-[40px] max-h-[120px] resize-none"
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !message.trim()}
        size="icon"
        className="shrink-0"
      >
        <Send className="h-4 w-4" />
        <span className="sr-only">Enviar</span>
      </Button>
    </div>
  )
}
