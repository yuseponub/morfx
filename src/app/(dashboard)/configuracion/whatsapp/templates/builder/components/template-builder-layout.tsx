'use client'

// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 04 Task 4.1
// Two-pane shell (chat izq + preview der) + session switcher + draft provider.
// Clon adaptado de /automatizaciones/builder/components/builder-layout.tsx:
//   1. <TemplateDraftProvider> envuelve todo (D-13 Open Q2: shared reducer)
//   2. Grid dos columnas en vez de single-column chat full-width (D-01)
//   3. Session fetch client-side filtra por session.kind === 'template'
//   4. handleNewSession tambien hace dispatch({ type: 'RESET' })
//   5. Back link apunta a /configuracion/whatsapp/templates (D-02)
//
// Regla 6: NO modifica /automatizaciones/builder/**. Files adjuntos permanecen
// intactos; este archivo es copia adaptada, no mutacion in-place.
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Clock, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TemplateDraftProvider, useTemplateDraft } from './template-draft-context'
import { ChatPane } from './chat-pane'
import { PreviewPane } from './preview-pane'
import type { UIMessage } from 'ai'

// ============================================================================
// Tipo de sesion lightweight retornado por /api/builder/sessions (GET)
// ============================================================================

interface SessionSummary {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  automations_created: string[]
  kind?: 'automation' | 'template'
}

// ============================================================================
// Wrapper que aisla el uso de useTemplateDraft() (debe estar DENTRO del provider)
// ============================================================================

export function TemplateBuilderLayout() {
  return (
    <TemplateDraftProvider>
      <TemplateBuilderLayoutInner />
    </TemplateDraftProvider>
  )
}

function TemplateBuilderLayoutInner() {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Key para forzar remount de ChatPane cuando la sesion cambia
  const [chatKey, setChatKey] = useState(() => 'new-' + Date.now())

  // Ref para cerrar history panel en click-outside
  const historyPanelRef = useRef<HTMLDivElement>(null)

  // Acceso al draft context para RESET al cambiar de sesion
  const { dispatch } = useTemplateDraft()

  // Cerrar history panel en outside click
  useEffect(() => {
    if (!showHistory) return

    function handleClickOutside(e: MouseEvent) {
      if (
        historyPanelRef.current &&
        !historyPanelRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showHistory])

  // Nueva sesion: resetea state + draft
  const handleNewSession = useCallback(() => {
    setSessionId(null)
    setSessionTitle(null)
    setInitialMessages([])
    setChatKey('new-' + Date.now())
    setShowHistory(false)
    dispatch({ type: 'RESET' })
  }, [dispatch])

  // Llamado por ChatPane cuando se crea una sesion desde el primer mensaje
  const handleSessionCreated = useCallback((id: string) => {
    setSessionId(id)
  }, [])

  // Cargar sesion desde historial (filtrando kind='template' client-side)
  const handleSelectSession = useCallback(async (selectedSessionId: string) => {
    try {
      const res = await fetch(
        `/api/builder/sessions?sessionId=${selectedSessionId}`
      )
      if (!res.ok) return

      const session = await res.json()
      if (session && session.kind === 'template') {
        setSessionId(session.id)
        setSessionTitle(session.title)
        setInitialMessages((session.messages as UIMessage[]) || [])
        setChatKey(session.id + '-' + Date.now())
        // Reset draft: los messages iniciales replayaran las patches al re-renderse
        dispatch({ type: 'RESET' })
      }
    } catch (err) {
      console.error('[template-builder-layout] Failed to load session:', err)
    }
    setShowHistory(false)
  }, [dispatch])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col h-full relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-background shrink-0 z-10">
          {/* Left: Back link + History toggle */}
          <div className="flex items-center gap-2">
            <Link
              href="/configuracion/whatsapp/templates"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Templates</span>
            </Link>
            <Button
              variant={showHistory ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setShowHistory((prev) => !prev)}
              className="h-8 w-8"
              title="Historial de sesiones"
            >
              <Clock className="h-4 w-4" />
            </Button>
          </div>

          {/* Center: Title */}
          <div className="flex flex-col items-center">
            <h1 className="text-sm font-semibold">Crear template con IA</h1>
            {sessionTitle && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                {sessionTitle}
              </span>
            )}
          </div>

          {/* Right: Session controls */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </Button>
        </div>

        {/* Session history overlay panel */}
        {showHistory && (
          <div
            ref={historyPanelRef}
            className="absolute left-0 top-[53px] bottom-0 w-72 max-w-[80vw] bg-background border-r shadow-lg z-20"
          >
            <TemplateSessionHistory
              currentSessionId={sessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
            />
          </div>
        )}

        {/* Two-pane grid (chat izq + preview der) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0">
          <div className="border-r flex flex-col min-h-0">
            <ChatPane
              key={chatKey}
              sessionId={sessionId}
              onSessionCreated={handleSessionCreated}
              initialMessages={initialMessages}
            />
          </div>
          <div className="flex flex-col min-h-0 overflow-y-auto">
            <PreviewPane />
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TemplateSessionHistory — filtra por kind='template' (client-side)
// ============================================================================

interface TemplateSessionHistoryProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMinutes < 1) return 'ahora'
  if (diffMinutes < 60) return `hace ${diffMinutes} min`
  if (diffHours < 24) return `hace ${diffHours}h`
  if (diffDays < 7) return `hace ${diffDays}d`

  return date.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  })
}

function TemplateSessionHistory({
  currentSessionId,
  onSelectSession,
  onNewSession,
}: TemplateSessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/builder/sessions')
      if (res.ok) {
        const data: SessionSummary[] = await res.json()
        // Filter client-side: only template sessions
        setSessions(data.filter((s) => s.kind === 'template'))
      }
    } catch (err) {
      console.error('[template-session-history] Failed to fetch sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions, currentSessionId])

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation()
      setDeletingId(sessionId)
      try {
        const res = await fetch(
          `/api/builder/sessions?sessionId=${sessionId}`,
          { method: 'DELETE' }
        )
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        }
      } catch (err) {
        console.error('[template-session-history] Failed to delete session:', err)
      } finally {
        setDeletingId(null)
      }
    },
    []
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewSession}
          className="w-full gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva sesion
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No hay sesiones de templates anteriores
            </p>
          </div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId
              const isDeleting = session.id === deletingId

              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  disabled={isDeleting}
                  className={`
                    group w-full text-left px-3 py-2.5 border-b border-border/50
                    transition-colors relative
                    ${isCurrent
                      ? 'bg-primary/10 border-l-2 border-l-primary'
                      : 'hover:bg-muted'
                    }
                    ${isDeleting ? 'opacity-50' : ''}
                  `}
                >
                  <div className="text-sm font-medium truncate pr-8">
                    {session.title || 'Sesion sin titulo'}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(session.updated_at)}
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    disabled={isDeleting}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Eliminar sesion"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
