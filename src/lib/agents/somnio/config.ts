/**
 * Somnio Sales Agent - Configuration
 * Phase 14: Agente Ventas Somnio - Plan 01
 *
 * Complete agent configuration for the Somnio sales agent.
 * Defines Claude models, tools, states, transitions, and thresholds.
 */

import type { AgentConfig, StateTransitions } from '../types'
import { DEFAULT_CONFIDENCE_THRESHOLDS } from '../types'
import { INTENT_DETECTOR_PROMPT, ORCHESTRATOR_PROMPT } from './prompts'

// ============================================================================
// Agent States
// ============================================================================

/**
 * All possible states for the Somnio agent state machine
 */
export const SOMNIO_STATES = [
  'conversacion',    // Initial state, answering questions
  'collecting_data', // Capturing customer data for order
  'ofrecer_promos',  // Showing pack options
  'resumen',         // Customer chose a pack, showing summary
  'confirmado',      // Purchase confirmed, creating order
  'handoff',         // Handed off to human
] as const

export type SomnioState = (typeof SOMNIO_STATES)[number]

// ============================================================================
// State Transitions
// ============================================================================

/**
 * Valid state transitions for the Somnio agent.
 * Defines which states can transition to which other states.
 */
export const SOMNIO_TRANSITIONS: StateTransitions = {
  // From conversacion: can stay or start collecting data or handoff
  conversacion: ['conversacion', 'collecting_data', 'handoff'],

  // From collecting_data: stay, offer promos when ready, or handoff
  collecting_data: ['collecting_data', 'ofrecer_promos', 'handoff'],

  // From ofrecer_promos: customer picks a pack or handoff
  ofrecer_promos: ['resumen', 'handoff'],

  // From resumen: confirm, go back to promos, or handoff
  resumen: ['confirmado', 'ofrecer_promos', 'handoff'],

  // From confirmado: terminal state (could start new conversation or handoff)
  confirmado: ['conversacion', 'handoff'],

  // From handoff: terminal state, human takes over
  handoff: [],
}

// ============================================================================
// Available Tools
// ============================================================================

/**
 * Tools the Somnio agent can use (Action DSL format)
 */
export const SOMNIO_TOOLS = [
  // CRM operations
  'crm.contact.create',
  'crm.contact.update',
  'crm.contact.get',
  'crm.order.create',

  // WhatsApp operations
  'whatsapp.message.send',
  'whatsapp.template.send',
] as const

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Complete configuration for the Somnio Sales Agent.
 *
 * This agent handles:
 * - Detecting customer intents (20 base + 11 combinations)
 * - Collecting customer data for orders
 * - Showing promotions and pack options
 * - Creating contacts and orders in CRM
 * - Sending WhatsApp messages
 */
export const somnioAgentConfig: AgentConfig = {
  // Identity
  id: 'somnio-sales-v1',
  name: 'Somnio Sales Agent',
  description:
    'Agente de ventas para Somnio, suplemento de melatonina con magnesio. ' +
    'Responde preguntas, captura datos del cliente, y procesa pedidos via WhatsApp.',

  // Intent Detector: Uses Sonnet (Haiku 4.5 not available yet per decision 13-03)
  intentDetector: {
    model: 'claude-sonnet-4-5',
    systemPrompt: INTENT_DETECTOR_PROMPT,
    maxTokens: 256, // Short responses for intent detection
  },

  // Orchestrator: Uses Sonnet for complex reasoning
  orchestrator: {
    model: 'claude-sonnet-4-5',
    systemPrompt: ORCHESTRATOR_PROMPT,
    maxTokens: 1024, // Longer responses for orchestration
  },

  // Available tools from Action DSL
  tools: [...SOMNIO_TOOLS],

  // State machine
  states: [...SOMNIO_STATES],
  initialState: 'conversacion',
  validTransitions: SOMNIO_TRANSITIONS,

  // Confidence thresholds (from decision 13-04)
  // 85+ proceed, 60-84 reanalyze, 40-59 clarify, <40 handoff
  confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,

  // Token budget (50K per conversation)
  tokenBudget: 50_000,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a transition is valid
 */
export function isValidSomnioTransition(
  fromState: SomnioState,
  toState: SomnioState
): boolean {
  const validNextStates = SOMNIO_TRANSITIONS[fromState]
  return validNextStates?.includes(toState) ?? false
}

/**
 * Get valid next states from current state
 */
export function getValidNextStates(currentState: SomnioState): string[] {
  return SOMNIO_TRANSITIONS[currentState] ?? []
}

/**
 * Check if state is terminal (no outgoing transitions)
 */
export function isTerminalState(state: SomnioState): boolean {
  const nextStates = SOMNIO_TRANSITIONS[state]
  return !nextStates || nextStates.length === 0
}
