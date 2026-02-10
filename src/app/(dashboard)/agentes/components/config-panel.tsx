'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bot,
  Zap,
  Clock,
  MessageSquare,
  Loader2,
  Save,
} from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getAgentConfig, updateAgentConfig } from '@/app/actions/agent-config'
import type { AgentConfig } from '@/lib/agents/production/agent-config'

// ============================================================================
// CONSTANTS
// ============================================================================

type TimerPreset = 'real' | 'rapido' | 'instantaneo'

const TIMER_PRESETS: { value: TimerPreset; label: string; description: string; detail: string }[] = [
  { value: 'real', label: 'Real', description: '6-10 min', detail: 'Tiempos reales de produccion. El agente espera 6 min por datos parciales y 10 min sin datos.' },
  { value: 'rapido', label: 'Rapido', description: '30-60 seg', detail: 'Tiempos reducidos para pruebas rapidas. 30 seg datos parciales, 60 seg sin datos.' },
  { value: 'instantaneo', label: 'Instantaneo', description: '0 seg', detail: 'Sin espera. El agente actua inmediatamente. Solo para demos.' },
]

const AVAILABLE_AGENTS = [
  { id: 'somnio-sales-v1', name: 'Somnio Sales v1', description: 'Agente de ventas para Somnio. Captura datos, ofrece promos y crea ordenes.' },
]

const CRM_AGENTS = [
  { id: 'order-manager', name: 'Order Manager', description: 'Crea ordenes de compra automaticamente cuando el cliente confirma.' },
]

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Full-page agent configuration panel.
 * Same fields as AgentConfigSlider but with full layout, descriptions, and more space.
 */
export function ConfigPanel() {
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Debounce refs
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

  // Save helper
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

  // Immediate handlers (toggles, selects)
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

  // Debounced handlers (text, slider)
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

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
      if (speedTimerRef.current) clearTimeout(speedTimerRef.current)
    }
  }, [])

  // Loading state
  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Saving indicator */}
      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Save className="h-3 w-3 animate-pulse" />
          Guardando...
        </div>
      )}

      {/* Section 1: Global toggle */}
      <Card>
        <CardHeader>
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
                <CardTitle className="text-base">Agente activo</CardTitle>
                <CardDescription>
                  {config.agent_enabled
                    ? 'El agente esta procesando mensajes de WhatsApp'
                    : 'El agente esta desactivado. Los mensajes no seran procesados automaticamente.'}
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={config.agent_enabled}
              onCheckedChange={handleToggleAgent}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Section 2: Conversational agent */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Agente Conversacional</CardTitle>
          </div>
          <CardDescription>
            El agente que maneja las conversaciones de WhatsApp. Detecta intenciones, captura datos y ofrece promos.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                  <div className="flex flex-col">
                    <span>{agent.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {AVAILABLE_AGENTS.find(a => a.id === config.conversational_agent_id) && (
            <p className="text-xs text-muted-foreground mt-2">
              {AVAILABLE_AGENTS.find(a => a.id === config.conversational_agent_id)?.description}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 3: CRM agents */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Agentes CRM</CardTitle>
          </div>
          <CardDescription>
            Agentes que ejecutan acciones en el CRM automaticamente cuando el agente conversacional lo solicita.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CRM_AGENTS.map((agent) => (
            <div key={agent.id} className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-sm font-medium">{agent.name}</span>
                <p className="text-xs text-muted-foreground">{agent.description}</p>
              </div>
              <Switch
                checked={config.crm_agents_enabled[agent.id] ?? false}
                onCheckedChange={(checked) => handleToggleCrmAgent(agent.id, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 4: Handoff message */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Mensaje de handoff</CardTitle>
          </div>
          <CardDescription>
            Mensaje que se envia al cliente cuando el agente no puede resolver la consulta y transfiere a un humano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={config.handoff_message}
            onChange={(e) => handleHandoffChange(e.target.value)}
            placeholder="Mensaje cuando el agente transfiere a un humano..."
            className="resize-none text-sm"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Section 5: Timer preset */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Timer preset</CardTitle>
          </div>
          <CardDescription>
            Controla cuanto tiempo espera el agente antes de tomar acciones proactivas (ofrecer promos, pedir datos faltantes).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {TIMER_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handleSelectPreset(preset.value)}
                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border text-center transition-colors ${
                  config.timer_preset === preset.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <span className="text-sm font-medium">{preset.label}</span>
                <span className="text-xs text-muted-foreground">{preset.description}</span>
              </button>
            ))}
          </div>
          {TIMER_PRESETS.find(p => p.value === config.timer_preset) && (
            <p className="text-xs text-muted-foreground">
              {TIMER_PRESETS.find(p => p.value === config.timer_preset)?.detail}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 6: Response speed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Velocidad de respuesta</CardTitle>
              </div>
              <CardDescription className="mt-1">
                Multiplicador para los delays simulados entre mensajes del agente. Menor = mas natural, mayor = mas rapido.
              </CardDescription>
            </div>
            <span className="text-lg font-mono font-bold text-primary">
              {config.response_speed.toFixed(1)}x
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Slider
            value={[config.response_speed]}
            onValueChange={handleSpeedChange}
            min={0.5}
            max={2.0}
            step={0.1}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>0.5x (natural)</span>
            <span>1.0x (normal)</span>
            <span>2.0x (rapido)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
