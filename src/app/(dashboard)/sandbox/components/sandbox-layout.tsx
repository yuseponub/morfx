'use client'

/**
 * Sandbox Layout Component
 * Phase 15: Agent Sandbox
 *
 * Complete layout with chat, debug panel, and session management.
 */

import { useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { SandboxHeader } from './sandbox-header'
import { SandboxChat } from './sandbox-chat'
import { DebugTabs } from './debug-panel'
import type { SandboxState, DebugTurn, SandboxMessage, SavedSandboxSession } from '@/lib/sandbox/types'
import { SandboxEngine } from '@/lib/sandbox/sandbox-engine'
import { getLastAgentId, setLastAgentId } from '@/lib/sandbox/sandbox-session'

// Initial agent - will be expanded when more agents are registered
const DEFAULT_AGENT_ID = 'somnio-sales-v1'

export function SandboxLayout() {
  // Session state
  const [agentId, setAgentId] = useState<string>(getLastAgentId() ?? DEFAULT_AGENT_ID)
  const [messages, setMessages] = useState<SandboxMessage[]>([])
  const [state, setState] = useState<SandboxState>(() => new SandboxEngine().getInitialState())
  const [debugTurns, setDebugTurns] = useState<DebugTurn[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [isTyping, setIsTyping] = useState(false)

  // Engine instance
  const [engine] = useState(() => new SandboxEngine())

  // Handle message send
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

    // 3. Build history for engine
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content })

    // 4. Process message
    const turnNumber = debugTurns.length + 1
    const result = await engine.processMessage(content, state, history, turnNumber)

    // 5. Hide typing and add response messages with delays
    if (result.success && result.messages.length > 0) {
      for (let i = 0; i < result.messages.length; i++) {
        // Simulate delay (2-6 seconds) between messages per CONTEXT.md
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
  }, [messages, state, debugTurns, engine])

  // Handle session reset
  const handleReset = useCallback(() => {
    setMessages([])
    setState(engine.getInitialState())
    setDebugTurns([])
    setTotalTokens(0)
    setIsTyping(false)
  }, [engine])

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
        <Allotment defaultSizes={[60, 40]} minSize={300}>
          <Allotment.Pane>
            <SandboxChat
              messages={messages}
              isTyping={isTyping}
              onSendMessage={handleSendMessage}
              agentId={agentId}
              currentMode={state.currentMode}
            />
          </Allotment.Pane>
          <Allotment.Pane snap>
            <DebugTabs
              debugTurns={debugTurns}
              state={state}
              onStateEdit={handleStateEdit}
              totalTokens={totalTokens}
            />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  )
}
