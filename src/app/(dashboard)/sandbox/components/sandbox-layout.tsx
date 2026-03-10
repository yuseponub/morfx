'use client'

/**
 * Sandbox Layout Component
 * Phase 15: Agent Sandbox
 *
 * Complete layout with chat, debug panel, session management,
 * and CRM agent state management.
 *
 * Timer refactored to pure countdown (quick-013):
 * - Timer expires -> sends systemEvent to pipeline
 * - Pipeline decides what to do and say
 * - No hardcoded messages from frontend
 * - Silence is L5 via transition table (quick-014)
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { SandboxHeader } from './sandbox-header'
import { SandboxChat } from './sandbox-chat'
import { DebugTabs, DebugV3 } from './debug-panel'
import type { SandboxState, DebugTurn, SandboxMessage, SavedSandboxSession, SandboxEngineResult, CrmAgentState, CrmExecutionMode, TimerState, TimerConfig } from '@/lib/sandbox/types'
import { IngestTimerSimulator, TIMER_DEFAULTS } from '@/lib/sandbox/ingest-timer'
import { calculateCharDelay } from '@/lib/agents/somnio/char-delay'
import { DEFAULT_DELAY_MS, AVG_TEMPLATE_CHARS } from './debug-panel/config-tab'
import { getLastAgentId, setLastAgentId } from '@/lib/sandbox/sandbox-session'
import { useWorkspace } from '@/components/providers/workspace-provider'

// Initial state (matches SandboxEngine.getInitialState())
const INITIAL_STATE: SandboxState = {
  currentMode: 'conversacion',
  intentsVistos: [],
  templatesEnviados: [],
  datosCapturados: {},
  packSeleccionado: null,
  accionesEjecutadas: [],
}

// Dynamic import for split panel (Allotment has no SSR support)
const SandboxSplitPanel = dynamic(
  () => import('./sandbox-split-panel').then(mod => mod.SandboxSplitPanel),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Cargando...</div> }
)

// Initial agent - will be expanded when more agents are registered
const DEFAULT_AGENT_ID = 'somnio-sales-v1'

const AGENT_NAMES: Record<string, string> = {
  'somnio-sales-v1': 'Somnio Sales Agent v1',
  'somnio-sales-v2': 'Somnio Sales Agent v2',
  'somnio-sales-v3': 'Somnio Sales Agent v3',
}

export function SandboxLayout() {
  // Session state
  const [agentId, setAgentId] = useState<string>(getLastAgentId() ?? DEFAULT_AGENT_ID)
  const [messages, setMessages] = useState<SandboxMessage[]>([])
  const [state, setState] = useState<SandboxState>(INITIAL_STATE)
  const [debugTurns, setDebugTurns] = useState<DebugTurn[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [queuedMessages, setQueuedMessages] = useState<string[]>([])
  const [responseDelayMs, setResponseDelayMs] = useState<number>(DEFAULT_DELAY_MS)

  // Timer state (Phase 15.7, simplified quick-013)
  const [timerState, setTimerState] = useState<TimerState>({
    active: false,
    level: null,
    levelName: '',
    remainingMs: 0,
    paused: false,
  })
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [timerConfig, setTimerConfig] = useState<TimerConfig>(TIMER_DEFAULTS)
  const simulatorRef = useRef<IngestTimerSimulator | null>(null)
  const stateRef = useRef<SandboxState>(INITIAL_STATE)

  // Workspace ID for LIVE mode CRM operations
  const { workspace } = useWorkspace()

  // CRM agent state - initialized from registry via API
  const [crmAgents, setCrmAgents] = useState<CrmAgentState[]>([])
  const agentIdRef = useRef<string>(getLastAgentId() ?? DEFAULT_AGENT_ID)
  const crmAgentsRef = useRef<CrmAgentState[]>([])
  const workspaceRef = useRef(workspace)

  // Load CRM agents on mount
  useEffect(() => {
    fetch('/api/sandbox/crm-agents')
      .then(res => res.json())
      .then((agents: CrmAgentState[]) => setCrmAgents(agents))
      .catch(err => console.error('[Sandbox] Failed to load CRM agents:', err))
  }, [])

  // ============================================================================
  // Timer Lifecycle (pure countdown — quick-013)
  // ============================================================================

  // Keep refs in sync for timer callbacks (avoids stale closures)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const messagesRef = useRef<SandboxMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const debugTurnsRef = useRef<DebugTurn[]>([])
  useEffect(() => {
    debugTurnsRef.current = debugTurns
  }, [debugTurns])

  useEffect(() => {
    crmAgentsRef.current = crmAgents
  }, [crmAgents])
  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])
  useEffect(() => {
    agentIdRef.current = agentId
  }, [agentId])

  const timerEnabledRef = useRef(true)
  useEffect(() => {
    timerEnabledRef.current = timerEnabled
  }, [timerEnabled])

  // Ref to hold latest handleTimerExpire to avoid stale closures in simulator
  const timerExpireRef = useRef<(level: number) => void>(() => {})

  // Helper: start timer at a specific level
  const startTimerForLevel = useCallback((level: number) => {
    const durationS = timerConfig.levels[level] ?? TIMER_DEFAULTS.levels[level] ?? 60
    const durationMs = durationS * 1000
    simulatorRef.current?.start(level, durationMs)
  }, [timerConfig])

  // Helper: process timer signal from pipeline response
  const processTimerSignal = useCallback((signal: { type: string; level?: string; reason?: string }) => {
    if (signal.type === 'start' && signal.level) {
      const levelNum = parseInt(signal.level.replace('L', ''), 10)
      if (!isNaN(levelNum)) {
        // Don't restart if already running at same level (accumulate data without resetting countdown)
        const current = simulatorRef.current?.getState()
        if (current?.active && current.level === levelNum) return
        startTimerForLevel(levelNum)
      }
    } else if (signal.type === 'reevaluate' && signal.level) {
      // Reevaluate = restart at the specified level (pipeline already decided the level)
      const levelNum = parseInt(signal.level.replace('L', ''), 10)
      if (!isNaN(levelNum)) {
        startTimerForLevel(levelNum)
      }
    } else if (signal.type === 'cancel') {
      simulatorRef.current?.stop()
      setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
    }
  }, [startTimerForLevel])

  // Handle timer expiration: send systemEvent to pipeline, display result
  const handleTimerExpire = useCallback(async (level: number) => {
    // Reset timer display immediately
    setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })

    // Send systemEvent to pipeline — pipeline decides what to do and say
    const currentMessages = messagesRef.current
    const currentDebugTurns = debugTurnsRef.current
    const currentState = stateRef.current
    const history = currentMessages.map(m => ({ role: m.role, content: m.content }))
    const enabledCrmAgents = crmAgentsRef.current
      .filter(a => a.enabled)
      .map(a => ({ agentId: a.agentId, mode: a.mode }))

    try {
      setIsTyping(true)
      const response = await fetch('/api/sandbox/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[timer expired: level ${level}]`,
          state: currentState,
          history,
          turnNumber: currentDebugTurns.length + 1,
          systemEvent: { type: 'timer_expired', level },
          agentId: agentIdRef.current,
          crmAgents: enabledCrmAgents,
          workspaceId: workspaceRef.current?.id,
        }),
      })
      const result = await response.json()
      setIsTyping(false)

      // Display messages from pipeline
      if (result.success && result.messages?.length > 0) {
        for (const msg of result.messages) {
          const assistantMsg: SandboxMessage = {
            id: `msg-${Date.now()}-timer-${Math.random().toString(36).slice(2, 7)}`,
            role: 'assistant' as const,
            content: msg,
            timestamp: new Date().toISOString(),
          }
          setMessages(prev => [...prev, assistantMsg])
          if (result.messages.length > 1) {
            await new Promise(r => setTimeout(r, 2000))
          }
        }
      }

      // Update state and debug from pipeline response
      if (result.newState) setState(result.newState)
      if (result.debugTurn) {
        setDebugTurns(prev => [...prev, result.debugTurn])
        setTotalTokens(prev => prev + (result.debugTurn.tokens?.tokensUsed ?? 0))
      }

      // Process next timer signal from pipeline (e.g., L2 -> start L3)
      if (timerEnabledRef.current && result.timerSignal) {
        processTimerSignal(result.timerSignal)
      }
    } catch (err) {
      setIsTyping(false)
      console.error(`[Timer L${level}] Failed to process timer expiry:`, err)
    }
  }, [processTimerSignal])

  // Keep ref up-to-date with latest handleTimerExpire
  useEffect(() => {
    timerExpireRef.current = handleTimerExpire
  }, [handleTimerExpire])

  // Initialize simulator on mount
  useEffect(() => {
    const simulator = new IngestTimerSimulator(
      // onTick: update timer display state
      (remainingMs, level) => {
        setTimerState(prev => ({
          active: true,
          level,
          levelName: simulatorRef.current?.getState().levelName ?? '',
          remainingMs,
          paused: prev.paused,
        }))
      },
      // onExpire: delegate to ref (avoids stale closure)
      (level) => {
        timerExpireRef.current(level)
      }
    )
    simulatorRef.current = simulator
    return () => simulator.destroy()
  }, [])

  // Timer config change handler
  const handleTimerConfigChange = useCallback((newConfig: TimerConfig) => {
    setTimerConfig(newConfig)
    // If timer is active, restart with new duration for current level
    if (timerState.active && timerState.level !== null) {
      const newDurationS = newConfig.levels[timerState.level] ?? TIMER_DEFAULTS.levels[timerState.level]
      simulatorRef.current?.start(timerState.level, newDurationS * 1000)
    }
  }, [timerState])

  // Timer toggle handler (simplified — no evaluateLevel)
  const handleTimerToggle = useCallback((enabled: boolean) => {
    setTimerEnabled(enabled)
    if (!enabled) {
      simulatorRef.current?.stop()
      setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
    }
    // When re-enabled, next pipeline response will start timer via timerSignal
  }, [])

  // Timer pause/resume handler
  const handleTimerPause = useCallback(() => {
    if (timerState.paused) {
      simulatorRef.current?.resume()
    } else {
      simulatorRef.current?.pause()
    }
    setTimerState(prev => ({ ...prev, paused: !prev.paused }))
  }, [timerState.paused])

  // CRM agent toggle handler
  const handleCrmAgentToggle = useCallback((agentId: string, enabled: boolean) => {
    setCrmAgents(prev => prev.map(a =>
      a.agentId === agentId ? { ...a, enabled } : a
    ))
  }, [])

  // CRM agent mode change handler
  const handleCrmAgentModeChange = useCallback((agentId: string, mode: CrmExecutionMode) => {
    setCrmAgents(prev => prev.map(a =>
      a.agentId === agentId ? { ...a, mode } : a
    ))
  }, [])

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

    // 1b. V3 interruption: if already processing, queue the message
    if (isTyping && agentIdRef.current === 'somnio-sales-v3') {
      setQueuedMessages(prev => [...prev, content])
      return
    }

    // 2. Show typing indicator
    setIsTyping(true)

    // 3. Build history for API (use ref to avoid stale closure in async callback)
    const history = messagesRef.current.map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content })

    // 4. Build CRM agents payload (use ref to avoid stale closure in async callback)
    const enabledCrmAgents = crmAgentsRef.current
      .filter(a => a.enabled)
      .map(a => ({ agentId: a.agentId, mode: a.mode }))

    try {
      // 5. Process message via server API (use ref to avoid stale closure in async callback)
      const turnNumber = debugTurnsRef.current.length + 1
      const response = await fetch('/api/sandbox/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          state: stateRef.current,
          history,
          turnNumber,
          crmAgents: enabledCrmAgents,
          workspaceId: workspaceRef.current?.id,
          agentId: agentIdRef.current,
        }),
      })

      const result: SandboxEngineResult = await response.json()

      // 6. Hide typing and add response messages with delays
      if (result.success && result.messages.length > 0) {
        for (let i = 0; i < result.messages.length; i++) {
          // Proportional delay based on message length and slider setting
          const baseDelay = calculateCharDelay(AVG_TEMPLATE_CHARS)
          const multiplier = baseDelay > 0 ? responseDelayMs / baseDelay : 0
          const delay = calculateCharDelay(result.messages[i].length) * multiplier
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }

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
      setQueuedMessages([])

      // 7. Update state and debug info
      setState(result.newState)
      setDebugTurns(prev => [...prev, result.debugTurn])
      setTotalTokens(prev => prev + (result.debugTurn?.tokens?.tokensUsed ?? 0))

      // 8. Process timer signals from pipeline (quick-013: simplified)
      if (timerEnabledRef.current && result.timerSignal) {
        processTimerSignal(result.timerSignal)
      }
    } catch (error) {
      setIsTyping(false)
      console.error('[Sandbox] Error processing message:', error)
    }
  }, [responseDelayMs, timerConfig, processTimerSignal, isTyping])

  // Handle session reset (preserves CRM agent selection, stops timer)
  const handleReset = useCallback(() => {
    setMessages([])
    setState(INITIAL_STATE)
    setDebugTurns([])
    setTotalTokens(0)
    setIsTyping(false)
    setQueuedMessages([])
    // Stop timer on reset
    simulatorRef.current?.stop()
    setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
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
        crmAgents={crmAgents}
        onCrmAgentToggle={handleCrmAgentToggle}
        onCrmAgentModeChange={handleCrmAgentModeChange}
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
              inputDisabled={agentId === 'somnio-sales-v3' ? false : isTyping}
            />
          }
          rightPanel={
            agentId === 'somnio-sales-v3' ? (
              <DebugV3
                debugTurns={debugTurns}
                state={state}
                totalTokens={totalTokens}
                queuedMessages={queuedMessages}
                isProcessing={isTyping}
                responseDelayMs={responseDelayMs}
                onResponseDelayChange={setResponseDelayMs}
                timerEnabled={timerEnabled}
                timerConfig={timerConfig}
                onTimerToggle={handleTimerToggle}
                onTimerConfigChange={handleTimerConfigChange}
                timerState={timerState}
              />
            ) : (
              <DebugTabs
                debugTurns={debugTurns}
                state={state}
                onStateEdit={handleStateEdit}
                totalTokens={totalTokens}
                agentName={AGENT_NAMES[agentId] ?? agentId}
                responseDelayMs={responseDelayMs}
                onResponseDelayChange={setResponseDelayMs}
                timerState={timerState}
                timerEnabled={timerEnabled}
                timerConfig={timerConfig}
                onTimerToggle={handleTimerToggle}
                onTimerConfigChange={handleTimerConfigChange}
                onTimerPause={handleTimerPause}
              />
            )
          }
        />
      </div>
    </div>
  )
}
