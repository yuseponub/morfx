'use client'

/**
 * V3 Debug Panel
 *
 * Simplified debug for Somnio Sales Agent v3.
 * Shows v3-specific pipeline layers in a clean, scannable layout.
 *
 * Sections:
 * 1. Pipeline — C2→C3→C4→C5→C6→C7 with status per layer
 * 2. State — datos grid + gates + pack + mode
 * 3. Intent & Decision — comprehension output + decision rule
 * 4. Tokens — simple counter
 * 5. Interrupciones — queued messages during processing (future)
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Brain, Database, Zap, Coins, AlertTriangle, Settings, Code, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useTheme } from 'next-themes'
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { ConfigTab } from './config-tab'
import type { DebugTurn, SandboxState, TimerState, TimerConfig, SilenceTimerState } from '@/lib/sandbox/types'

// ============================================================================
// Types
// ============================================================================

interface DebugV3Props {
  debugTurns: DebugTurn[]
  state: SandboxState
  totalTokens: number
  /** Messages queued while bot was processing */
  queuedMessages: string[]
  /** Whether bot is currently processing */
  isProcessing: boolean
  // Config controls (shared with v1)
  responseDelayMs: number
  onResponseDelayChange: (delayMs: number) => void
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
  silenceDurationMs: number
  onSilenceDurationChange: (ms: number) => void
  // Timer live state
  timerState: TimerState
  silenceTimerState: SilenceTimerState
}

// ============================================================================
// Collapsible Section
// ============================================================================

function Section({
  title,
  icon,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border rounded-md">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {icon}
        <span>{title}</span>
        {badge && <span className="ml-auto">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  )
}

// ============================================================================
// Pipeline Section
// ============================================================================

function PipelineSection({ turn }: { turn: DebugTurn | undefined }) {
  if (!turn) return <p className="text-xs text-muted-foreground">Sin datos todavia</p>

  const layers = [
    {
      id: 'C2',
      name: 'Comprehension',
      status: turn.intent ? 'ok' : 'skip',
      detail: turn.intent ? `${turn.intent.intent} (${Math.round((turn.intent.confidence ?? 0) * 100)}%)` : null,
    },
    {
      id: 'C3',
      name: 'State Merge',
      status: 'ok',
      detail: null,
    },
    {
      id: 'C4',
      name: 'Ingest',
      status: turn.ingestDetails ? 'ok' : 'skip',
      detail: turn.ingestDetails
        ? `${(turn.ingestDetails as any).action ?? '?'}${(turn.ingestDetails as any).autoTrigger ? ` → ${(turn.ingestDetails as any).autoTrigger}` : ''}`
        : null,
    },
    {
      id: 'C5',
      name: 'Gates',
      status: 'ok',
      detail: turn.orchestration
        ? `datosOk: ${(turn.orchestration as any).shouldCreateOrder ? 'si' : '?'} | pack: ${turn.stateAfter?.packSeleccionado ? 'si' : 'no'}`
        : null,
    },
    {
      id: 'C6',
      name: 'Decision',
      status: turn.classification ? 'ok' : 'skip',
      detail: turn.classification
        ? `${(turn.classification as any).category} — ${(turn.classification as any).reason?.slice(0, 60) ?? ''}`
        : null,
    },
    {
      id: 'C7',
      name: 'Response',
      status: turn.orchestration ? 'ok' : 'skip',
      detail: turn.orchestration
        ? `${(turn.orchestration as any).templatesCount ?? 0} templates | mode: ${(turn.orchestration as any).nextMode ?? '?'}`
        : null,
    },
  ]

  return (
    <div className="space-y-1">
      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`flex items-start gap-2 text-xs py-1 ${layer.status === 'skip' ? 'opacity-40' : ''}`}
        >
          <Badge
            variant={layer.status === 'ok' ? 'default' : 'secondary'}
            className="shrink-0 text-[10px] px-1.5 py-0 font-mono"
          >
            {layer.id}
          </Badge>
          <div className="min-w-0">
            <span className="font-medium">{layer.name}</span>
            {layer.detail && (
              <p className="text-muted-foreground truncate">{layer.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// State Section
// ============================================================================

function StateSection({ state, turn }: { state: SandboxState; turn: DebugTurn | undefined }) {
  const datos = state.datosCapturados ?? {}
  // Filter out _v3: metadata keys for display
  const dataFields = Object.entries(datos).filter(([k]) => !k.startsWith('_v3:'))
  const metaFields = Object.entries(datos).filter(([k]) => k.startsWith('_v3:'))

  // Parse v3 metadata
  const ofiInter = datos['_v3:ofiInter'] === 'true'
  const enCaptura = datos['_v3:enCapturaSilenciosa'] === 'true'

  // Compute gates from current state
  const criticalNormal = ['nombre', 'apellido', 'telefono', 'direccion', 'ciudad', 'departamento']
  const criticalInter = ['nombre', 'apellido', 'telefono', 'ciudad', 'departamento']
  const fields = ofiInter ? criticalInter : criticalNormal
  const filledCount = fields.filter(f => datos[f] && datos[f] !== '').length
  const datosOk = filledCount === fields.length
  const packElegido = !!state.packSeleccionado

  return (
    <div className="space-y-3">
      {/* Gates bar */}
      <div className="flex gap-2">
        <Badge variant={datosOk ? 'default' : 'secondary'} className="text-xs">
          datosOk: {datosOk ? 'SI' : `NO (${filledCount}/${fields.length})`}
        </Badge>
        <Badge variant={packElegido ? 'default' : 'secondary'} className="text-xs">
          pack: {state.packSeleccionado ?? 'ninguno'}
        </Badge>
        <Badge variant="outline" className="text-xs">
          mode: {state.currentMode}
        </Badge>
      </div>

      {/* Flags */}
      <div className="flex gap-2 flex-wrap">
        {ofiInter && <Badge variant="outline" className="text-xs text-blue-600">Ofi Inter</Badge>}
        {enCaptura && <Badge variant="outline" className="text-xs text-amber-600">Captura Silenciosa</Badge>}
      </div>

      {/* Data grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {dataFields.map(([key, value]) => {
          const isCritical = fields.includes(key)
          const filled = value && value !== ''
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${filled ? 'bg-green-500' : isCritical ? 'bg-red-400' : 'bg-gray-300'}`} />
              <span className="text-muted-foreground truncate">{key}:</span>
              <span className={`truncate ${filled ? '' : 'text-muted-foreground/50 italic'}`}>
                {filled ? value : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Templates enviados count */}
      <div className="text-xs text-muted-foreground">
        Templates mostrados: {state.templatesEnviados?.length ?? 0} |
        Intents vistos: {state.intentsVistos?.length ?? 0}
      </div>
    </div>
  )
}

// ============================================================================
// Intent & Decision Section
// ============================================================================

function IntentDecisionSection({ turn }: { turn: DebugTurn | undefined }) {
  if (!turn) return <p className="text-xs text-muted-foreground">Sin datos todavia</p>

  const intent = turn.intent
  const classification = turn.classification as any
  const orchestration = turn.orchestration as any

  return (
    <div className="space-y-2 text-xs">
      {/* Intent */}
      {intent && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">Intent:</span>
            <Badge variant="default" className="text-[10px]">{intent.intent}</Badge>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                (intent.confidence ?? 0) >= 0.85
                  ? 'border-green-500 text-green-700'
                  : (intent.confidence ?? 0) >= 0.6
                    ? 'border-yellow-500 text-yellow-700'
                    : 'border-red-500 text-red-700'
              }`}
            >
              {Math.round((intent.confidence ?? 0) * 100)}%
            </Badge>
          </div>
          {intent.reasoning && (
            <p className="text-muted-foreground pl-2 border-l-2 border-muted">
              {intent.reasoning}
            </p>
          )}
        </div>
      )}

      {/* Classification (from comprehension) */}
      {classification && (
        <div className="flex items-center gap-2">
          <span className="font-medium">Categoria:</span>
          <Badge
            variant="outline"
            className={`text-[10px] ${
              classification.category === 'RESPONDIBLE' || classification.category === 'pregunta'
                ? 'border-green-500'
                : classification.category === 'SILENCIOSO' || classification.category === 'datos'
                  ? 'border-yellow-500'
                  : classification.category === 'HANDOFF'
                    ? 'border-red-500'
                    : 'border-gray-400'
            }`}
          >
            {classification.category}
          </Badge>
          {classification.reason && (
            <span className="text-muted-foreground truncate">{classification.reason}</span>
          )}
        </div>
      )}

      {/* Decision / Orchestration */}
      {orchestration && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">Decision:</span>
            {orchestration.modeChanged && (
              <Badge variant="outline" className="text-[10px] border-blue-500">
                {orchestration.previousMode} → {orchestration.nextMode}
              </Badge>
            )}
            {!orchestration.modeChanged && (
              <span className="text-muted-foreground">mode: {orchestration.nextMode}</span>
            )}
          </div>
          {orchestration.shouldCreateOrder && (
            <Badge variant="default" className="text-[10px] bg-green-600">
              CREAR ORDEN
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Tokens Section
// ============================================================================

function TokensSection({ totalTokens, turns }: { totalTokens: number; turns: DebugTurn[] }) {
  const turnCount = turns.length

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{totalTokens.toLocaleString()}</span>
        <span className="text-muted-foreground">tokens totales</span>
      </div>
      {turnCount > 0 && (
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Promedio por turno:</span>
          <span>{Math.round(totalTokens / turnCount).toLocaleString()}</span>
        </div>
      )}
      {totalTokens > 40000 && (
        <div className="flex items-center gap-1.5 text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Acercandose al limite de 50K</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Interrupciones Section
// ============================================================================

function InterrupcionesSection({
  queuedMessages,
  isProcessing,
}: {
  queuedMessages: string[]
  isProcessing: boolean
}) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">Estado:</span>
        {isProcessing ? (
          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">
            Procesando...
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] border-green-500 text-green-700">
            Listo
          </Badge>
        )}
      </div>

      {queuedMessages.length > 0 ? (
        <div className="space-y-1">
          <span className="text-muted-foreground">Mensajes en cola ({queuedMessages.length}):</span>
          {queuedMessages.map((msg, i) => (
            <div key={i} className="pl-2 border-l-2 border-amber-400 text-muted-foreground truncate">
              {msg}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          {isProcessing
            ? 'Envia un mensaje mientras el bot procesa para probar interrupciones'
            : 'Sin mensajes en cola'
          }
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Ingest & Timers Section
// ============================================================================

function formatTimer(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins === 0) return `${secs}s`
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function IngestTimersSection({
  turn,
  state,
  timerState,
  silenceTimerState,
}: {
  turn: DebugTurn | undefined
  state: SandboxState
  timerState: TimerState
  silenceTimerState: SilenceTimerState
}) {
  const ingest = turn?.ingestDetails as any
  const enCaptura = (state.datosCapturados?.['_v3:enCapturaSilenciosa'] ?? 'false') === 'true'

  return (
    <div className="space-y-3 text-xs">
      {/* Ingest status */}
      <div className="space-y-1.5">
        <span className="font-medium">Ingest</span>
        <div className="flex gap-2 flex-wrap">
          <Badge variant={enCaptura ? 'default' : 'secondary'} className="text-[10px]">
            Captura: {enCaptura ? 'ACTIVA' : 'inactiva'}
          </Badge>
          {ingest && (
            <Badge
              variant="outline"
              className={`text-[10px] ${
                ingest.action === 'silent' ? 'border-yellow-500 text-yellow-700'
                  : ingest.action === 'respond' ? 'border-green-500 text-green-700'
                    : 'border-blue-500 text-blue-700'
              }`}
            >
              {ingest.action}
            </Badge>
          )}
          {ingest?.autoTrigger && (
            <Badge variant="outline" className="text-[10px] border-purple-500 text-purple-700">
              auto: {ingest.autoTrigger}
            </Badge>
          )}
        </div>
        {!ingest && !turn && (
          <p className="text-muted-foreground">Sin datos todavia</p>
        )}
        {turn && !ingest && (
          <p className="text-muted-foreground">Ingest no ejecutado este turno</p>
        )}
      </div>

      {/* Ingest Timer */}
      <div className="space-y-1.5">
        <span className="font-medium">Timer Ingest</span>
        {timerState.active ? (
          <div className={`flex items-center gap-2 p-2 rounded border ${timerState.paused ? 'border-gray-400 bg-gray-50 dark:bg-gray-900' : 'border-amber-400 bg-amber-50 dark:bg-amber-950'}`}>
            <span className={`w-2 h-2 rounded-full ${timerState.paused ? 'bg-gray-400' : 'bg-amber-500 animate-pulse'}`} />
            <span className="font-mono font-medium">{formatTimer(timerState.remainingMs)}</span>
            <span className="text-muted-foreground">
              {timerState.levelName} ({timerState.paused ? 'pausado' : 'activo'})
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground">Inactivo</p>
        )}
      </div>

      {/* Silence Retake Timer */}
      <div className="space-y-1.5">
        <span className="font-medium">Timer Silencio</span>
        {silenceTimerState.active ? (
          <div className={`flex items-center gap-2 p-2 rounded border ${
            silenceTimerState.status === 'expired' ? 'border-red-400 bg-red-50 dark:bg-red-950'
              : silenceTimerState.status === 'cancelled' ? 'border-gray-400 bg-gray-50 dark:bg-gray-900'
                : 'border-orange-400 bg-orange-50 dark:bg-orange-950'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              silenceTimerState.status === 'waiting' ? 'bg-orange-500 animate-pulse'
                : silenceTimerState.status === 'expired' ? 'bg-red-500'
                  : 'bg-gray-400'
            }`} />
            <span className="font-mono font-medium">{formatTimer(silenceTimerState.remainingMs)}</span>
            <span className="text-muted-foreground">
              {silenceTimerState.status === 'waiting' ? 'esperando retoma'
                : silenceTimerState.status === 'expired' ? 'retoma enviada'
                  : 'cancelado'}
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground">Inactivo</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Turn Selector
// ============================================================================

function TurnSelector({
  turns,
  selectedTurn,
  onSelect,
}: {
  turns: DebugTurn[]
  selectedTurn: number
  onSelect: (idx: number) => void
}) {
  if (turns.length === 0) return null

  return (
    <div className="flex items-center gap-1 flex-wrap pb-2 border-b mb-2">
      <span className="text-xs text-muted-foreground mr-1">Turn:</span>
      {turns.map((t, i) => {
        const category = (t.classification as any)?.category
        const colorClass =
          category === 'SILENCIOSO' ? 'bg-yellow-500'
            : category === 'HANDOFF' ? 'bg-red-500'
              : 'bg-green-500'

        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`
              flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors
              ${i === selectedTurn ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}
            `}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${colorClass}`} />
            #{t.turnNumber}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Contexto Raw Section
// ============================================================================

function ContextoRawSection({ state, turn }: { state: SandboxState; turn: DebugTurn | undefined }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Build full context object the bot sees
  const fullContext = {
    currentMode: state.currentMode,
    datosCapturados: state.datosCapturados ?? {},
    packSeleccionado: state.packSeleccionado,
    intentsVistos: state.intentsVistos ?? [],
    templatesEnviados: state.templatesEnviados ?? [],
    // Last turn debug data (if available)
    ...(turn ? {
      _lastTurn: {
        turnNumber: turn.turnNumber,
        intent: turn.intent,
        classification: turn.classification,
        orchestration: turn.orchestration,
        ingestDetails: turn.ingestDetails,
        stateAfter: turn.stateAfter,
      },
    } : {}),
  }

  return (
    <div className="max-h-[400px] overflow-auto rounded border">
      <JsonView
        value={fullContext}
        style={isDark ? darkTheme : lightTheme}
        collapsed={2}
        displayDataTypes={false}
        displayObjectSize={false}
      />
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function DebugV3({
  debugTurns,
  state,
  totalTokens,
  queuedMessages,
  isProcessing,
  responseDelayMs,
  onResponseDelayChange,
  timerEnabled,
  timerConfig,
  onTimerToggle,
  onTimerConfigChange,
  silenceDurationMs,
  onSilenceDurationChange,
  timerState,
  silenceTimerState,
}: DebugV3Props) {
  const [selectedTurnIdx, setSelectedTurnIdx] = useState(-1)

  // Auto-select latest turn
  const effectiveTurnIdx = selectedTurnIdx === -1 || selectedTurnIdx >= debugTurns.length
    ? debugTurns.length - 1
    : selectedTurnIdx

  const selectedTurn = debugTurns[effectiveTurnIdx]

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <h3 className="text-sm font-medium">Debug v3</h3>
        <Badge variant="outline" className="text-[10px]">
          {debugTurns.length} turns
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <TurnSelector
          turns={debugTurns}
          selectedTurn={effectiveTurnIdx}
          onSelect={setSelectedTurnIdx}
        />

        <Section
          title="Pipeline"
          icon={<Zap className="h-3.5 w-3.5" />}
          defaultOpen={false}
          badge={
            selectedTurn?.classification
              ? <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    (selectedTurn.classification as any).category === 'RESPONDIBLE' ? 'border-green-500'
                      : (selectedTurn.classification as any).category === 'SILENCIOSO' ? 'border-yellow-500'
                        : 'border-red-500'
                  }`}
                >
                  {(selectedTurn.classification as any).category}
                </Badge>
              : undefined
          }
        >
          <PipelineSection turn={selectedTurn} />
        </Section>

        <Section
          title="Intent & Decision"
          icon={<Brain className="h-3.5 w-3.5" />}
          defaultOpen={false}
        >
          <IntentDecisionSection turn={selectedTurn} />
        </Section>

        <Section
          title="Estado"
          icon={<Database className="h-3.5 w-3.5" />}
          defaultOpen={false}
        >
          <StateSection state={state} turn={selectedTurn} />
        </Section>

        <Section
          title="Ingest & Timers"
          icon={<Timer className="h-3.5 w-3.5" />}
          defaultOpen={false}
          badge={
            timerState.active || silenceTimerState.active
              ? <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 animate-pulse">
                  {timerState.active ? formatTimer(timerState.remainingMs) : formatTimer(silenceTimerState.remainingMs)}
                </Badge>
              : undefined
          }
        >
          <IngestTimersSection
            turn={selectedTurn}
            state={state}
            timerState={timerState}
            silenceTimerState={silenceTimerState}
          />
        </Section>

        <Section
          title="Contexto Raw"
          icon={<Code className="h-3.5 w-3.5" />}
          defaultOpen={false}
        >
          <ContextoRawSection state={state} turn={selectedTurn} />
        </Section>

        <Section
          title="Tokens"
          icon={<Coins className="h-3.5 w-3.5" />}
          defaultOpen={false}
          badge={
            <span className="text-[10px] text-muted-foreground">
              {totalTokens.toLocaleString()}
            </span>
          }
        >
          <TokensSection totalTokens={totalTokens} turns={debugTurns} />
        </Section>

        <Section
          title="Interrupciones"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          defaultOpen={false}
          badge={
            queuedMessages.length > 0
              ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{queuedMessages.length}</Badge>
              : undefined
          }
        >
          <InterrupcionesSection
            queuedMessages={queuedMessages}
            isProcessing={isProcessing}
          />
        </Section>

        <Section
          title="Config"
          icon={<Settings className="h-3.5 w-3.5" />}
          defaultOpen={false}
        >
          <ConfigTab
            agentName="Somnio Sales Agent v3"
            responseDelayMs={responseDelayMs}
            onResponseDelayChange={onResponseDelayChange}
            timerEnabled={timerEnabled}
            timerConfig={timerConfig}
            onTimerToggle={onTimerToggle}
            onTimerConfigChange={onTimerConfigChange}
            silenceDurationMs={silenceDurationMs}
            onSilenceDurationChange={onSilenceDurationChange}
          />
        </Section>
      </div>
    </div>
  )
}
