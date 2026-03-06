/**
 * Somnio Sales Agent v3 — Engine Adapter
 *
 * Adapts V3AgentOutput to SomnioAgentOutput so that v3 can be
 * used as a drop-in replacement within UnifiedEngine.
 *
 * This allows v3 to reuse all existing infrastructure:
 * - ProductionMessagingAdapter (pre-send check, char delays)
 * - ProductionOrdersAdapter (order creation)
 * - ProductionTimerAdapter (Inngest events)
 * - ProductionStorageAdapter (session persistence)
 */

import type { V3AgentInput, V3AgentOutput } from './types'
import { processMessage } from './somnio-v3-agent'

/**
 * SomnioAgentOutput-compatible interface.
 * Matches the interface expected by UnifiedEngine.
 */
export interface EngineCompatibleOutput {
  success: boolean
  messages: string[]
  templates?: Array<{
    id: string
    content: string
    contentType: 'texto' | 'template' | 'imagen'
    delaySeconds: number
    orden: number
    priority: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
  }>
  orchestratorIntent?: string
  stateUpdates: {
    newMode?: string
    newIntentsVistos: string[]
    newTemplatesEnviados: string[]
    newDatosCapturados: Record<string, string>
    newPackSeleccionado: unknown
  }
  shouldCreateOrder: boolean
  orderData?: {
    datosCapturados: Record<string, string>
    packSeleccionado: unknown
    valorOverride?: number
  }
  timerSignals: Array<{ type: 'start' | 'reevaluate' | 'cancel'; reason?: string }>
  silenceDetected?: boolean
  totalTokens: number
  tokenDetails: Array<{ model: string; inputTokens: number; outputTokens: number }>
  intentInfo?: {
    intent: string
    confidence: number
    alternatives?: Array<{ intent: string; confidence: number }>
    reasoning?: string
    timestamp: string
  }
  tools: unknown[]
  error?: { code: string; message: string }
  classification?: unknown
  ofiInter?: unknown
  ingestDetails?: unknown
  templateSelection?: unknown
  transitionValidation?: unknown
  orchestration?: unknown
  disambiguationLog?: unknown
}

/**
 * Process a message through v3 and return a SomnioAgent-compatible output.
 *
 * Called by UnifiedEngine when USE_SOMNIO_V3=true.
 */
export async function processMessageV3Compatible(params: {
  message: string
  session: { id: string; current_mode: string; version: number }
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  datosCapturados: Record<string, string>
  intentsVistos: string[]
  templatesEnviados: string[]
  packSeleccionado: string | null
}): Promise<EngineCompatibleOutput> {
  const input: V3AgentInput = {
    message: params.message,
    history: params.history,
    currentMode: params.session.current_mode,
    intentsVistos: params.intentsVistos,
    templatesEnviados: params.templatesEnviados,
    datosCapturados: params.datosCapturados,
    packSeleccionado: params.packSeleccionado,
    turnNumber: params.turnNumber,
    workspaceId: params.workspaceId,
  }

  const v3Output = await processMessage(input)

  return adaptOutput(v3Output)
}

/**
 * Convert V3AgentOutput to engine-compatible format.
 */
function adaptOutput(v3: V3AgentOutput): EngineCompatibleOutput {
  return {
    success: v3.success,
    messages: v3.messages,
    templates: v3.templates?.map((t, i) => ({
      id: t.templateId,
      content: t.content,
      contentType: t.contentType,
      delaySeconds: 0,
      orden: i,
      priority: t.priority,
    })),
    orchestratorIntent: v3.intentInfo?.intent,
    stateUpdates: {
      newMode: v3.newMode,
      newIntentsVistos: v3.intentsVistos,
      newTemplatesEnviados: v3.templatesEnviados,
      newDatosCapturados: v3.datosCapturados,
      newPackSeleccionado: v3.packSeleccionado,
    },
    shouldCreateOrder: v3.shouldCreateOrder,
    orderData: v3.orderData
      ? {
          datosCapturados: v3.orderData.datosCapturados,
          packSeleccionado: v3.orderData.packSeleccionado,
          valorOverride: v3.orderData.valorOverride,
        }
      : undefined,
    timerSignals: v3.timerSignals.map(s => ({
      type: s.type,
      reason: s.reason ?? s.level,
    })),
    silenceDetected: v3.silenceDetected,
    totalTokens: v3.totalTokens,
    tokenDetails: [{
      model: 'claude-haiku-4-5',
      inputTokens: Math.floor(v3.totalTokens * 0.8),
      outputTokens: Math.floor(v3.totalTokens * 0.2),
    }],
    intentInfo: v3.intentInfo
      ? {
          intent: v3.intentInfo.intent,
          confidence: v3.intentInfo.confidence,
          reasoning: v3.intentInfo.reasoning,
          timestamp: v3.intentInfo.timestamp,
        }
      : undefined,
    tools: [],
    classification: v3.classificationInfo
      ? {
          category: v3.silenceDetected ? 'SILENCIOSO' : (v3.newMode === 'handoff' ? 'HANDOFF' : 'RESPONDIBLE'),
          reason: v3.decisionInfo?.reason ?? '',
          rulesChecked: { rule1: true, rule1_5: true, rule2: true, rule3: true },
        }
      : undefined,
    ingestDetails: v3.ingestInfo
      ? {
          classification: v3.classificationInfo?.category,
          action: v3.ingestInfo.action,
          systemEvent: v3.ingestInfo.systemEvent,
        }
      : undefined,
  }
}
