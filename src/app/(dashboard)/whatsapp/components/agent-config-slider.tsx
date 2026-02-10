'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, X, Zap, Clock, MessageSquare, Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getAgentConfig, updateAgentConfig } from '@/app/actions/agent-config'
import type { AgentConfig } from '@/lib/agents/production/agent-config'

interface AgentConfigSliderProps {
  workspaceId: string
  onClose: () => void
}

type TimerPreset = 'real' | 'rapido' | 'instantaneo'

const TIMER_PRESETS: { value: TimerPreset; label: string; description: string }[] = [
  { value: 'real', label: 'Real', description: '6-10 min' },
  { value: 'rapido', label: 'Rapido', description: '30-60 seg' },
  { value: 'instantaneo', label: 'Instantaneo', description: '0 seg' },
]

const AVAILABLE_AGENTS = [
  { id: 'somnio-sales-v1', name: 'Somnio Sales v1' },
]

const CRM_AGENTS = [
  { id: 'order-manager', name: 'Order Manager' },
]

/**
 * Agent configuration slider panel.
 * Replaces the contact panel in the right column of the inbox.
 * Provides quick access to global agent settings.
 */
export function AgentConfigSlider({ workspaceId, onClose }: AgentConfigSliderProps) {
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Debounce refs for text/slider changes
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      setIsLoading(true)
      const result = await getAgentConfig()
      if ('success' in result && result.success) {
        setConfig(result.data)
      }
      setIsLoading(false)
    }
    loadConfig()
  }, [])

  // Save helper - immediate for toggles, debounced for text/slider
  const saveConfig = useCallback(async (
    updates: Partial<Omit<AgentConfig, 'workspace_id' | 'created_at' | 'updated_at'>>
  ) => {
    setIsSaving(true)
    const result = await updateAgentConfig(updates)
    if ('success' in result && result.success) {
      setConfig(result.data)
    }
    setIsSaving(false)
  }, [])

  // Handlers for immediate saves (toggles, selects, preset buttons)
  const handleToggleAgent = useCallback((checked: boolean) => {
    setConfig(prev => prev ? { ...prev, agent_enabled: checked } : prev)
    saveConfig({ agent_enabled: checked })
  }, [saveConfig])

  const handleSelectAgent = useCallback((agentId: string) => {
    setConfig(prev => prev ? { ...prev, conversational_agent_id: agentId } : prev)
    saveConfig({ conversational_agent_id: agentId })
  }, [saveConfig])

  const handleToggleCrmAgent = useCallback((agentId: string, checked: boolean) => {
    setConfig(prev => {
      if (!prev) return prev
      const updated = { ...prev.crm_agents_enabled, [agentId]: checked }
      return { ...prev, crm_agents_enabled: updated }
    })
    setConfig(prev => {
      if (prev) {
        const updatedCrm = { ...prev.crm_agents_enabled }
        saveConfig({ crm_agents_enabled: updatedCrm })
      }
      return prev
    })
  }, [saveConfig])

  const handleSelectPreset = useCallback((preset: TimerPreset) => {
    setConfig(prev => prev ? { ...prev, timer_preset: preset } : prev)
    saveConfig({ timer_preset: preset })
  }, [saveConfig])

  // Debounced handlers for text/slider
  const handleHandoffChange = useCallback((value: string) => {
    setConfig(prev => prev ? { ...prev, handoff_message: value } : prev)
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
    handoffTimerRef.current = setTimeout(() => {
      saveConfig({ handoff_message: value })
    }, 300)
  }, [saveConfig])

  const handleSpeedChange = useCallback((values: number[]) => {
    const speed = values[0]
    setConfig(prev => prev ? { ...prev, response_speed: speed } : prev)
    if (speedTimerRef.current) clearTimeout(speedTimerRef.current)
    speedTimerRef.current = setTimeout(() => {
      saveConfig({ response_speed: speed })
    }, 300)
  }, [saveConfig])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
      if (speedTimerRef.current) clearTimeout(speedTimerRef.current)
    }
  }, [])

  // Loading state
  if (isLoading || !config) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-14 px-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="font-medium">Configuracion de Agente</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-14 px-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <span className="font-medium">Configuracion de Agente</span>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Section 1: Global toggle */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
                config.agent_enabled
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}>
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-sm">Agente activo</p>
                <p className="text-xs text-muted-foreground">
                  {config.agent_enabled ? 'Procesando mensajes' : 'Desactivado'}
                </p>
              </div>
            </div>
            <Switch
              checked={config.agent_enabled}
              onCheckedChange={handleToggleAgent}
            />
          </div>
        </div>

        <Separator />

        {/* Section 2: Conversational agent selector */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Agente Conversacional</span>
          </div>
          <Select
            value={config.conversational_agent_id}
            onValueChange={handleSelectAgent}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar agente" />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_AGENTS.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Section 3: CRM agents */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Agentes CRM</span>
          </div>
          <div className="space-y-2">
            {CRM_AGENTS.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{agent.name}</span>
                <Switch
                  size="sm"
                  checked={config.crm_agents_enabled[agent.id] ?? false}
                  onCheckedChange={(checked) => handleToggleCrmAgent(agent.id, checked)}
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Section 4: Handoff message */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Mensaje de handoff</span>
          </div>
          <Textarea
            value={config.handoff_message}
            onChange={(e) => handleHandoffChange(e.target.value)}
            placeholder="Mensaje cuando el agente transfiere a un humano..."
            className="resize-none text-sm"
            rows={2}
          />
        </div>

        <Separator />

        {/* Section 5: Timer preset */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Timer preset</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TIMER_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handleSelectPreset(preset.value)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border text-center transition-colors ${
                  config.timer_preset === preset.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <span className="text-xs font-medium">{preset.label}</span>
                <span className="text-[10px] text-muted-foreground">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Section 6: Response speed */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Velocidad de respuesta</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {config.response_speed.toFixed(1)}x
            </span>
          </div>
          <Slider
            value={[config.response_speed]}
            onValueChange={handleSpeedChange}
            min={0.5}
            max={2.0}
            step={0.1}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.5x (lento)</span>
            <span>2.0x (rapido)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
