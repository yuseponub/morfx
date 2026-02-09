'use client'

/**
 * Sandbox Layout Component
 * Phase 15: Agent Sandbox
 *
 * Complete layout with chat, debug panel, session management,
 * and CRM agent state management.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { SandboxHeader } from './sandbox-header'
import { SandboxChat } from './sandbox-chat'
import { DebugTabs } from './debug-panel'
import type { SandboxState, DebugTurn, SandboxMessage, SavedSandboxSession, SandboxEngineResult, CrmAgentState, CrmExecutionMode, ResponseSpeedPreset, TimerState, TimerConfig, TimerEvalContext, TimerAction } from '@/lib/sandbox/types'
import { IngestTimerSimulator, TIMER_DEFAULTS, TIMER_LEVELS } from '@/lib/sandbox/ingest-timer'
import { getMessageDelay } from './debug-panel/config-tab'
import { getLastAgentId, setLastAgentId } from '@/lib/sandbox/sandbox-session'
import { useWorkspace } from '@/components/providers/workspace-provider'

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

const AGENT_NAMES: Record<string, string> = {
  'somnio-sales-v1': 'Somnio Sales Agent',
}

export function SandboxLayout() {
  // Session state
  const [agentId, setAgentId] = useState<string>(getLastAgentId() ?? DEFAULT_AGENT_ID)
  const [messages, setMessages] = useState<SandboxMessage[]>([])
  const [state, setState] = useState<SandboxState>(INITIAL_STATE)
  const [debugTurns, setDebugTurns] = useState<DebugTurn[]>([])
  const [totalTokens, setTotalTokens] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [responseSpeed, setResponseSpeed] = useState<ResponseSpeedPreset>('real')

  // Timer state (Phase 15.7)
  const [timerState, setTimerState] = useState<TimerState>({
    active: false,
    level: null,
    levelName: '',
    remainingMs: 0,
    paused: false,
  })
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerConfig, setTimerConfig] = useState<TimerConfig>(TIMER_DEFAULTS)
  const simulatorRef = useRef<IngestTimerSimulator | null>(null)
  const stateRef = useRef<SandboxState>(INITIAL_STATE)

  // Workspace ID for LIVE mode CRM operations
  const { workspace } = useWorkspace()

  // CRM agent state - initialized from registry via API
  const [crmAgents, setCrmAgents] = useState<CrmAgentState[]>([])
  const crmAgentsRef = useRef<CrmAgentState[]>([])
  const workspaceRef = useRef(workspace)

  // Load CRM agents from registry on mount
  useEffect(() => {
    fetch('/api/sandbox/crm-agents')
      .then(res => res.json())
      .then((agents: CrmAgentState[]) => setCrmAgents(agents))
      .catch(err => console.error('[Sandbox] Failed to load CRM agents:', err))
  }, [])

  // ============================================================================
  // Timer Lifecycle (Phase 15.7)
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

  const timerEnabledRef = useRef(false)
  useEffect(() => {
    timerEnabledRef.current = timerEnabled
  }, [timerEnabled])

  // Ref to hold latest handleTimerExpire to avoid stale closures in simulator
  const timerExpireRef = useRef<(level: number, action: TimerAction) => void>(() => {})

  // Helper: start timer at a specific level
  const startTimerForLevel = useCallback((level: number) => {
    const durationS = timerConfig.levels[level] ?? TIMER_DEFAULTS.levels[level]
    const durationMs = durationS * 1000
    simulatorRef.current?.start(level, durationMs)
  }, [timerConfig])

  // Handle timer expiration: inject message, handle transitions, chain timers
  const handleTimerExpire = useCallback((level: number, action: TimerAction) => {
    // 1. Inject message into chat (if action has one)
    if (action.message) {
      const timerMessage: SandboxMessage = {
        id: `msg-${Date.now()}-timer`,
        role: 'assistant',
        content: action.message,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, timerMessage])
    }

    // 2. Handle mode transition (level 2: silent transition to ofrecer_promos)
    if (action.type === 'transition_mode' && action.targetMode) {
      setState(prev => ({ ...prev, currentMode: action.targetMode! }))

      // Level 2: transition to ofrecer_promos + trigger engine to send promo templates
      if (level === 2) {
        const triggerPromos = async () => {
          const currentMessages = messagesRef.current
          const currentDebugTurns = debugTurnsRef.current
          const currentState = stateRef.current
          const updatedState = { ...currentState, currentMode: action.targetMode! }
          const history = currentMessages.map(m => ({ role: m.role, content: m.content }))

          try {
            setIsTyping(true)
            const response = await fetch('/api/sandbox/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: '[timer: datos mínimos completos]',
                state: updatedState,
                history,
                turnNumber: currentDebugTurns.length + 1,
                forceIntent: 'ofrecer_promos',
              }),
            })
            const result = await response.json()
            setIsTyping(false)

            if (result.success && result.messages?.length > 0) {
              for (const msg of result.messages) {
                const assistantMsg: SandboxMessage = {
                  id: `msg-${Date.now()}-timer-promo-${Math.random().toString(36).slice(2, 7)}`,
                  role: 'assistant' as const,
                  content: msg,
                  timestamp: new Date().toISOString(),
                }
                setMessages(prev => [...prev, assistantMsg])
                await new Promise(r => setTimeout(r, 2000))
              }
            }

            // Update state and debug from engine response
            if (result.newState) {
              setState(result.newState)
            }
            if (result.debugTurn) {
              setDebugTurns(prev => [...prev, result.debugTurn])
              setTotalTokens(prev => prev + (result.debugTurn.tokens?.tokensUsed ?? 0))
            }
          } catch (err) {
            setIsTyping(false)
            console.error('[Timer L2] Failed to trigger ofrecer_promos:', err)
          }

          // Chain to level 3 after promos sent
          startTimerForLevel(3)
        }
        setTimeout(() => { triggerPromos() }, 200)
      }
    }

    // 3. Handle order creation (levels 3, 4) via CRM orchestrator
    if (action.type === 'create_order') {
      const triggerOrderCreation = async () => {
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
              message: `[timer: ${level === 3 ? 'promos sin respuesta' : 'pack sin confirmar'}]`,
              state: currentState,
              history,
              turnNumber: currentDebugTurns.length + 1,
              crmAgents: enabledCrmAgents,
              workspaceId: workspaceRef.current?.id,
              forceIntent: 'compra_confirmada',
            }),
          })
          const result = await response.json()
          setIsTyping(false)

          if (result.success && result.messages?.length > 0) {
            for (const msg of result.messages) {
              const assistantMsg: SandboxMessage = {
                id: `msg-${Date.now()}-timer-order-${Math.random().toString(36).slice(2, 7)}`,
                role: 'assistant' as const,
                content: msg,
                timestamp: new Date().toISOString(),
              }
              setMessages(prev => [...prev, assistantMsg])
              await new Promise(r => setTimeout(r, 2000))
            }
          }

          if (result.newState) {
            setState(result.newState)
          }
          if (result.debugTurn) {
            setDebugTurns(prev => [...prev, result.debugTurn])
            setTotalTokens(prev => prev + (result.debugTurn.tokens?.tokensUsed ?? 0))
          }
        } catch (err) {
          setIsTyping(false)
          console.error(`[Timer L${level}] Failed to create order:`, err)
        }
      }
      setTimeout(() => { triggerOrderCreation() }, 200)
    }

    // 4. Reset timer state display (timer has expired)
    setTimerState({
      active: false,
      level: null,
      levelName: '',
      remainingMs: 0,
      paused: false,
    })
  }, [startTimerForLevel])

  // Keep ref up-to-date with latest handleTimerExpire
  useEffect(() => {
    timerExpireRef.current = handleTimerExpire
  }, [handleTimerExpire])

  // Initialize simulator on mount
  useEffect(() => {
    const simulator = new IngestTimerSimulator(
      // onTick: update timer display state
      (remainingMs, level) => {
        const levelConfig = TIMER_LEVELS.find(l => l.id === level)
        setTimerState(prev => ({
          active: true,
          level,
          levelName: levelConfig?.name ?? '',
          remainingMs,
          paused: prev.paused,
        }))
      },
      // onExpire: delegate to ref (avoids stale closure)
      (level, action) => {
        timerExpireRef.current(level, action)
      }
    )
    // Provide real context at expiration time (Phase 15.7 fix)
    // Uses stateRef to avoid stale closure - always reads latest state
    simulator.setContextProvider(() => {
      const s = stateRef.current
      const fieldsCollected = Object.keys(s.datosCapturados).filter(
        k => s.datosCapturados[k] && s.datosCapturados[k] !== 'N/A'
      )
      return {
        fieldsCollected,
        totalFields: fieldsCollected.length,
        currentMode: s.currentMode,
        packSeleccionado: s.packSeleccionado ?? null,
        promosOffered: s.intentsVistos.includes('ofrecer_promos'),
      }
    })

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

  // Timer toggle handler
  const handleTimerToggle = useCallback((enabled: boolean) => {
    setTimerEnabled(enabled)
    if (!enabled) {
      simulatorRef.current?.stop()
      setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
    }
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

    // 2. Show typing indicator
    setIsTyping(true)

    // 3. Build history for API
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content })

    // 4. Build CRM agents payload (only enabled ones)
    const enabledCrmAgents = crmAgents
      .filter(a => a.enabled)
      .map(a => ({ agentId: a.agentId, mode: a.mode }))

    try {
      // 5. Process message via server API
      const turnNumber = debugTurns.length + 1
      const response = await fetch('/api/sandbox/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          state,
          history,
          turnNumber,
          crmAgents: enabledCrmAgents,
          workspaceId: workspace?.id,
        }),
      })

      const result: SandboxEngineResult = await response.json()

      // 6. Hide typing and add response messages with delays
      if (result.success && result.messages.length > 0) {
        for (let i = 0; i < result.messages.length; i++) {
          // Configurable delay between messages (via Config tab preset)
          const delay = getMessageDelay(responseSpeed)
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

      // 7. Update state and debug info
      setState(result.newState)
      setDebugTurns(prev => [...prev, result.debugTurn])
      setTotalTokens(prev => prev + result.debugTurn.tokens.tokensUsed)

      // 8. Process timer signals from SandboxEngine (Phase 15.7)
      // Use ref to avoid stale closure (timerEnabled may be outdated after message delays)
      if (timerEnabledRef.current && result.timerSignal) {
        const signal = result.timerSignal
        if (signal.type === 'start') {
          // Build eval context from new state
          const fieldsCollected = Object.keys(result.newState.datosCapturados).filter(
            k => result.newState.datosCapturados[k] && result.newState.datosCapturados[k] !== 'N/A'
          )
          const ctx: TimerEvalContext = {
            fieldsCollected,
            totalFields: fieldsCollected.length,
            currentMode: result.newState.currentMode,
            packSeleccionado: result.newState.packSeleccionado ?? null,
            promosOffered: result.newState.intentsVistos.includes('ofrecer_promos'),
          }
          const level = simulatorRef.current?.evaluateLevel(ctx)
          if (level !== null && level !== undefined) {
            startTimerForLevel(level)
          }
        } else if (signal.type === 'reevaluate') {
          const fieldsCollected = Object.keys(result.newState.datosCapturados).filter(
            k => result.newState.datosCapturados[k] && result.newState.datosCapturados[k] !== 'N/A'
          )
          const ctx: TimerEvalContext = {
            fieldsCollected,
            totalFields: fieldsCollected.length,
            currentMode: result.newState.currentMode,
            packSeleccionado: result.newState.packSeleccionado ?? null,
            promosOffered: result.newState.intentsVistos.includes('ofrecer_promos'),
          }
          simulatorRef.current?.reevaluateLevel(ctx, timerConfig)
        } else if (signal.type === 'cancel') {
          simulatorRef.current?.stop()
          setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
        }
      }
    } catch (error) {
      setIsTyping(false)
      console.error('[Sandbox] Error processing message:', error)
    }
  }, [messages, state, debugTurns, crmAgents, responseSpeed, timerConfig, startTimerForLevel])

  // Handle session reset (preserves CRM agent selection, stops timer)
  const handleReset = useCallback(() => {
    setMessages([])
    setState(INITIAL_STATE)
    setDebugTurns([])
    setTotalTokens(0)
    setIsTyping(false)
    // Stop timer on reset (Phase 15.7)
    simulatorRef.current?.stop()
    setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
    setTimerEnabled(false)
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
            />
          }
          rightPanel={
            <DebugTabs
              debugTurns={debugTurns}
              state={state}
              onStateEdit={handleStateEdit}
              totalTokens={totalTokens}
              agentName={AGENT_NAMES[agentId] ?? agentId}
              responseSpeed={responseSpeed}
              onResponseSpeedChange={setResponseSpeed}
              timerState={timerState}
              timerEnabled={timerEnabled}
              timerConfig={timerConfig}
              onTimerToggle={handleTimerToggle}
              onTimerConfigChange={handleTimerConfigChange}
              onTimerPause={handleTimerPause}
            />
          }
        />
      </div>
    </div>
  )
}
