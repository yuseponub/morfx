/**
 * Somnio Sales Agent v2 — Type Definitions
 *
 * Types for the 4-layer architecture:
 * - AgentState: rich state model (Capa 2)
 * - FunnelPhase: computed funnel position
 * - Decision: output of Capa 3
 * - ResponseResult: output of Capa 4
 * - TurnResult: complete turn output
 */

import type { V2Intent } from './constants'

// ============================================================================
// Agent State (Capa 2)
// ============================================================================

export interface AgentState {
  /** Customer data (slot-filling) */
  datos: {
    nombre: string | null
    apellido: string | null
    telefono: string | null
    ciudad: string | null
    departamento: string | null
    direccion: string | null
    barrio: string | null
    correo: string | null
    indicaciones_extra: string | null
    cedula_recoge: string | null
  }

  /** Selected pack */
  pack: '1x' | '2x' | '3x' | null
  /** Picks up at Inter office? */
  ofiInter: boolean
  /** Confirmed purchase? */
  confirmado: boolean

  /** Negations (customer said they don't have) */
  negaciones: {
    correo: boolean
    telefono: boolean
    barrio: boolean
  }

  /** What the bot has already shown */
  mostrado: Set<string>
  /** Template IDs sent */
  templatesEnviados: string[]
  /** Intents detected in conversation */
  intentsVistos: string[]

  /** Metadata */
  turnCount: number
}

// ============================================================================
// Funnel Phase (computed, never stored)
// ============================================================================

export type FunnelPhase =
  | 'nuevo'
  | 'interesado'
  | 'datos_parciales'
  | 'datos_completos'
  | 'vio_promos'
  | 'pack_elegido'
  | 'resumen_mostrado'
  | 'confirmado'
  | 'handoff'

// ============================================================================
// Decision (Capa 3 output)
// ============================================================================

export interface Decision {
  action: 'respond' | 'silence' | 'handoff' | 'create_order'

  /** Template intents to fetch from DB (v2 names, mapped to v1 in response.ts) */
  templateIntents?: string[]
  /** Extra variables for template substitution */
  extraContext?: Record<string, string>

  /** Timer signal */
  timerSignal?: 'start_silence' | 'start_retake' | 'cancel'
  /** Debug: why this decision was made */
  reason: string
}

// ============================================================================
// Response Result (Capa 4 output)
// ============================================================================

export interface ResponseResult {
  /** Messages composed to send */
  messages: string[]
  /** Template IDs sent */
  sent: string[]
  /** Templates that overflowed to pending */
  pendingTemplates: string[]
  /** Templates permanently dropped (OPCIONAL) */
  dropped: string[]
  /** Templates filtered by no-repetition */
  filtered: string[]
  /** What was shown in this turn (for mostrado updates) */
  mostradoUpdates: string[]
}

// ============================================================================
// Turn Result (complete output)
// ============================================================================

export interface TurnResult {
  state: AgentState
  decision: Decision
  messages: string[]
  tokensUsed: number
  responseResult?: ResponseResult
}

// ============================================================================
// V2 Agent Input/Output (interface with engine-v2)
// ============================================================================

export interface V2AgentInput {
  message: string
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
}

export interface V2AgentOutput {
  success: boolean
  messages: string[]
  newMode?: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  intentInfo: {
    intent: string
    confidence: number
    reasoning?: string
    timestamp: string
  }
  totalTokens: number
  silenceDetected: boolean
}
