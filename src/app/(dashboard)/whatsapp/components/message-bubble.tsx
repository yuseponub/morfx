'use client'

import { Check, CheckCheck } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { MediaPreview } from './media-preview'
import type { Message, MessageStatus, TextContent, MediaContent, LocationContent } from '@/lib/whatsapp/types'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
}

/**
 * Get status icon for outbound messages.
 */
function StatusIcon({ status }: { status: MessageStatus | null }) {
  if (!status) return null

  switch (status) {
    case 'pending':
      return <Check className="h-3 w-3 text-muted-foreground" />
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />
    case 'read':
      return <CheckCheck className="h-3 w-3 text-blue-500" />
    case 'failed':
      return <span className="text-xs text-destructive">Error</span>
    default:
      return null
  }
}

/**
 * Render message content based on type.
 */
function MessageContent({
  message,
  isOwn,
}: {
  message: Message
  isOwn: boolean
}) {
  const { type, content, media_url, media_mime_type, media_filename } = message

  switch (type) {
    case 'text': {
      const textContent = content as TextContent
      return (
        <p className="whitespace-pre-wrap break-words">{textContent.body}</p>
      )
    }

    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const mediaContent = content as MediaContent
      return (
        <MediaPreview
          type={type}
          url={media_url || mediaContent.link}
          filename={media_filename || mediaContent.filename}
          mimeType={media_mime_type || mediaContent.mimeType}
          caption={mediaContent.caption}
        />
      )
    }

    case 'location': {
      const locationContent = content as LocationContent
      return (
        <div className="space-y-1">
          <div className="w-48 h-32 bg-muted rounded overflow-hidden">
            <a
              href={`https://www.google.com/maps?q=${locationContent.latitude},${locationContent.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-full"
            >
              <img
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${locationContent.latitude},${locationContent.longitude}&zoom=15&size=200x150&markers=${locationContent.latitude},${locationContent.longitude}`}
                alt="Location"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </a>
          </div>
          {locationContent.name && (
            <p className="text-sm font-medium">{locationContent.name}</p>
          )}
          {locationContent.address && (
            <p className="text-xs text-muted-foreground">{locationContent.address}</p>
          )}
        </div>
      )
    }

    case 'contacts': {
      return (
        <div className="text-sm">
          <p className="font-medium">Contacto compartido</p>
          <p className="text-xs text-muted-foreground">(Ver detalles en WhatsApp)</p>
        </div>
      )
    }

    case 'template': {
      return (
        <div className="text-sm">
          <p className="font-medium">Mensaje de plantilla</p>
          <p className="text-xs text-muted-foreground">Template enviado</p>
        </div>
      )
    }

    case 'interactive': {
      return (
        <div className="text-sm">
          <p className="font-medium">Mensaje interactivo</p>
          <p className="text-xs text-muted-foreground">(Ver en WhatsApp)</p>
        </div>
      )
    }

    case 'reaction': {
      return (
        <div className="text-2xl">
          {(content as { emoji?: string })?.emoji || '?'}
        </div>
      )
    }

    default:
      return (
        <p className="text-sm text-muted-foreground">
          Mensaje no soportado
        </p>
      )
  }
}

/**
 * Individual message bubble.
 * Own messages (outbound) align right with primary color.
 * Received messages (inbound) align left with muted color.
 */
export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const timestamp = format(new Date(message.timestamp), 'HH:mm', { locale: es })

  return (
    <div
      className={cn(
        'flex px-4 py-1',
        isOwn ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'relative max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
          isOwn
            ? 'bg-primary text-primary-foreground rounded-br-none'
            : 'bg-muted rounded-bl-none'
        )}
      >
        {/* Message content */}
        <div className="text-sm">
          <MessageContent message={message} isOwn={isOwn} />
        </div>

        {/* Timestamp and status */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1',
            isOwn ? 'justify-end' : 'justify-start'
          )}
        >
          <span
            className={cn(
              'text-[10px]',
              isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {timestamp}
          </span>
          {isOwn && <StatusIcon status={message.status} />}
        </div>

        {/* Error message */}
        {message.error_message && (
          <p className="text-xs text-destructive mt-1">
            {message.error_message}
          </p>
        )}
      </div>
    </div>
  )
}
