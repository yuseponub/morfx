'use client'

/**
 * Debug Tabs Component
 * Phase 15.6: Sandbox Evolution
 *
 * Multi-panel debug container with draggable tab bar.
 * Supports up to 3 visible panels simultaneously.
 */

import { useState, useCallback } from 'react'
import { TabBar } from './tab-bar'
import { PanelContainer } from './panel-container'
import type { DebugTurn, SandboxState, DebugPanelTab, DebugPanelTabId, TimerState, TimerConfig, SilenceTimerState } from '@/lib/sandbox/types'

const DEFAULT_TABS: DebugPanelTab[] = [
  { id: 'pipeline', label: 'Pipeline', visible: true },
  { id: 'classify', label: 'Classify', visible: true },
  { id: 'bloques', label: 'Bloques', visible: true },
  { id: 'tools', label: 'Tools', visible: false },
  { id: 'state', label: 'Estado', visible: false },
  { id: 'tokens', label: 'Tokens', visible: false },
  { id: 'ingest', label: 'Ingest', visible: false },
  { id: 'config', label: 'Config', visible: false },
]

const MAX_VISIBLE = 3

interface DebugTabsProps {
  debugTurns: DebugTurn[]
  state: SandboxState
  onStateEdit: (newState: SandboxState) => void
  totalTokens: number
  agentName: string
  responseDelayMs: number
  onResponseDelayChange: (delayMs: number) => void
  // Timer props (Phase 15.7)
  timerState: TimerState
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
  onTimerPause: () => void
  // Silence retake timer (Phase 30)
  silenceTimerState: SilenceTimerState
  silenceDurationMs: number
  onSilenceDurationChange: (ms: number) => void
}

export function DebugTabs({
  debugTurns,
  state,
  onStateEdit,
  totalTokens,
  agentName,
  responseDelayMs,
  onResponseDelayChange,
  timerState,
  timerEnabled,
  timerConfig,
  onTimerToggle,
  onTimerConfigChange,
  onTimerPause,
  silenceTimerState,
  silenceDurationMs,
  onSilenceDurationChange,
}: DebugTabsProps) {
  const [tabs, setTabs] = useState<DebugPanelTab[]>(DEFAULT_TABS)

  const handleReorder = useCallback((newTabs: DebugPanelTab[]) => {
    setTabs(newTabs)
  }, [])

  const handleToggleTab = useCallback((tabId: DebugPanelTabId) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === tabId)
      if (!tab) return prev

      // If already visible, toggle off
      if (tab.visible) {
        return prev.map(t => t.id === tabId ? { ...t, visible: false } : t)
      }

      // If not visible, check if we can add more
      const visibleCount = prev.filter(t => t.visible).length
      if (visibleCount >= MAX_VISIBLE) return prev // Can't add more

      return prev.map(t => t.id === tabId ? { ...t, visible: true } : t)
    })
  }, [])

  const visiblePanels = tabs.filter(t => t.visible).map(t => t.id)

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-medium">Debug Panel</h3>
      </div>

      <TabBar
        tabs={tabs}
        onReorder={handleReorder}
        onToggleTab={handleToggleTab}
        maxVisible={MAX_VISIBLE}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <PanelContainer
          visiblePanels={visiblePanels}
          debugTurns={debugTurns}
          state={state}
          onStateEdit={onStateEdit}
          totalTokens={totalTokens}
          agentName={agentName}
          responseDelayMs={responseDelayMs}
          onResponseDelayChange={onResponseDelayChange}
          timerState={timerState}
          timerEnabled={timerEnabled}
          timerConfig={timerConfig}
          onTimerToggle={onTimerToggle}
          onTimerConfigChange={onTimerConfigChange}
          onTimerPause={onTimerPause}
          silenceTimerState={silenceTimerState}
          silenceDurationMs={silenceDurationMs}
          onSilenceDurationChange={onSilenceDurationChange}
        />
      </div>
    </div>
  )
}
