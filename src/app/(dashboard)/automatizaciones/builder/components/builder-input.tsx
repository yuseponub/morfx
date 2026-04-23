'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Input
// Textarea input that expands up to 4 lines.
// Enter submits, Shift+Enter adds newline.
// Accepts ref prop for external focus control (React 19 pattern).
// ============================================================================

import {
  useState,
  useRef,
  useCallback,
  useImperativeHandle,
  type KeyboardEvent,
  type ChangeEvent,
  type Ref,
} from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

export interface BuilderInputProps {
  onSubmit: (text: string) => void
  isLoading: boolean
  ref?: Ref<HTMLTextAreaElement>
}

export function BuilderInput({ onSubmit, isLoading, ref }: BuilderInputProps) {
  const v2 = useDashboardV2()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Expose the internal textarea ref to the parent via ref prop
  useImperativeHandle(ref, () => textareaRef.current!, [])

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
        placeholder={v2 ? 'Describe el flujo que quieres crear…' : 'Describe tu automatizacion...'}
        disabled={isLoading}
        rows={1}
        className={cn(
          'flex-1 resize-none px-3 py-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
          v2
            ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-2)] text-[14px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:ring-[var(--ink-1)]'
            : 'rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:ring-ring'
        )}
        style={{ minHeight: '40px', ...(v2 ? { fontFamily: 'var(--font-sans)' } : {}) }}
      />
      <Button
        size="icon"
        onClick={handleSubmitClick}
        disabled={!input.trim() || isLoading}
        className={cn(
          'shrink-0 h-10 w-10',
          v2 &&
            'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] rounded-none'
        )}
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
