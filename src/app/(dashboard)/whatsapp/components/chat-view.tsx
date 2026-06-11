'use client'

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { createClient } from '@/lib/supabase/client'
import { useMessages } from '@/hooks/use-messages'
import { ChatHeader } from './chat-header'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { DaySeparator } from './day-separator'
import { useInboxV2 } from './inbox-v2-context'
import { useInboxV3 } from './inbox-v3-context'
import { cn } from '@/lib/utils'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'
import { differenceInHours, isSameDay, format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'

interface ChatViewProps {
  /** Active workspace id — forwarded to useMessages so the React Query cache key
   *  is scoped per workspace (debug whatsapp-inbox-messages-stuck). */
  workspaceId: string
  conversationId: string | null
  conversation: ConversationWithDetails | null
  onTogglePanel: () => void
  /** GAP-02 (editorial-v3): whether the contact ficha panel is currently open,
   *  so the th-head toggle button can reflect open/closed state. Optional —
   *  legacy/v2 paths don't pass it (defaults to false). */
  isPanelOpen?: boolean
  onOpenAgentConfig?: () => void
  /**
   * Phase 42.1: show "Debug bot" button in the header when provided.
   * Pass `undefined` for non super-users to hide the control entirely
   * (Regla 6 — zero regression for regular users).
   */
  onToggleDebug?: () => void
  /** Whether the production debug panel is currently visible. */
  isDebugOpen?: boolean
}

/**
 * Chat view with virtualized message list.
 * Center column of the 3-column layout.
 */
export function ChatView({
  workspaceId,
  conversationId,
  conversation,
  onTogglePanel,
  isPanelOpen = false,
  onOpenAgentConfig,
  onToggleDebug,
  isDebugOpen,
}: ChatViewProps) {
  const v2 = useInboxV2()
  const v3 = useInboxV3()
  const parentRef = useRef<HTMLDivElement>(null)
  // Auto-follow state (ver effects más abajo). `stickRef` = ¿seguir mensajes
  // nuevos? Solo true al estar/volver al fondo absoluto. `lastScrollTopRef` detecta
  // dirección del scroll. `prevLenRef` distingue un mensaje NUEVO de un re-render.
  const stickRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const prevLenRef = useRef(0)

  const { messages, isLoading, isError, refetch, loadMore, hasMore, addOptimisticMessage, scheduleSafetyRefetch } = useMessages({
    workspaceId,
    conversationId,
    limit: 50,
  })

  // Calculate 24h window status
  // Uses both conversation data AND real-time messages to stay updated
  const isWindowOpen = (() => {
    // First check messages (most up-to-date via realtime)
    const lastInboundMessage = [...messages]
      .reverse()
      .find(m => m.direction === 'inbound')

    if (lastInboundMessage) {
      const hoursSinceMessage = differenceInHours(
        new Date(),
        new Date(lastInboundMessage.timestamp)
      )
      if (hoursSinceMessage < 24) return true
    }

    // Fallback to conversation data
    if (!conversation?.last_customer_message_at) return false
    const hoursSince = differenceInHours(
      new Date(),
      new Date(conversation.last_customer_message_at)
    )
    return hoursSince < 24
  })()

  // Virtual list setup
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
  })

  // ── Auto-follow del fondo (robusto — NO pelea con el scroll del usuario) ──
  // Pin al fondo + re-pin unos frames para absorber el crecimiento por medición
  // real del virtualizer (estimateSize:80 → altura real tras el paint). Aborta en
  // cuanto stickRef pasa a false (el usuario subió).
  const stickToBottom = useCallback(() => {
    let ticks = 0
    const pin = () => {
      const el = parentRef.current
      if (!el || !stickRef.current) return
      el.scrollTop = el.scrollHeight
      if (++ticks < 8) requestAnimationFrame(pin)
    }
    requestAnimationFrame(pin)
  }, [])

  // Abrir conversación: ancla al fondo (último mensaje).
  useLayoutEffect(() => {
    stickRef.current = true
    prevLenRef.current = 0
    lastScrollTopRef.current = Number.MAX_SAFE_INTEGER
    stickToBottom()
  }, [conversationId, stickToBottom])

  // Seguir SOLO un mensaje NUEVO (length crece) y solo si seguimos pegados al
  // fondo. Los updates de estado y los merges del watchdog/softRefetch NO cambian
  // length → NO mueven el scroll de quien está leyendo hacia arriba. Antes el
  // effect dependía de getTotalSize() y re-pegaba en cada cambio de tamaño: un
  // append (mensaje nuevo, ahora frecuente porque el realtime SÍ entrega) dentro
  // de la franja de 50px te devolvía al fondo apenas intentabas subir.
  useLayoutEffect(() => {
    const appended = messages.length > prevLenRef.current
    prevLenRef.current = messages.length
    if (appended && stickRef.current) stickToBottom()
  }, [messages.length, stickToBottom])

  // Posición + dirección. Un scroll-up DELIBERADO despega (deja de auto-seguir);
  // tocar el fondo absoluto (banda de 8px, NO 50px) vuelve a pegar. Así un
  // scroll-up pequeño e intencional detiene el follow y los appends ya no te bajan.
  useEffect(() => {
    const container = parentRef.current
    if (!container) return
    lastScrollTopRef.current = container.scrollTop
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distFromBottom = scrollHeight - scrollTop - clientHeight
      const movedUp = scrollTop < lastScrollTopRef.current - 2
      lastScrollTopRef.current = scrollTop
      if (distFromBottom <= 8) stickRef.current = true
      else if (movedUp) stickRef.current = false
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Agent typing indicator via Supabase Realtime broadcast
  // Channel matches webhook-processor: `conversation:{conversationId}` with event 'typing'
  const [isAgentTyping, setIsAgentTyping] = useState(false)

  useEffect(() => {
    if (!conversationId) {
      setIsAgentTyping(false)
      return
    }

    let safetyTimer: ReturnType<typeof setTimeout> | null = null

    const supabase = createClient()
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const data = payload.payload as { isTyping: boolean; source?: string }
        if (data.source === 'agent') {
          // Clear previous safety timer
          if (safetyTimer) clearTimeout(safetyTimer)

          setIsAgentTyping(data.isTyping)

          // Auto-clear after 30s if stop event is missed
          if (data.isTyping) {
            safetyTimer = setTimeout(() => setIsAgentTyping(false), 30_000)
          }
        }
      })
      .subscribe()

    return () => {
      if (safetyTimer) clearTimeout(safetyTimer)
      setIsAgentTyping(false)
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  // Empty state
  if (!conversationId || !conversation) {
    return (
      <div className={cn('flex-1 flex items-center justify-center px-6', v3 ? 'thread' : 'bg-muted/10')}>
        {v2 || v3 ? (
          <div className="flex flex-col items-center text-center gap-3">
            <p className="mx-h4">Seleccione una conversación.</p>
            <p className="mx-caption">Los mensajes y el contexto del cliente aparecerán aquí.</p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <div className="mb-4 text-6xl opacity-20">💬</div>
            <p className="text-lg font-medium">Selecciona una conversacion</p>
            <p className="text-sm">Elige una conversacion del panel izquierdo</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex-1 flex flex-col min-w-0 h-full', v3 && 'thread')}>
      {/* Chat header */}
      <ChatHeader
        conversation={conversation}
        onTogglePanel={onTogglePanel}
        isPanelOpen={isPanelOpen}
        onOpenAgentConfig={onOpenAgentConfig}
        onToggleDebug={onToggleDebug}
        isDebugOpen={isDebugOpen}
      />

      {/* Messages container with geometric pattern background */}
      <div
        ref={parentRef}
        role="log"
        aria-live="polite"
        aria-label="Hilo de mensajes"
        className={cn(
          'flex-1 overflow-auto',
          v3 ? 'px-3' : 'chat-background'
        )}
        style={{
          contain: 'strict',
          ...(v3 ? { backgroundColor: 'var(--bg-app)' } : {}),
        }}
      >
        {/* Load more indicator */}
        {hasMore && messages.length > 0 && (
          <div className="text-center py-4">
            <button
              onClick={loadMore}
              className="text-sm text-muted-foreground hover:text-foreground"
              disabled={isLoading}
            >
              {isLoading ? 'Cargando...' : 'Cargar mensajes anteriores'}
            </button>
          </div>
        )}

        {/* Loading indicator when switching conversations */}
        {isLoading && messages.length === 0 && (
          v2 ? (
            /* D-14 editorial thread skeleton — 3 bubble placeholders
               alternating in/own with letter-note 10px + 2px opposite corner,
               using .mx-skeleton (paper-2 bg + border + mx-pulse) gated by
               prefers-reduced-motion via globals.css. */
            <div
              role="log"
              aria-busy="true"
              aria-label="Cargando mensajes"
              className="flex flex-col gap-2 px-6 py-[22px]"
            >
              <div className="flex justify-start">
                <div
                  className="mx-skeleton h-[56px] w-[45%] max-w-[62%] rounded-[10px] rounded-bl-[2px]"
                  aria-hidden
                />
              </div>
              <div className="flex justify-end">
                <div
                  className="mx-skeleton h-[42px] w-[35%] max-w-[62%] rounded-[10px] rounded-br-[2px]"
                  aria-hidden
                />
              </div>
              <div className="flex justify-start">
                <div
                  className="mx-skeleton h-[72px] w-[58%] max-w-[62%] rounded-[10px] rounded-bl-[2px]"
                  aria-hidden
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
              </div>
            </div>
          )
        )}

        {/* Error state — F-6 / D-20: a failed message fetch (timeout, cold start,
            network) must render an explicit, recoverable error with a manual
            "Reintentar", NEVER a permanent empty chat (DIAGNOSIS case 3). React
            Query's retry: 1 already did one auto-retry before landing here. */}
        {isError && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="mx-caption">No se pudieron cargar los mensajes.</p>
            <button
              className="mx-btn-ghost text-sm"
              onClick={() => refetch()}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Virtualized message list */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const message = messages[virtualItem.index]
            const prevMessage = virtualItem.index > 0 ? messages[virtualItem.index - 1] : null
            const messageDate = new Date(message.timestamp)
            const showDateSeparator = !prevMessage || !isSameDay(messageDate, new Date(prevMessage.timestamp))

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {showDateSeparator && (
                  v2 || v3 ? (
                    <DaySeparator date={messageDate} />
                  ) : (
                    <div className="flex justify-center py-3">
                      <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
                        {isToday(messageDate)
                          ? 'Hoy'
                          : isYesterday(messageDate)
                            ? 'Ayer'
                            : format(messageDate, "d 'de' MMMM, yyyy", { locale: es })}
                      </span>
                    </div>
                  )
                )}
                <MessageBubble
                  message={message}
                  isOwn={message.direction === 'outbound'}
                />
              </div>
            )
          })}
        </div>

        {/* Real-empty state — gated on !isLoading && !isError (F-6 / D-20) so a
            fetch failure shows the error+Reintentar above, never this empty copy. */}
        {messages.length === 0 && !isLoading && !isError && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No hay mensajes aun</p>
            </div>
          </div>
        )}
      </div>

      {/* Bot typing indicator */}
      {isAgentTyping && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-t">
          <Bot className="h-4 w-4 text-blue-500 animate-pulse" />
          <span className="text-sm text-muted-foreground animate-pulse">
            Bot escribiendo...
          </span>
        </div>
      )}

      {/* Message input */}
      <MessageInput
        conversationId={conversationId}
        isWindowOpen={isWindowOpen}
        channel={conversation.channel}
        contact={conversation.contact ? {
          id: conversation.contact.id,
          name: conversation.contact.name,
          phone: conversation.contact.phone,
          city: conversation.contact.city,
        } : null}
        addOptimisticMessage={addOptimisticMessage}
        onSend={() => {
          // Scroll to bottom after sending
          stickRef.current = true
          // Safety refetch in case realtime misses the sent message
          scheduleSafetyRefetch()
        }}
      />

      {/* CSS for chat background pattern */}
      <style jsx>{`
        .chat-background {
          background-color: var(--background);
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }
      `}</style>
    </div>
  )
}
