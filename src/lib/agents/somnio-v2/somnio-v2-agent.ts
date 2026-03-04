/**
 * Somnio Sales Agent v2 - Skeleton
 *
 * New architecture: state-driven decisions instead of intent-based transitions.
 * This is a placeholder that will be built incrementally.
 *
 * Key differences from v1:
 * - Intents are ONLY what the client wants (hola, precio, promos, queja...)
 * - Pack selection is a captured DATA FIELD, not an intent
 * - resumen_Nx, ofrecer_promos, compra_confirmada are AGENT ACTIONS, not intents
 * - Decisions based on business state (what data do we have + what's missing)
 *
 * Architecture layers:
 * 1. Comprehension (Claude AI): intent + data extraction
 * 2. Business State (deterministic): what we have, what's missing
 * 3. Decision Engine (rules): what to do next based on state
 * 4. Response (templates from DB): what to say
 */

// V2 agent has its own types — NOT coupled to v1 SomnioAgentInput/Output

export interface V2AgentInput {
  message: string
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
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

export class SomnioV2Agent {
  /**
   * Process a customer message through the v2 pipeline.
   * For now, returns a placeholder response.
   */
  async processMessage(input: V2AgentInput): Promise<V2AgentOutput> {
    return {
      success: true,
      messages: [`[Somnio v2] Recibido: "${input.message}". Agente en construcción.`],
      intentsVistos: input.intentsVistos,
      templatesEnviados: input.templatesEnviados,
      datosCapturados: input.datosCapturados,
      packSeleccionado: input.packSeleccionado,
      intentInfo: {
        intent: 'v2-skeleton',
        confidence: 100,
        reasoning: 'Agente v2 en construcción — no procesa aún',
        timestamp: new Date().toISOString(),
      },
      totalTokens: 0,
      silenceDetected: false,
    }
  }
}
