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

// Normalizers
export {
  normalizePhone,
  normalizeCity,
  normalizeAddress,
  inferDepartamento,
  detectNegation,
  CITY_TO_DEPARTAMENTO,
} from './normalizers'

// ============================================================================
// Agent Registration
// ============================================================================

import { agentRegistry } from '../registry'
import { somnioAgentConfig } from './config'

// Register the Somnio agent when this module is imported
agentRegistry.register(somnioAgentConfig)
