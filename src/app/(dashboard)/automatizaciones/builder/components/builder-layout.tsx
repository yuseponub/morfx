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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

export function BuilderLayout() {
  const v2 = useDashboardV2()
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
    <div className={cn('flex-1 overflow-y-auto', v2 && 'bg-[var(--paper-1)]')}>
      <div className="flex flex-col h-full relative">
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3 shrink-0 z-10',
            v2
              ? 'border-b border-[var(--ink-1)] bg-[var(--paper-1)]'
              : 'border-b bg-background'
          )}
        >
          {/* Left: Back link + History toggle */}
          <div className="flex items-center gap-2">
            <Link
              href="/automatizaciones"
              className={cn(
                'flex items-center gap-1.5 transition-colors',
                v2
                  ? 'text-[12px] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  : 'text-sm text-muted-foreground hover:text-foreground'
              )}
              style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Automatizaciones</span>
            </Link>
            <Button
              variant={showHistory ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setShowHistory((prev) => !prev)}
              className={cn(
                'h-8 w-8',
                v2 && (showHistory
                  ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-1)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--paper-3)]')
              )}
              title="Historial de sesiones"
            >
              <Clock className="h-4 w-4" />
            </Button>
          </div>

          {/* Center: Title */}
          <div className="flex flex-col items-center">
            {v2 ? (
              <>
                <span
                  className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  Builder · IA
                </span>
                <h1
                  className="text-[15px] font-semibold text-[var(--ink-1)] tracking-[-0.01em]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  AI Builder
                </h1>
                {sessionTitle && (
                  <span
                    className="text-[11px] italic text-[var(--ink-3)] truncate max-w-[200px]"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {sessionTitle}
                  </span>
                )}
              </>
            ) : (
              <>
                <h1 className="text-sm font-semibold">AI Builder</h1>
                {sessionTitle && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {sessionTitle}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Right: Session controls */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
            className={cn(
              'gap-1.5',
              v2 &&
                'bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </Button>
        </div>

        {/* Session history overlay panel */}
        {showHistory && (
          <div
            ref={historyPanelRef}
            className={cn(
              'absolute left-0 top-[53px] bottom-0 w-72 max-w-[80vw] z-20',
              v2
                ? 'bg-[var(--paper-2)] border-r border-[var(--ink-1)] shadow-[0_4px_14px_-8px_color-mix(in_oklch,var(--ink-1)_20%,transparent)]'
                : 'bg-background border-r shadow-lg'
            )}
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
