/**
 * Somnio Sales Agent - Module Entry Point
 * Phase 14: Agente Ventas Somnio - Plan 01
 *
 * Exports all Somnio agent components and registers the agent on module load.
 */

// ============================================================================
// Exports
// ============================================================================

// Intent definitions
export {
  SOMNIO_INTENTS,
  getIntentByName,
  getIntentNames,
  isCombinationIntent,
  splitCombinationIntent,
} from './intents'
export type { IntentDefinition } from './intents'

// System prompts
export {
  INTENT_DETECTOR_PROMPT,
  ORCHESTRATOR_PROMPT,
  DATA_EXTRACTOR_PROMPT,
  SOMNIO_PROMPTS,
} from './prompts'

// Agent configuration
export {
  somnioAgentConfig,
  SOMNIO_STATES,
  SOMNIO_TRANSITIONS,
  SOMNIO_TOOLS,
  isValidSomnioTransition,
  getValidNextStates,
  isTerminalState,
} from './config'
export type { SomnioState } from './config'

// Data Extractor
export {
  DataExtractor,
  mergeExtractedData,
  hasMinimumData,
  hasCriticalData,
  getFieldCounts,
  CRITICAL_FIELDS,
  ADDITIONAL_FIELDS,
  ALL_FIELDS,
} from './data-extractor'
export type { ExtractedData, ExtractionResult } from './data-extractor'

// Message Classifier
export { MessageClassifier } from './message-classifier'
export type { MessageClassification, ClassificationResult } from './message-classifier'

// Ingest Manager
export {
  IngestManager,
  createEmptyIngestState,
  createActiveIngestState,
  updateIngestState,
  calculateTimerDuration,
} from './ingest-manager'
export type { IngestState, IngestResult, HandleMessageInput } from './ingest-manager'

// Normalizers
export {
  normalizePhone,
  normalizeCity,
  normalizeAddress,
  inferDepartamento,
  detectNegation,
  CITY_TO_DEPARTAMENTO,
} from './normalizers'

// Variable Substitution
export {
  substituteVariables,
  extractVariables,
  hasUnsubstitutedVariables,
  getMissingVariables,
  SOMNIO_PRICES,
} from './variable-substitutor'
export type { VariableContext, PackType } from './variable-substitutor'

// Template Manager
export { TemplateManager } from './template-manager'
export type { TemplateSelection, ProcessedTemplate } from './template-manager'

// Interruption Handler
export { InterruptionHandler } from './interruption-handler'
export type {
  PendingMessage,
  InterruptionState,
  InterruptionResult,
} from './interruption-handler'

// Message Sequencer
export { MessageSequencer } from './message-sequencer'
export type {
  MessageToSend,
  SequenceStatus,
  MessageSequence,
  SequenceResult,
} from './message-sequencer'

// Transition Validator
export {
  TransitionValidator,
  validateTransition,
  TRANSITION_RULES,
  CRITICAL_FIELDS as TRANSITION_CRITICAL_FIELDS,
} from './transition-validator'
export type {
  TransitionRule,
  TransitionResult,
} from './transition-validator'

// Somnio Orchestrator
export { SomnioOrchestrator } from './somnio-orchestrator'
export type { SomnioOrchestratorResult } from './somnio-orchestrator'

// Order Creator
export { OrderCreator } from './order-creator'
export type {
  OrderCreationResult,
  ContactData,
  OrderData,
} from './order-creator'

// Somnio Engine
export { SomnioEngine } from './somnio-engine'
export type {
  SomnioProcessMessageInput,
  SomnioEngineResult,
} from './somnio-engine'

// ============================================================================
// Agent Registration
// ============================================================================

import { agentRegistry } from '../registry'
import { somnioAgentConfig } from './config'

// Register the Somnio agent when this module is imported
agentRegistry.register(somnioAgentConfig)
