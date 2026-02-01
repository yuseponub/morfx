'use client'

import { useState, useEffect, useRef, useCallback, forwardRef, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { QuickReply } from '@/lib/whatsapp/types'
import { searchQuickReplies } from '@/app/actions/quick-replies'

interface QuickReplyAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onSelectWithMedia?: (reply: QuickReply) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

interface SuggestionPosition {
  top: number
  left: number
}

/**
 * Custom autocomplete component for quick replies.
 * Triggers when user types "/" and shows matching quick replies.
 * Supports keyboard navigation (Up/Down/Enter/Escape).
 */
export const QuickReplyAutocomplete = forwardRef<
  HTMLTextAreaElement,
  QuickReplyAutocompleteProps
>(({ value, onChange, onSend, onSelectWithMedia, placeholder, disabled, className }, ref) => {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<QuickReply[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [triggerStart, setTriggerStart] = useState<number | null>(null)

  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Extract the search query after /
  const getSearchQuery = useCallback(() => {
    if (triggerStart === null) return null
    const query = value.slice(triggerStart + 1) // +1 to skip the /
    // Stop if there's a space (user finished typing the shortcut)
    if (query.includes(' ')) return null
    return query
  }, [value, triggerStart])

  // Search for quick replies
  const searchReplies = useCallback(async (query: string) => {
    setLoading(true)
    try {
      const results = await searchQuickReplies(query)
      setSuggestions(results.slice(0, 5))
      setSelectedIndex(0)
    } catch (error) {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Handle value changes and trigger detection
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart

    // Check if we're in a trigger context (typing after /)
    // Find the last / before cursor
    const textBeforeCursor = value.slice(0, cursorPos)
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/')

    // Check if the / is at start or after a space (not in middle of word)
    const isValidTrigger = lastSlashIndex >= 0 &&
      (lastSlashIndex === 0 || value[lastSlashIndex - 1] === ' ' || value[lastSlashIndex - 1] === '\n')

    if (isValidTrigger) {
      const queryAfterSlash = textBeforeCursor.slice(lastSlashIndex + 1)
      // Only show if no space in query (still typing shortcut)
      if (!queryAfterSlash.includes(' ') && !queryAfterSlash.includes('\n')) {
        setTriggerStart(lastSlashIndex)
        setShowSuggestions(true)

        // Debounce the search
        if (debounceRef.current) {
          clearTimeout(debounceRef.current)
        }
        debounceRef.current = setTimeout(() => {
          searchReplies(queryAfterSlash)
        }, 150)
        return
      }
    }

    // No valid trigger - hide suggestions
    setShowSuggestions(false)
    setTriggerStart(null)
    setSuggestions([])
  }, [value, textareaRef, searchReplies])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Select a suggestion
  const selectSuggestion = useCallback((reply: QuickReply) => {
    if (triggerStart === null) return

    // Replace /shortcut with the content
    const before = value.slice(0, triggerStart)
    const after = value.slice(textareaRef.current?.selectionStart || value.length)
    const newValue = before + reply.content + after

    onChange(newValue)
    setShowSuggestions(false)
    setTriggerStart(null)
    setSuggestions([])

    // If has media, notify parent to handle media sending
    if (reply.media_url && onSelectWithMedia) {
      onSelectWithMedia(reply)
    }

    // Focus textarea and move cursor to end of inserted content
    setTimeout(() => {
      const textarea = textareaRef.current
      if (textarea) {
        textarea.focus()
        const newCursorPos = before.length + reply.content.length
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }, [value, triggerStart, onChange, textareaRef, onSelectWithMedia])

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // When suggestions are shown, handle navigation
    if (showSuggestions && suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          )
          return

        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          )
          return

        case 'Enter':
          // Select current suggestion
          e.preventDefault()
          selectSuggestion(suggestions[selectedIndex])
          return

        case 'Escape':
          e.preventDefault()
          setShowSuggestions(false)
          setTriggerStart(null)
          return

        case 'Tab':
          // Tab also selects current suggestion
          e.preventDefault()
          selectSuggestion(suggestions[selectedIndex])
          return
      }
    }

    // Enter sends message (when no suggestions shown)
    if (e.key === 'Enter' && !e.shiftKey && !showSuggestions) {
      e.preventDefault()
      onSend()
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && showSuggestions) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, showSuggestions])

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-none',
          className
        )}
        rows={1}
      />

      {/* Autocomplete dropdown */}
      {showSuggestions && (suggestions.length > 0 || loading) && (
        <div
          className={cn(
            'absolute bottom-full left-0 right-0 mb-1 z-50',
            'bg-popover border border-border rounded-md shadow-md',
            'overflow-hidden'
          )}
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Buscando...
            </div>
          ) : (
            <div ref={listRef} className="max-h-[200px] overflow-y-auto">
              {suggestions.map((reply, index) => (
                <div
                  key={reply.id}
                  className={cn(
                    'px-3 py-2 cursor-pointer transition-colors',
                    index === selectedIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  )}
                  onClick={() => selectSuggestion(reply)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      /{reply.shortcut}
                    </code>
                    {reply.media_url && (
                      <span className="text-xs text-muted-foreground">📷</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {reply.media_url && reply.media_type === 'image' && (
                      <img
                        src={reply.media_url}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {reply.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

QuickReplyAutocomplete.displayName = 'QuickReplyAutocomplete'
