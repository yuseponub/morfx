'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Layout
// Full-height layout with header (back link, title, session controls)
// and main chat area. Manages session state passed to BuilderChat.
// ============================================================================

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BuilderChat } from './builder-chat'

export function BuilderLayout() {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)

  // Reset session to start a new conversation
  const handleNewSession = useCallback(() => {
    setSessionId(null)
    setSessionTitle(null)
  }, [])

  // Called by BuilderChat when a new session is created from the first message
  const handleSessionCreated = useCallback((id: string) => {
    setSessionId(id)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-background shrink-0">
          {/* Left: Back link */}
          <Link
            href="/automatizaciones"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Automatizaciones</span>
          </Link>

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

        {/* Chat area fills remaining height */}
        <div className="flex-1 min-h-0">
          <BuilderChat
            sessionId={sessionId}
            onSessionCreated={handleSessionCreated}
          />
        </div>
      </div>
    </div>
  )
}
