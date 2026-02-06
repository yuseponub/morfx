'use client'

/**
 * Sandbox Layout Component
 * Phase 15: Agent Sandbox
 *
 * Complete layout with chat, debug panel, and session management.
 */

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { SandboxHeader } from './sandbox-header'
import { SandboxChat } from './sandbox-chat'
import { DebugTabs } from './debug-panel'
import type { SandboxState, DebugTurn, SandboxMessage, SavedSandboxSession, SandboxEngineResult } from '@/lib/sandbox/types'
import { getLastAgentId, setLastAgentId } from '@/lib/sandbox/sandbox-session'

// Initial state (matches SandboxEngine.getInitialState())
const INITIAL_STATE: SandboxState = {
  currentMode: 'conversacion',
  intentsVistos: [],
  templatesEnviados: [],
  datosCapturados: {},
  packSeleccionado: null,
}

// Dynamic import for split panel (Allotment has no SSR support)
const SandboxSplitPanel = dynamic(
  () => import('./sandbox-split-panel').then(mod => mod.SandboxSplitPanel),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Cargando...</div> }
)

// Initial agent - will be expanded when more agents are registered
const DEFAULT_AGENT_ID = 'somnio-sales-v1'

export function SandboxLayout() {
  // Session state
  const [agentId, setAgentId] = useState<string>(getLastAgentId() ?? DEFAULT_AGENT_ID)
  const [messages, setMessages] = useState<SandboxMessage[]>([])
  const [state, setState] = useState<SandboxState>(INITIAL_STATE)
  const [debugTurns, setDebugTurns] = useState<DebugTurn[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [isTyping, setIsTyping] = useState(false)

  // Handle message send via API route
  const handleSendMessage = useCallback(async (content: string) => {
    // 1. Add user message immediately
    const userMessage: SandboxMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMessage])

    // 2. Show typing indicator
    setIsTyping(true)

    // 3. Build history for API
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content })

    try {
      // 4. Process message via server API
      const turnNumber = debugTurns.length + 1
      const response = await fetch('/api/sandbox/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, state, history, turnNumber }),
      })

      const result: SandboxEngineResult = await response.json()

      // 5. Hide typing and add response messages with delays
      if (result.success && result.messages.length > 0) {
        for (let i = 0; i < result.messages.length; i++) {
          // Simulate delay (2-6 seconds) between messages
          const delay = 2000 + Math.random() * 4000
          await new Promise(resolve => setTimeout(resolve, delay))

          const assistantMessage: SandboxMessage = {
            id: `msg-${Date.now()}-assistant-${i}`,
            role: 'assistant',
            content: result.messages[i],
            timestamp: new Date().toISOString(),
          }
          setMessages(prev => [...prev, assistantMessage])
        }
      }

      setIsTyping(false)

      // 6. Update state and debug info
      setState(result.newState)
      setDebugTurns(prev => [...prev, result.debugTurn])
      setTotalTokens(prev => prev + result.debugTurn.tokens.tokensUsed)
    } catch (error) {
      setIsTyping(false)
      console.error('[Sandbox] Error processing message:', error)
    }
  }, [messages, state, debugTurns])

  // Handle session reset
  const handleReset = useCallback(() => {
    setMessages([])
    setState(INITIAL_STATE)
    setDebugTurns([])
    setTotalTokens(0)
    setIsTyping(false)
  }, [])

  // Handle new session (same as reset but through controls)
  const handleNewSession = useCallback(() => {
    handleReset()
  }, [handleReset])

  // Handle agent change
  const handleAgentChange = useCallback((newAgentId: string) => {
    setAgentId(newAgentId)
    setLastAgentId(newAgentId)
  }, [])

  // Handle state edit from debug panel
  const handleStateEdit = useCallback((newState: SandboxState) => {
    setState(newState)
  }, [])

  // Handle loading a saved session
  const handleLoadSession = useCallback((session: SavedSandboxSession) => {
    setAgentId(session.agentId)
    setMessages(session.messages)
    setState(session.state)
    setDebugTurns(session.debugTurns)
    setTotalTokens(session.totalTokens)
    setIsTyping(false)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <SandboxHeader
        agentId={agentId}
        onAgentChange={handleAgentChange}
        onReset={handleReset}
        onNewSession={handleNewSession}
        onLoadSession={handleLoadSession}
        totalTokens={totalTokens}
        messageCount={messages.length}
        messages={messages}
        state={state}
        debugTurns={debugTurns}
      />

      <div className="flex-1 min-h-0">
        <SandboxSplitPanel
          leftPanel={
            <SandboxChat
              messages={messages}
              isTyping={isTyping}
              onSendMessage={handleSendMessage}
              agentId={agentId}
              currentMode={state.currentMode}
            />
          }
          rightPanel={
            <DebugTabs
              debugTurns={debugTurns}
              state={state}
              onStateEdit={handleStateEdit}
              totalTokens={totalTokens}
            />
          }
        />
      </div>
    </div>
  )
}
