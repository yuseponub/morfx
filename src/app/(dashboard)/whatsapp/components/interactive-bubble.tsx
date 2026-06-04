'use client'

// ============================================================================
// Phase 999.1 — Plan 04 Task 1
// Burbuja de mensaje interactivo estilo WhatsApp, render PURO (sin state, sin
// efectos). Consumida por DOS lugares (single source of truth — RESEARCH Pattern 4):
//   1. El preview en vivo del composer modal (interactive-composer-modal.tsx).
//   2. La burbuja outbound de Plan 05 (message-bubble.tsx case 'interactive').
//
// T-999.1-XSS: render plain-text via auto-escaping de React; whitespace-pre-wrap
// es puro CSS. Sin raw-HTML injection en ningun lugar (XSS grep gate == 0).
//
// Los verdes #d9fdd3 / #005c4b + text-black dark:text-white estan LOCKED a la
// burbuja WhatsApp por UI-SPEC Color — NO deben filtrarse al chrome editorial.
// ============================================================================

import { List } from 'lucide-react'

export interface InteractiveContent {
  interactiveType: 'buttons' | 'list'
  body: string
  header?: string
  footer?: string
  buttons?: { id: string; title: string }[]
  buttonLabel?: string
  sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[]
}

export function InteractiveBubble({ content }: { content: InteractiveContent }) {
  return (
    <div className="max-w-sm rounded-lg bg-[#d9fdd3] dark:bg-[#005c4b] px-3 py-2 shadow-sm text-black dark:text-white">
      {content.header && (
        <div className="font-semibold text-sm mb-1 whitespace-pre-wrap break-words">{content.header}</div>
      )}
      <div className="text-sm whitespace-pre-wrap break-words">{content.body || '(escribe el body...)'}</div>
      {content.footer && (
        <div className="text-xs opacity-70 mt-1 whitespace-pre-wrap break-words">{content.footer}</div>
      )}

      {/* Interactive affordance region — UI-SPEC Area 3 */}
      {content.interactiveType === 'buttons' && content.buttons && content.buttons.length > 0 && (
        <div className="mt-2">
          {content.buttons.map((b) => (
            <div
              key={b.id}
              className="border-t border-black/10 dark:border-white/10 py-2 text-sm font-medium text-center text-[#00a5f4] dark:text-[#53bdeb]"
            >
              {b.title}
            </div>
          ))}
        </div>
      )}
      {content.interactiveType === 'list' && content.buttonLabel && (
        <div className="mt-2 border-t border-black/10 dark:border-white/10 py-2 flex items-center justify-center gap-1.5 text-sm font-medium text-[#00a5f4] dark:text-[#53bdeb]">
          <List className="h-4 w-4" />
          {content.buttonLabel}
        </div>
      )}
    </div>
  )
}
