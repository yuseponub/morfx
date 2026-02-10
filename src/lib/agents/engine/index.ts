/**
 * Unified Engine - Barrel Export
 * Phase 16.1: Engine Unification - Plan 01
 *
 * Re-exports all public types from the engine module.
 * Plan 04 will add the UnifiedEngine class export here.
 */

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
