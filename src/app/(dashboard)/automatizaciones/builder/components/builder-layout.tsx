'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Layout
// Full-height layout with header (back link, title, session controls),
// collapsible session history panel, and main chat area.
// Manages session state and session loading/switching.
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BuilderChat } from './builder-chat'
import { SessionHistory } from './session-history'
import type { UIMessage } from 'ai'

export function BuilderLayout() {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Key to force remount of BuilderChat when session changes
  const [chatKey, setChatKey] = useState(() => 'new-' + Date.now())

  // Ref for detecting clicks outside the history panel
  const historyPanelRef = useRef<HTMLDivElement>(null)

  // Close history panel on outside click
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

  // Reset session to start a new conversation
  const handleNewSession = useCallback(() => {
    setSessionId(null)
    setSessionTitle(null)
    setInitialMessages([])
    setChatKey('new-' + Date.now())
    setShowHistory(false)
  }, [])

  // Called by BuilderChat when a new session is created from the first message
  const handleSessionCreated = useCallback((id: string) => {
    setSessionId(id)
  }, [])

  // Load a session from history
  const handleSelectSession = useCallback(async (selectedSessionId: string) => {
    try {
      const res = await fetch(
        `/api/builder/sessions?sessionId=${selectedSessionId}`
      )
      if (!res.ok) return

      const session = await res.json()
      if (session) {
        setSessionId(session.id)
        setSessionTitle(session.title)
        setInitialMessages((session.messages as UIMessage[]) || [])
        setChatKey(session.id + '-' + Date.now())
      }
    } catch (err) {
      console.error('[builder-layout] Failed to load session:', err)
    }
    setShowHistory(false)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col h-full relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-background shrink-0 z-10">
          {/* Left: Back link + History toggle */}
          <div className="flex items-center gap-2">
            <Link
              href="/automatizaciones"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Automatizaciones</span>
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
            <h1 className="text-sm font-semibold">AI Builder</h1>
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
            <SessionHistory
              currentSessionId={sessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
            />
          </div>
        )}

        {/* Chat area fills remaining height */}
        <div className="flex-1 min-h-0">
          <BuilderChat
            key={chatKey}
            sessionId={sessionId}
            onSessionCreated={handleSessionCreated}
            initialMessages={initialMessages}
          />
        </div>
      </div>
    </div>
  )
}
