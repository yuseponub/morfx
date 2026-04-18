/**
 * CRM Reader Agent — Types
 * Phase 44 Plan 04.
 *
 * Read-only AI agent exposed as internal API to other agents (tool providers).
 * Pitfall 5 mitigation: tool return shape discriminates 'found' vs 'not_found_in_workspace'.
 */

import type { AgentId } from '@/lib/observability/types'

/**
 * Context passed to every reader tool. workspaceId is inherited from
 * middleware-validated input — never from LLM arguments.
 */
export interface ReaderContext {
  workspaceId: string
  /** caller agent id or API-key prefix; used by observability */
  invoker?: string
}

/**
 * Message shape accepted by processReaderMessage. Structural subtype of
 * AI SDK v6 ModelMessage — caller can cast freely.
 */
export type ReaderMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }

export interface ReaderInput {
  workspaceId: string
  messages: ReaderMessage[]
  invoker?: string
}

export interface ReaderOutput {
  text: string
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>
  steps: number
  agentId: Extract<AgentId, 'crm-reader'>
}

/**
 * Discriminated tool return shape (Pitfall 5 mitigation).
 * 'not_found_in_workspace' is explicit — the LLM must echo it literally.
 * The 'error' variant lets us surface DB errors without throwing in tool.execute.
 */
export type ToolLookupResult<T> =
  | { status: 'found'; data: T }
  | { status: 'not_found_in_workspace' }
  | { status: 'error'; message: string }

export type ToolListResult<T> =
  | { status: 'ok'; count: number; items: T[] }
  | { status: 'error'; message: string }
