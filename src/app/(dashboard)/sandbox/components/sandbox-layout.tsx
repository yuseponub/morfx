'use client'

/**
 * Sandbox Layout Component
 * Phase 15: Agent Sandbox
 *
 * Allotment split pane layout with chat (60%) and debug panel (40%).
 * Resizable with drag handle.
 */

import { useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { SandboxHeader } from './sandbox-header'
import { SandboxChat } from './sandbox-chat'
import type { SandboxState, DebugTurn, SandboxMessage } from '@/lib/sandbox/types'
import { SandboxEngine } from '@/lib/sandbox/sandbox-engine'
import { getLastAgentId } from '@/lib/sandbox/sandbox-session'

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
  }, [messages, state, debugTurns, engine])

  // Handle session reset
  const handleReset = useCallback(() => {
    setMessages([])
    setState(engine.getInitialState())
    setDebugTurns([])
    setTotalTokens(0)
    setIsTyping(false)
  }, [engine])

  // Handle agent change
  const handleAgentChange = useCallback((newAgentId: string) => {
    setAgentId(newAgentId)
  }, [])

  // Handle state edit from debug panel (future use)
  const _handleStateEdit = useCallback((newState: SandboxState) => {
    setState(newState)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <SandboxHeader
        agentId={agentId}
        onAgentChange={handleAgentChange}
        onReset={handleReset}
        totalTokens={totalTokens}
        messageCount={messages.length}
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
            {/* Debug panel placeholder - will be implemented in Plan 03 */}
            <div className="h-full bg-muted/30 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <p className="font-medium">Debug Panel</p>
                <p className="text-sm">Tools | Estado | Intent | Tokens</p>
              </div>
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  )
}
