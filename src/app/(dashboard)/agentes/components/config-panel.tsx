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
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getAgentConfig, updateAgentConfig } from '@/app/actions/agent-config'
import type { AgentConfig } from '@/lib/agents/production/agent-config'
import { AGENT_CATALOG } from '@/lib/agents/agent-catalog'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

// ============================================================================
// CONSTANTS
// ============================================================================

type TimerPreset = 'real' | 'rapido' | 'instantaneo'

const TIMER_PRESETS: { value: TimerPreset; label: string; description: string; detail: string }[] = [
  { value: 'real', label: 'Real', description: '6-10 min', detail: 'Tiempos reales de produccion. El agente espera 6 min por datos parciales y 10 min sin datos.' },
  { value: 'rapido', label: 'Rapido', description: '30-60 seg', detail: 'Tiempos reducidos para pruebas rapidas. 30 seg datos parciales, 60 seg sin datos.' },
  { value: 'instantaneo', label: 'Instantaneo', description: '0 seg', detail: 'Sin espera. El agente actua inmediatamente. Solo para demos.' },
]

type SpeedPreset = { value: number; label: string; description: string; detail: string }

const SPEED_PRESETS: SpeedPreset[] = [
  { value: 1.0, label: 'Real', description: '2-6 seg', detail: 'Delays tal cual vienen en los templates. El agente responde con pausas naturales.' },
  { value: 0.2, label: 'Rapido', description: '0.5-1 seg', detail: 'Delays reducidos al 20%. Respuestas rapidas pero con algo de pausa.' },
  { value: 0.0, label: 'Instantaneo', description: '0 seg', detail: 'Sin delays. Todos los mensajes se envian inmediatamente.' },
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
  const v2 = useDashboardV2()

  // Debounce refs
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Save helper - reverts optimistic state on error
  const saveConfig = useCallback(async (
    updates: Partial<Omit<AgentConfig, 'workspace_id' | 'created_at' | 'updated_at'>>,
    previousConfig?: AgentConfig | null
  ) => {
    setIsSaving(true)
    const result = await updateAgentConfig(updates)
    if ('success' in result && result.success) {
      setConfig(result.data)
    } else if ('error' in result) {
      // Revert to previous state
      if (previousConfig) setConfig(previousConfig)
      toast.error(result.error)
    }
    setIsSaving(false)
  }, [])

  // Immediate handlers (toggles, selects)
  const handleToggleAgent = useCallback((checked: boolean) => {
    const prev = config
    setConfig(p => p ? { ...p, agent_enabled: checked } : p)
    saveConfig({ agent_enabled: checked }, prev)
  }, [saveConfig, config])

  const handleSelectAgent = useCallback((agentId: string) => {
    const prev = config
    setConfig(p => p ? { ...p, conversational_agent_id: agentId } : p)
    saveConfig({ conversational_agent_id: agentId }, prev)
  }, [saveConfig, config])

  const handleToggleCrmAgent = useCallback((agentId: string, checked: boolean) => {
    const prev = config
    const updatedCrm = { ...config?.crm_agents_enabled, [agentId]: checked }
    setConfig(p => p ? { ...p, crm_agents_enabled: updatedCrm } : p)
    saveConfig({ crm_agents_enabled: updatedCrm }, prev)
  }, [saveConfig, config])

  const handleSelectPreset = useCallback((preset: TimerPreset) => {
    const prev = config
    setConfig(p => p ? { ...p, timer_preset: preset } : p)
    saveConfig({ timer_preset: preset }, prev)
  }, [saveConfig, config])

  // Debounced handlers (text, slider)
  const handleHandoffChange = useCallback((value: string) => {
    const prev = config
    setConfig(p => p ? { ...p, handoff_message: value } : p)
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
    handoffTimerRef.current = setTimeout(() => {
      saveConfig({ handoff_message: value }, prev)
    }, 300)
  }, [saveConfig, config])

  const handleSelectSpeed = useCallback((speed: number) => {
    const prev = config
    setConfig(p => p ? { ...p, response_speed: speed } : p)
    saveConfig({ response_speed: speed }, prev)
  }, [saveConfig, config])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current)
    }
  }, [])

  // Loading state
  if (isLoading || !config) {
    return v2 ? (
      <div className="max-w-3xl space-y-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-[var(--paper-2)] border border-[var(--border)] h-[120px]"
            style={{ animation: 'mx-pulse 1.5s ease-in-out infinite' }}
            aria-hidden
          />
        ))}
      </div>
    ) : (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Saving indicator */}
      {isSaving && (
        v2 ? (
          <div
            className="flex items-center gap-2 text-[11px] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <Save className="h-3 w-3 animate-pulse text-[var(--ink-3)]" aria-hidden />
            Guardando…
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Save className="h-3 w-3 animate-pulse" />
            Guardando...
          </div>
        )
      )}

      {/* Section 1: Global toggle */}
      {v2 ? (
        <article
          className="border border-[var(--ink-1)] bg-[var(--paper-2)] p-6"
          style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div
                className={cn(
                  'h-10 w-10 grid place-items-center border flex-shrink-0',
                  config.agent_enabled
                    ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--rubric-2)]'
                    : 'bg-[var(--paper-2)] border-[var(--ink-3)] text-[var(--ink-3)]'
                )}
              >
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  className="text-[16px] font-semibold leading-tight text-[var(--ink-1)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Agente activo
                </h3>
                <p
                  className="mt-1 text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {config.agent_enabled
                    ? 'El agente esta procesando mensajes de WhatsApp'
                    : 'El agente esta desactivado. Los mensajes no seran procesados automaticamente.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                className={cn('mx-tag', config.agent_enabled ? 'mx-tag--verdigris' : 'mx-tag--ink')}
                aria-label={config.agent_enabled ? 'Estado activo' : 'Estado pausado'}
              >
                {config.agent_enabled ? '● Activo' : '◐ Pausado'}
              </span>
              <Switch
                checked={config.agent_enabled}
                onCheckedChange={handleToggleAgent}
              />
            </div>
          </div>
        </article>
      ) : (
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
      )}

      {/* Section 2: Conversational agent */}
      {v2 ? (
        <article
          className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
          style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
        >
          <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
              <h3
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Agente Conversacional
              </h3>
            </div>
            <p
              className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              El agente que maneja las conversaciones de WhatsApp. Detecta intenciones, captura datos y ofrece promos.
            </p>
          </header>
          <div className="px-6 py-5">
            <Select
              value={config.conversational_agent_id}
              onValueChange={handleSelectAgent}
            >
              <SelectTrigger
                className="w-full bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] rounded-[3px] focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-0"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <SelectValue placeholder="Seleccionar agente" />
              </SelectTrigger>
              <SelectContent>
                {AGENT_CATALOG.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex flex-col">
                      <span>{agent.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {AGENT_CATALOG.find(a => a.id === config.conversational_agent_id) && (
              <p
                className="text-[12px] italic text-[var(--ink-3)] mt-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {AGENT_CATALOG.find(a => a.id === config.conversational_agent_id)?.description}
              </p>
            )}
          </div>
        </article>
      ) : (
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
                {AGENT_CATALOG.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex flex-col">
                      <span>{agent.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {AGENT_CATALOG.find(a => a.id === config.conversational_agent_id) && (
              <p className="text-xs text-muted-foreground mt-2">
                {AGENT_CATALOG.find(a => a.id === config.conversational_agent_id)?.description}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 3: CRM agents */}
      {v2 ? (
        <article
          className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
          style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
        >
          <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
              <h3
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Agentes CRM
              </h3>
            </div>
            <p
              className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Agentes que ejecutan acciones en el CRM automaticamente cuando el agente conversacional lo solicita.
            </p>
          </header>
          <div className="px-6 py-4 space-y-3">
            {CRM_AGENTS.map((agent) => {
              const enabled = config.crm_agents_enabled[agent.id] ?? false
              return (
                <div
                  key={agent.id}
                  className="flex items-start justify-between gap-4 py-2 border-b border-dotted border-[var(--border)] last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[14px] font-semibold text-[var(--ink-1)]"
                        style={{ fontFamily: 'var(--font-sans)' }}
                      >
                        {agent.name}
                      </span>
                      <span
                        className={cn('mx-tag', enabled ? 'mx-tag--verdigris' : 'mx-tag--ink')}
                        aria-label={enabled ? 'Activo' : 'Inactivo'}
                      >
                        {enabled ? '● Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <p
                      className="mt-1 text-[12px] italic text-[var(--ink-3)] leading-[1.5]"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      {agent.description}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(checked) => handleToggleCrmAgent(agent.id, checked)}
                  />
                </div>
              )
            })}
          </div>
        </article>
      ) : (
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
      )}

      {/* Section 4: Handoff message */}
      {v2 ? (
        <article
          className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
          style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
        >
          <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
              <h3
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Mensaje de handoff
              </h3>
            </div>
            <p
              className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Mensaje que se envia al cliente cuando el agente no puede resolver la consulta y transfiere a un humano.
            </p>
          </header>
          <div className="px-6 py-5">
            <Textarea
              value={config.handoff_message}
              onChange={(e) => handleHandoffChange(e.target.value)}
              placeholder="Mensaje cuando el agente transfiere a un humano…"
              className="resize-none w-full bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] text-[14px] leading-[1.55] rounded-[3px] focus-visible:ring-[var(--ink-1)] focus-visible:ring-offset-0 placeholder:text-[var(--ink-3)] placeholder:italic"
              style={{ fontFamily: 'var(--font-mono)' }}
              rows={4}
            />
          </div>
        </article>
      ) : (
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
      )}

      {/* Section 5: Timer preset */}
      {v2 ? (
        <article
          className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
          style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
        >
          <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
              <h3
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Timer preset
              </h3>
            </div>
            <p
              className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Controla cuanto tiempo espera el agente antes de tomar acciones proactivas (ofrecer promos, pedir datos faltantes).
            </p>
          </header>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {TIMER_PRESETS.map((preset) => {
                const isActive = config.timer_preset === preset.value
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleSelectPreset(preset.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 px-4 py-4 border text-center transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
                      isActive
                        ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]'
                        : 'bg-[var(--paper-0)] border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:bg-[var(--paper-1)]'
                    )}
                    style={isActive ? { boxShadow: '0 1px 0 var(--ink-1)' } : undefined}
                    aria-pressed={isActive}
                  >
                    <span
                      className="text-[14px] font-semibold leading-tight"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {preset.label}
                    </span>
                    <span
                      className="text-[11px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {preset.description}
                    </span>
                  </button>
                )
              })}
            </div>
            {TIMER_PRESETS.find(p => p.value === config.timer_preset) && (
              <p
                className="text-[12px] italic text-[var(--ink-3)] leading-[1.5]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {TIMER_PRESETS.find(p => p.value === config.timer_preset)?.detail}
              </p>
            )}
          </div>
        </article>
      ) : (
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
      )}

      {/* Section 6: Response speed */}
      {v2 ? (
        <article
          className="border border-[var(--ink-1)] bg-[var(--paper-2)]"
          style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
        >
          <header className="px-6 pt-5 pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-[14px] w-[14px] text-[var(--rubric-2)]" aria-hidden />
              <h3
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Velocidad de respuesta
              </h3>
            </div>
            <p
              className="text-[13px] italic text-[var(--ink-3)] leading-[1.5]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Controla los delays entre mensajes del agente. Real simula escritura humana, Instantaneo envia todo sin pausa.
            </p>
          </header>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {SPEED_PRESETS.map((preset) => {
                const isActive = config.response_speed === preset.value
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleSelectSpeed(preset.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 px-4 py-4 border text-center transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
                      isActive
                        ? 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]'
                        : 'bg-[var(--paper-0)] border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:bg-[var(--paper-1)]'
                    )}
                    style={isActive ? { boxShadow: '0 1px 0 var(--ink-1)' } : undefined}
                    aria-pressed={isActive}
                  >
                    <span
                      className="text-[14px] font-semibold leading-tight"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {preset.label}
                    </span>
                    <span
                      className="text-[11px] text-[var(--ink-3)]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {preset.description}
                    </span>
                  </button>
                )
              })}
            </div>
            {SPEED_PRESETS.find(p => p.value === config.response_speed) && (
              <p
                className="text-[12px] italic text-[var(--ink-3)] leading-[1.5]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {SPEED_PRESETS.find(p => p.value === config.response_speed)?.detail}
              </p>
            )}
          </div>
        </article>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Velocidad de respuesta</CardTitle>
            </div>
            <CardDescription>
              Controla los delays entre mensajes del agente. Real simula escritura humana, Instantaneo envia todo sin pausa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {SPEED_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleSelectSpeed(preset.value)}
                  className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border text-center transition-colors ${
                    config.response_speed === preset.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <span className="text-sm font-medium">{preset.label}</span>
                  <span className="text-xs text-muted-foreground">{preset.description}</span>
                </button>
              ))}
            </div>
            {SPEED_PRESETS.find(p => p.value === config.response_speed) && (
              <p className="text-xs text-muted-foreground">
                {SPEED_PRESETS.find(p => p.value === config.response_speed)?.detail}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
