'use client'

import { useState, useRef, useCallback, ChangeEvent } from 'react'
import { Paperclip, Smile, Send, Lock, X, File, Image as ImageIcon, Video, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmojiPicker } from './emoji-picker'
import { QuickReplyAutocomplete } from './quick-reply-autocomplete'
import { TemplateButton } from './template-button'
import { sendMessage, sendMediaMessage } from '@/app/actions/messages'
import type { QuickReply } from '@/lib/whatsapp/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface Contact {
  id: string
  name: string
  phone: string
  email?: string | null
  city?: string | null
}

interface Order {
  id: string
  total: number
  tracking_number?: string | null
  carrier?: string | null
}

interface MessageInputProps {
  conversationId: string
  isWindowOpen: boolean
  contact?: Contact | null
  recentOrder?: Order | null
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
  contact,
  recentOrder,
  onSend,
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const [pendingQuickReplyMedia, setPendingQuickReplyMedia] = useState<QuickReply | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle text change (for autocomplete)
  const handleTextChange = useCallback((value: string) => {
    setText(value)
  }, [])

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: string) => {
    // Append emoji to end of text
    setText((prev) => prev + emoji)
    setShowEmojiPicker(false)
  }, [])

  // Handle quick reply with media selection
  const handleQuickReplyWithMedia = useCallback((reply: QuickReply) => {
    if (reply.media_url) {
      setPendingQuickReplyMedia(reply)
    }
  }, [])

  // Handle send (text or media)
  const handleSend = useCallback(async () => {
    if (isLoading) return

    // If there's a quick reply with media pending, send it
    if (pendingQuickReplyMedia && pendingQuickReplyMedia.media_url) {
      setIsLoading(true)
      try {
        // Fetch the image and convert to base64
        const response = await fetch(pendingQuickReplyMedia.media_url)
        const blob = await response.blob()
        const buffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)

        // Extract filename from URL
        const urlParts = pendingQuickReplyMedia.media_url.split('/')
        const fileName = urlParts[urlParts.length - 1] || 'image.jpg'

        const result = await sendMediaMessage(
          conversationId,
          base64,
          fileName,
          blob.type || 'image/jpeg',
          text.trim() || undefined // caption (the quick reply content)
        )

        if ('error' in result) {
          toast.error(result.error)
        } else {
          toast.success('Mensaje enviado')
          setPendingQuickReplyMedia(null)
          setText('')
          onSend?.()
        }
      } catch (error) {
        console.error('Error sending quick reply media:', error)
        toast.error('Error al enviar imagen')
      } finally {
        setIsLoading(false)
      }
      return
    }

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
  }, [conversationId, text, isLoading, onSend, attachedFile, pendingQuickReplyMedia])

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

  // Disabled state when window closed - show template button
  if (!isWindowOpen) {
    return (
      <div className="flex-shrink-0 px-4 py-3 border-t bg-yellow-50/50 dark:bg-yellow-900/10">
        <div className="flex items-center gap-3">
          <Lock className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Ventana de 24h cerrada
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Solo puedes enviar templates aprobados
            </p>
          </div>
          <TemplateButton
            conversationId={conversationId}
            contact={contact || null}
            recentOrder={recentOrder}
          />
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

      {/* Quick reply media indicator */}
      {pendingQuickReplyMedia && pendingQuickReplyMedia.media_url && (
        <div className="px-4 pt-3 pb-2">
          <div className="relative inline-flex items-center gap-3 p-3 bg-primary/10 rounded-lg max-w-sm">
            <button
              onClick={() => setPendingQuickReplyMedia(null)}
              className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
              title="Cancelar"
            >
              <X className="h-3 w-3" />
            </button>
            <div className="relative h-12 w-12 rounded overflow-hidden flex-shrink-0">
              <Image
                src={pendingQuickReplyMedia.media_url}
                alt="Quick reply media"
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary">
                Respuesta rapida con imagen
              </p>
              <p className="text-xs text-muted-foreground">
                Presiona enviar para mandar
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

          {/* Text input with quick reply autocomplete */}
          <div className="flex-1 min-w-0">
            <QuickReplyAutocomplete
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onSend={handleSend}
              onSelectWithMedia={handleQuickReplyWithMedia}
              placeholder={attachedFile ? "Agregar caption (opcional)..." : pendingQuickReplyMedia ? "Enviar con imagen..." : "Escribe un mensaje... (/ para respuestas rapidas)"}
              disabled={isLoading}
              className={cn(
                'min-h-[40px] max-h-[120px] py-2',
                'focus-visible:ring-1',
                pendingQuickReplyMedia && 'border-primary'
              )}
            />
          </div>

          {/* Send button */}
          <Button
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            onClick={handleSend}
            disabled={(!text.trim() && !attachedFile && !pendingQuickReplyMedia) || isLoading}
            title="Enviar mensaje"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
