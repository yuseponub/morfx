/**
 * Unified Engine - Barrel Export
 * Phase 16.1: Engine Unification - Plan 01 + Plan 04
 *
 * Re-exports all public types and the UnifiedEngine class.
 */

export { UnifiedEngine } from './unified-engine'

export type {
  EngineInput,
  EngineOutput,
  EngineConfig,
  EngineAdapters,
  AgentSessionLike,
  StorageAdapter,
  TimerAdapter,
  MessagingAdapter,
  OrdersAdapter,
  DebugAdapter,
} from './types'
