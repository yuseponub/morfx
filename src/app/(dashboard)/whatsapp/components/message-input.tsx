'use client'

import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react'
import { Paperclip, Smile, Send, Lock, FileType, X, File, Image as ImageIcon, Video, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmojiPicker } from './emoji-picker'
import { sendMessage, sendMediaMessage } from '@/app/actions/messages'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface MessageInputProps {
  conversationId: string
  isWindowOpen: boolean
  onSend?: () => void
}

interface AttachedFile {
  file: File
  preview: string | null
  base64: string
}

// Accepted file types
const ACCEPTED_FILES = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx'

// Max file size (16MB for WhatsApp)
const MAX_FILE_SIZE = 16 * 1024 * 1024

/**
 * Message input with emoji picker and file attachments.
 * Shows file preview before sending.
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
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
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

  // Handle send (text or media)
  const handleSend = useCallback(async () => {
    if (isLoading) return

    // If there's an attached file, send it
    if (attachedFile) {
      setIsLoading(true)
      try {
        const result = await sendMediaMessage(
          conversationId,
          attachedFile.base64,
          attachedFile.file.name,
          attachedFile.file.type,
          text.trim() || undefined // caption
        )

        if ('error' in result) {
          toast.error(result.error)
        } else {
          toast.success('Archivo enviado')
          setAttachedFile(null)
          setText('')
          onSend?.()
        }
      } catch (error) {
        toast.error('Error al enviar archivo')
      } finally {
        setIsLoading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
      return
    }

    // Otherwise send text
    const trimmedText = text.trim()
    if (!trimmedText) return

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
  }, [conversationId, text, isLoading, onSend, attachedFile])

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

    try {
      // Convert file to base64 (browser-compatible)
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)

      // Create preview URL for images/videos
      let preview: string | null = null
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        preview = URL.createObjectURL(file)
      }

      setAttachedFile({ file, preview, base64 })
    } catch (error) {
      toast.error('Error al procesar archivo')
    }
  }, [])

  // Remove attached file
  const handleRemoveFile = useCallback(() => {
    if (attachedFile?.preview) {
      URL.revokeObjectURL(attachedFile.preview)
    }
    setAttachedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [attachedFile])

  // Get icon for file type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-8 w-8" />
    if (mimeType.startsWith('video/')) return <Video className="h-8 w-8" />
    if (mimeType.startsWith('audio/')) return <Music className="h-8 w-8" />
    return <File className="h-8 w-8" />
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

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
    <div className="flex-shrink-0 border-t bg-background">
      {/* File preview */}
      {attachedFile && (
        <div className="px-4 pt-3 pb-2">
          <div className="relative inline-flex items-center gap-3 p-3 bg-muted rounded-lg max-w-sm">
            {/* Remove button */}
            <button
              onClick={handleRemoveFile}
              className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
              title="Quitar archivo"
            >
              <X className="h-3 w-3" />
            </button>

            {/* Preview */}
            {attachedFile.preview && attachedFile.file.type.startsWith('image/') ? (
              <div className="relative h-16 w-16 rounded overflow-hidden flex-shrink-0">
                <Image
                  src={attachedFile.preview}
                  alt="Preview"
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="h-16 w-16 rounded bg-background flex items-center justify-center flex-shrink-0 text-muted-foreground">
                {getFileIcon(attachedFile.file.type)}
              </div>
            )}

            {/* File info */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {attachedFile.file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(attachedFile.file.size)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3">
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
            disabled={isLoading || !!attachedFile}
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
              placeholder={attachedFile ? "Agregar caption (opcional)..." : "Escribe un mensaje..."}
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
            disabled={(!text.trim() && !attachedFile) || isLoading}
            title="Enviar mensaje"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
