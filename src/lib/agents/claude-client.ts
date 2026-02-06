/**
 * Claude Client
 * Phase 13: Agent Engine Core - Plan 03
 *
 * Wrapper around the Anthropic SDK for agent-specific needs.
 * Handles intent detection, orchestration, and streaming responses.
 */

import Anthropic from '@anthropic-ai/sdk'
import { toolRegistry, ToolNotFoundError } from '@/lib/tools/registry'
import type {
  ClaudeModel,
  ClaudeMessage,
  ContentBlock,
  IntentResult,
  OrchestratorResult,
  SessionState,
} from './types'
import { ClaudeApiError } from './errors'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('claude-client')

/** Map of model IDs to Anthropic API model strings */
const MODEL_MAP: Record<ClaudeModel, string> = {
  'claude-haiku-4-5': 'claude-sonnet-4-5-20250514', // Using Sonnet as Haiku 4.5 not yet available
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250514',
}

/**
 * Client for interacting with Claude API.
 *
 * Provides specialized methods for:
 * - Intent detection (fast, cheap with Haiku)
 * - Orchestration (intelligent with Sonnet, tool use)
 * - Streaming responses
 *
 * Tool names are converted between Action DSL format (dots) and
 * Claude format (underscores) automatically.
 */
export class ClaudeClient {
  private client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    })
  }

  // ============================================================================
  // Intent Detection
  // ============================================================================

  /**
   * Detect intent from customer message.
   *
   * Uses a fast model (Haiku) to classify the message and return
   * confidence score with alternatives.
   *
   * @returns IntentResult with confidence 0-100
   */
  async detectIntent(
    systemPrompt: string,
    conversationHistory: ClaudeMessage[],
    currentMessage: string,
    model: ClaudeModel = 'claude-haiku-4-5'
  ): Promise<{ result: IntentResult; tokensUsed: number }> {
    logger.debug(
      { model, messageLength: currentMessage.length },
      'Detecting intent'
    )

    try {
      const response = await this.client.messages.create({
        model: MODEL_MAP[model],
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          ...this.convertToAnthropicMessages(conversationHistory),
          { role: 'user', content: currentMessage },
        ],
      })

      const text = this.extractText(response.content)
      const result = this.parseIntentResponse(text)
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

      logger.info(
        { intent: result.intent, confidence: result.confidence, tokensUsed },
        'Intent detected'
      )

      return { result, tokensUsed }
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ClaudeApiError(
          `Intent detection failed: ${error.message}`,
          {
            statusCode: error.status,
            errorType: error.name,
            originalError: error,
          }
        )
      }
      throw error
    }
  }

  /**
   * Parse the intent response from Claude.
   * Expects JSON format, falls back to unknown intent if parsing fails.
   */
  private parseIntentResponse(text: string): IntentResult {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          intent: parsed.intent ?? 'unknown',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
          alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : undefined,
          reasoning: parsed.reasoning,
        }
      } catch {
        // Fall through to default
      }
    }

    // Fallback: could not parse JSON
    logger.warn({ rawText: text.substring(0, 200) }, 'Failed to parse intent JSON')
    return {
      intent: 'unknown',
      confidence: 0,
      reasoning: text,
    }
  }

  // ============================================================================
  // Orchestration
  // ============================================================================

  /**
   * Orchestrate the agent response.
   *
   * Uses a more capable model (Sonnet) to decide what action to take
   * based on the detected intent, session state, and conversation history.
   * Can request tool execution.
   *
   * @returns OrchestratorResult with action and optional tool calls
   */
  async orchestrate(
    systemPrompt: string,
    conversationHistory: ClaudeMessage[],
    intentResult: IntentResult,
    sessionState: SessionState,
    toolNames: string[],
    model: ClaudeModel = 'claude-sonnet-4-5'
  ): Promise<{ result: OrchestratorResult; tokensUsed: number }> {
    logger.debug(
      { model, intent: intentResult.intent, toolCount: toolNames.length },
      'Orchestrating response'
    )

    // Build context message with intent and state
    const contextMessage = this.buildOrchestratorContext(intentResult, sessionState)

    // Convert tool names to Claude tool definitions
    const tools = this.buildToolDefinitions(toolNames)

    try {
      const response = await this.client.messages.create({
        model: MODEL_MAP[model],
        max_tokens: 2000,
        system: systemPrompt,
        tools,
        messages: [
          ...this.convertToAnthropicMessages(conversationHistory),
          { role: 'user', content: contextMessage },
        ],
      })

      const result = this.parseOrchestratorResponse(response)
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

      logger.info(
        {
          action: result.action,
          toolCallCount: result.toolCalls?.length ?? 0,
          tokensUsed,
        },
        'Orchestration complete'
      )

      return { result, tokensUsed }
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ClaudeApiError(
          `Orchestration failed: ${error.message}`,
          {
            statusCode: error.status,
            errorType: error.name,
            originalError: error,
          }
        )
      }
      throw error
    }
  }

  /**
   * Build context message for orchestrator.
   * Includes intent result and current session state.
   */
  private buildOrchestratorContext(
    intent: IntentResult,
    state: SessionState
  ): string {
    return JSON.stringify({
      intent: intent.intent,
      confidence: intent.confidence,
      alternatives: intent.alternatives,
      session_state: {
        current_mode: 'from session',  // Filled by engine
        intents_vistos: state.intents_vistos,
        templates_enviados: state.templates_enviados,
        datos_capturados: state.datos_capturados,
        pack_seleccionado: state.pack_seleccionado,
      },
    }, null, 2)
  }

  /**
   * Parse orchestrator response from Claude.
   * Extracts tool use blocks or text response.
   */
  private parseOrchestratorResponse(
    response: Anthropic.Message
  ): OrchestratorResult {
    const content = response.content

    // Check for tool_use blocks
    const toolUses = content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (toolUses.length > 0) {
      return {
        action: 'execute_tool',
        toolCalls: toolUses.map((tu) => ({
          // Convert underscores back to dots for Action DSL
          name: this.claudeToActionDslName(tu.name),
          input: tu.input as Record<string, unknown>,
        })),
      }
    }

    // Extract text response
    const textBlock = content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )

    // Try to parse structured response from text
    const text = textBlock?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          action: parsed.action ?? 'proceed',
          response: parsed.response ?? text,
          nextMode: parsed.nextMode,
        }
      } catch {
        // Fall through to default
      }
    }

    return {
      action: 'proceed',
      response: text,
    }
  }

  // ============================================================================
  // Streaming
  // ============================================================================

  /**
   * Stream a response from Claude.
   *
   * Useful for generating customer-facing responses where
   * we want to show progress.
   */
  async streamResponse(
    systemPrompt: string,
    conversationHistory: ClaudeMessage[],
    model: ClaudeModel = 'claude-sonnet-4-5',
    onText: (text: string) => void
  ): Promise<{ fullText: string; tokensUsed: number }> {
    logger.debug({ model }, 'Starting streaming response')

    let fullText = ''

    try {
      const stream = this.client.messages.stream({
        model: MODEL_MAP[model],
        max_tokens: 2000,
        system: systemPrompt,
        messages: this.convertToAnthropicMessages(conversationHistory),
      })

      stream.on('text', (text) => {
        fullText += text
        onText(text)
      })

      const finalMessage = await stream.finalMessage()
      const tokensUsed = finalMessage.usage.input_tokens + finalMessage.usage.output_tokens

      logger.info(
        { textLength: fullText.length, tokensUsed },
        'Streaming complete'
      )

      return { fullText, tokensUsed }
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ClaudeApiError(
          `Streaming failed: ${error.message}`,
          {
            statusCode: error.status,
            errorType: error.name,
            originalError: error,
          }
        )
      }
      throw error
    }
  }

  // ============================================================================
  // Tool Definition Building
  // ============================================================================

  /**
   * Build Claude tool definitions from Action DSL tool names.
   *
   * Converts tool names from dot notation (crm.contact.create)
   * to underscore notation (crm_contact_create) for Claude.
   */
  buildToolDefinitions(toolNames: string[]): Anthropic.Tool[] {
    return toolNames.map((name) => {
      try {
        const tool = toolRegistry.getTool(name)
        return {
          // Claude tool names cannot contain dots
          name: this.actionDslToClaudeName(name),
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
        }
      } catch (error) {
        if (error instanceof ToolNotFoundError) {
          logger.warn({ toolName: name }, 'Tool not found in registry')
          return {
            name: this.actionDslToClaudeName(name),
            description: `Tool ${name} (not found in registry)`,
            input_schema: { type: 'object' as const, properties: {} },
          }
        }
        throw error
      }
    })
  }

  // ============================================================================
  // Tool Name Conversion
  // ============================================================================

  /**
   * Convert Action DSL name (dots) to Claude name (underscores).
   * Example: crm.contact.create -> crm_contact_create
   */
  actionDslToClaudeName(name: string): string {
    return name.replace(/\./g, '_')
  }

  /**
   * Convert Claude name (underscores) to Action DSL name (dots).
   * Example: crm_contact_create -> crm.contact.create
   */
  claudeToActionDslName(name: string): string {
    return name.replace(/_/g, '.')
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Convert our ClaudeMessage format to Anthropic SDK format.
   */
  private convertToAnthropicMessages(
    messages: ClaudeMessage[]
  ): Anthropic.MessageParam[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content
        : this.convertContentBlocks(msg.content),
    }))
  }

  /**
   * Convert content blocks to Anthropic format.
   */
  private convertContentBlocks(
    blocks: ContentBlock[]
  ): Anthropic.ContentBlockParam[] {
    return blocks.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text ?? '' }
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id ?? '',
          name: block.name ?? '',
          input: block.input ?? {},
        }
      }
      if (block.type === 'tool_result') {
        return {
          type: 'tool_result' as const,
          tool_use_id: block.tool_use_id ?? '',
          content: block.content ?? '',
          is_error: block.is_error ?? false,
        }
      }
      return { type: 'text' as const, text: '' }
    })
  }

  /**
   * Extract text from Claude response content blocks.
   */
  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }
}
