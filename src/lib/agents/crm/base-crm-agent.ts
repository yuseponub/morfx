/**
 * Base CRM Agent
 * Phase 15.6: Sandbox Evolution
 *
 * Abstract base class for all CRM agents.
 * Provides common utilities: mock generation, test-data prefixing, logging.
 */

import type { CrmAgent, CrmAgentResult, CrmCommand, CrmCommandType, CrmExecutionMode } from './types'
import type { ToolExecution } from '@/lib/sandbox/types'
import type { ModelTokenEntry } from '@/lib/agents/types'

export abstract class BaseCrmAgent implements CrmAgent {
  abstract id: string
  abstract name: string
  abstract description: string
  abstract supportedCommands: CrmCommandType[]

  abstract execute(command: CrmCommand, mode: CrmExecutionMode): Promise<CrmAgentResult>

  /** Generate a mock ID for dry-run mode */
  protected generateMockId(prefix: string): string {
    return `mock-${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  }

  /** Prefix test data in live mode per CONTEXT.md: "test-" prefix */
  protected prefixTestData(input: Record<string, unknown>): Record<string, unknown> {
    const result = { ...input }
    if (typeof result.name === 'string' && !result.name.startsWith('test-')) {
      result.name = `test-${result.name}`
    }
    if (typeof result.nombre === 'string' && !result.nombre.startsWith('test-')) {
      result.nombre = `test-${result.nombre}`
    }
    return result
  }

  /** Build a successful CrmAgentResult */
  protected buildResult(params: {
    commandType: CrmCommandType
    data: Record<string, unknown>
    toolCalls: ToolExecution[]
    tokensUsed: ModelTokenEntry[]
    mode: CrmExecutionMode
  }): CrmAgentResult {
    return {
      success: true,
      agentId: this.id,
      commandType: params.commandType,
      data: params.data,
      toolCalls: params.toolCalls,
      tokensUsed: params.tokensUsed,
      mode: params.mode,
      timestamp: new Date().toISOString(),
    }
  }

  /** Build a failed CrmAgentResult */
  protected buildError(params: {
    commandType: CrmCommandType
    mode: CrmExecutionMode
    code: string
    message: string
  }): CrmAgentResult {
    return {
      success: false,
      agentId: this.id,
      commandType: params.commandType,
      toolCalls: [],
      tokensUsed: [],
      mode: params.mode,
      timestamp: new Date().toISOString(),
      error: { code: params.code, message: params.message },
    }
  }

  /** Build a ToolExecution for dry-run display */
  protected buildMockToolExecution(params: {
    name: string
    input: Record<string, unknown>
    result: { success: boolean; data?: unknown; error?: { code: string; message: string } }
    durationMs?: number
  }): ToolExecution {
    return {
      name: params.name,
      input: params.input,
      result: params.result,
      durationMs: params.durationMs ?? Math.floor(Math.random() * 200) + 50,
      timestamp: new Date().toISOString(),
    }
  }
}
