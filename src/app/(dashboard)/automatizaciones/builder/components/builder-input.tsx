'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Input
// Textarea input that expands up to 4 lines.
// Enter submits, Shift+Enter adds newline.
// ============================================================================

import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BuilderInputProps {
  onSubmit: (text: string) => void
  isLoading: boolean
}

export function BuilderInput({ onSubmit, isLoading }: BuilderInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)

    // Reset height to auto to measure scrollHeight correctly
    const textarea = e.target
    textarea.style.height = 'auto'
    // Clamp to max 4 lines (~96px with 24px line-height)
    const maxHeight = 96
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  // Handle Enter (submit) vs Shift+Enter (newline)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (input.trim() && !isLoading) {
          onSubmit(input)
          setInput('')
          // Reset textarea height
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
          }
        }
      }
    },
    [input, isLoading, onSubmit]
  )

  const handleSubmitClick = useCallback(() => {
    if (input.trim() && !isLoading) {
      onSubmit(input)
      setInput('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [input, isLoading, onSubmit])

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Describe tu automatizacion..."
        disabled={isLoading}
        rows={1}
        className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        style={{ minHeight: '40px' }}
      />
      <Button
        size="icon"
        onClick={handleSubmitClick}
        disabled={!input.trim() || isLoading}
        className="shrink-0 h-10 w-10"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
