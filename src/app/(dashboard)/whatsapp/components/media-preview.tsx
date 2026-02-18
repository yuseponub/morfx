'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Download, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface MediaPreviewProps {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  url?: string | null
  filename?: string | null
  mimeType?: string | null
  caption?: string
}

/**
 * Media preview component for different file types.
 * - Image: Inline preview with click-to-expand
 * - Video: Video player with controls
 * - Audio: Audio player
 * - Document: File icon + name + download link
 * - Sticker: Inline image (usually WebP)
 */
export function MediaPreview({
  type,
  url,
  filename,
  mimeType,
  caption,
}: MediaPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (!url) {
    return (
      <div className="text-sm text-muted-foreground">
        Media no disponible
      </div>
    )
  }

  const handleLoad = () => setIsLoading(false)
  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  // Image
  if (type === 'image' || type === 'sticker') {
    return (
      <div className="space-y-1">
        <div
          className={cn(
            'relative rounded overflow-hidden cursor-pointer',
            type === 'sticker' ? 'max-w-24' : 'max-w-60'
          )}
          onClick={() => setIsExpanded(true)}
        >
          {isLoading && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          {hasError ? (
            <div className="w-60 h-40 bg-muted flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Error al cargar imagen</p>
            </div>
          ) : (
            <img
              src={url}
              alt={caption || 'Image'}
              className={cn(
                'object-cover',
                type === 'sticker' ? 'w-24 h-24' : 'w-60 max-h-80'
              )}
              onLoad={handleLoad}
              onError={handleError}
              loading="lazy"
            />
          )}
        </div>
        {caption && (
          <p className="text-sm whitespace-pre-wrap">{caption}</p>
        )}

        {/* Fullscreen modal — portal to body to escape overflow hidden */}
        {isExpanded && createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-8"
            onClick={() => setIsExpanded(false)}
          >
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={url}
                download={filename || 'image'}
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                >
                  <Download className="h-6 w-6" />
                </Button>
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => setIsExpanded(false)}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
            <img
              src={url}
              alt={caption || 'Image'}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
      </div>
    )
  }

  // Video
  if (type === 'video') {
    return (
      <div className="space-y-1">
        <div className="max-w-60 rounded overflow-hidden">
          <video
            src={url}
            controls
            preload="metadata"
            className="w-full"
            onLoadedMetadata={handleLoad}
            onError={handleError}
          >
            Tu navegador no soporta video.
          </video>
        </div>
        {caption && (
          <p className="text-sm whitespace-pre-wrap">{caption}</p>
        )}
      </div>
    )
  }

  // Audio
  if (type === 'audio') {
    return (
      <div className="space-y-1">
        <audio
          src={url}
          controls
          preload="metadata"
          className="w-48"
          onLoadedMetadata={handleLoad}
          onError={handleError}
        >
          Tu navegador no soporta audio.
        </audio>
      </div>
    )
  }

  // Document
  if (type === 'document') {
    const displayName = filename || 'Documento'
    const extension = filename?.split('.').pop()?.toUpperCase() || 'FILE'

    return (
      <div className="space-y-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={filename}
          className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border hover:bg-background/80 transition-colors"
        >
          <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground">{extension}</p>
          </div>
          <Download className="h-4 w-4 text-muted-foreground" />
        </a>
        {caption && (
          <p className="text-sm whitespace-pre-wrap">{caption}</p>
        )}
      </div>
    )
  }

  // Fallback
  return (
    <div className="text-sm text-muted-foreground">
      Tipo de media no soportado: {type}
    </div>
  )
}
