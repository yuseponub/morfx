'use client'

// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 04 Task 4.3
// Burbuja de mensaje estilo WhatsApp, pura render (sin state).
// Recibe body ya interpolado (los {{N}} ya sustituidos con bodyExamples).
// D-01: preview visual tipo burbuja WhatsApp en tiempo real.
// T-04-03 mitigation: React escapa por defecto. whitespace-pre-wrap es puro
// estilo CSS; sin dangerouslySetInnerHTML en ningun lugar.
// ============================================================================

interface WhatsAppBubbleProps {
  header?: {
    format: 'TEXT' | 'IMAGE'
    text?: string
    imageUrl?: string | null
  }
  body: string // ya interpolado con ejemplos
  footer?: string
}

export function WhatsAppBubble({ header, body, footer }: WhatsAppBubbleProps) {
  return (
    <div className="max-w-sm rounded-lg bg-[#d9fdd3] dark:bg-[#005c4b] px-3 py-2 shadow-sm text-black dark:text-white">
      {header?.format === 'IMAGE' && header.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={header.imageUrl}
          alt="Header preview"
          className="mb-2 rounded w-full aspect-video object-cover"
        />
      )}
      {header?.format === 'TEXT' && header.text && (
        <div className="font-semibold text-sm mb-1 whitespace-pre-wrap break-words">
          {header.text}
        </div>
      )}
      <div className="text-sm whitespace-pre-wrap break-words">{body || '(escribe el body...)'}</div>
      {footer && (
        <div className="text-xs opacity-70 mt-1 whitespace-pre-wrap break-words">
          {footer}
        </div>
      )}
    </div>
  )
}
