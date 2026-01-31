'use client'

import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react'
import { Paperclip, Smile, Send, Lock, FileType } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmojiPicker } from './emoji-picker'
import { sendMessage, sendMediaMessage } from '@/app/actions/messages'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface MessageInputProps {
  conversationId: string
  isWindowOpen: boolean
  onSend?: () => void
}

// Accepted file types
const ACCEPTED_FILES = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx'

// Max file size (16MB for WhatsApp)
const MAX_FILE_SIZE = 16 * 1024 * 1024

/**
 * Message input with emoji picker and file attachments.
 * When window is closed, shows disabled state with template button.
 */
export function MessageInput({
  conversationId,
  isWindowOpen,
  onSend,
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle text change
  const handleTextChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
  }, [])

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setText((prev) => prev + emoji)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = text.slice(0, start)
    const after = text.slice(end)

    setText(before + emoji + after)
    setShowEmojiPicker(false)

    // Move cursor after emoji
    setTimeout(() => {
      textarea.focus()
      const newPos = start + emoji.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }, [text])

  // Handle send message
  const handleSend = useCallback(async () => {
    const trimmedText = text.trim()
    if (!trimmedText || isLoading) return

    setIsLoading(true)
    try {
      const result = await sendMessage(conversationId, trimmedText)

      if ('error' in result) {
        toast.error(result.error)
      } else {
        setText('')
        onSend?.()
      }
    } catch (error) {
      toast.error('Error al enviar mensaje')
    } finally {
      setIsLoading(false)
    }
  }, [conversationId, text, isLoading, onSend])

  // Handle keyboard events
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter creates newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Handle file selection
  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('El archivo es muy grande (max 16MB)')
      return
    }

    setIsLoading(true)
    try {
      // Convert file to base64
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')

      const result = await sendMediaMessage(
        conversationId,
        base64,
        file.name,
        file.type
      )

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Archivo enviado')
        onSend?.()
      }
    } catch (error) {
      toast.error('Error al enviar archivo')
    } finally {
      setIsLoading(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [conversationId, onSend])

  // Disabled state when window closed
  if (!isWindowOpen) {
    return (
      <div className="flex-shrink-0 px-4 py-3 border-t bg-muted/20">
        <div className="flex items-center gap-3">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              Ventana de 24h cerrada
            </p>
          </div>
          <Button variant="outline" size="sm" disabled>
            <FileType className="h-4 w-4 mr-2" />
            Usar template
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 px-4 py-3 border-t bg-background">
      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILES}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Attach file button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 flex-shrink-0"
          onClick={handleFileClick}
          disabled={isLoading}
          title="Adjuntar archivo"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        {/* Emoji picker button */}
        <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              disabled={isLoading}
              title="Emojis"
            >
              <Smile className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="p-0 w-auto border-none shadow-lg"
          >
            <EmojiPicker onSelect={handleEmojiSelect} />
          </PopoverContent>
        </Popover>

        {/* Text input */}
        <div className="flex-1 min-w-0">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            disabled={isLoading}
            className={cn(
              'min-h-[40px] max-h-[120px] resize-none py-2',
              'focus-visible:ring-1'
            )}
            rows={1}
          />
        </div>

        {/* Send button */}
        <Button
          size="icon"
          className="h-10 w-10 flex-shrink-0"
          onClick={handleSend}
          disabled={!text.trim() || isLoading}
          title="Enviar mensaje"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
