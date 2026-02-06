# Phase 13: Agent Engine Core - Research

**Researched:** 2026-02-05
**Domain:** Conversational AI Agent Engine (Claude API + Session Management + Tool Execution)
**Confidence:** HIGH

## Summary

This phase builds a generic engine for executing conversational AI agents powered by Claude API. The architecture follows the user's locked decision of a two-Claude-component design: Intent Detector (classification + confidence scoring) and Orchestrator (flow validation + action coordination). The engine must handle session persistence with optimistic locking, integrate with the existing Action DSL tool system from Phase 12, and implement timer-based workflows via Inngest for WhatsApp's 24h engagement patterns.

The research confirms that the Anthropic TypeScript SDK (`@anthropic-ai/sdk`) v0.72.1 provides all needed capabilities: streaming messages, tool use with JSON schema definitions, and token counting. For the multi-tier architecture, Haiku 4.5 is recommended for Intent Detection (fastest, $1/$5 per MTok), while Sonnet 4.5 handles Orchestration (best coding/agent performance, $3/$15 per MTok). Inngest provides step-based durable workflows with `step.waitForEvent()` for timeout-based customer engagement patterns, exactly matching the user's requirements for replacing n8n's Proactive Timer.

**Primary recommendation:** Build a modular agent engine with: (1) agent registry for configuration (system prompts, tools, states), (2) session manager with version-based optimistic locking, (3) Claude client wrapper for streaming + tool execution, (4) Inngest functions for timer workflows. Use the existing `executeToolFromAgent()` from Phase 12 for tool execution.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.72.1 | Claude API client | Official SDK with streaming, tool use, TypeScript types |
| `inngest` | ^3.x | Durable workflow orchestration | Event-driven, `step.waitForEvent()` for timeouts, persistent state |
| `@supabase/supabase-js` | ^2.93.1 | Database operations (sessions, turns) | Already installed, used throughout project |
| `zod` | ^4.3.6 | Schema validation | Already installed, type-safe validation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | ^10.3.0 | Structured logging | All agent operations for forensic audit |
| `date-fns` | ^4.1.0 | Date calculations | Session window calculations (24h) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest | BullMQ + Redis | BullMQ requires Redis infrastructure; Inngest is serverless |
| Inngest | Temporal | Temporal is more powerful but overkill; requires separate cluster |
| @anthropic-ai/sdk | Vercel AI SDK | Vercel AI SDK abstracts too much; need direct control of tool_use blocks |

**Installation:**
```bash
npm install @anthropic-ai/sdk inngest
```

## Architecture Patterns

### Recommended Project Structure

```
src/lib/agents/
+-- index.ts                    # Public exports
+-- types.ts                    # Agent types, session types, turn types
+-- registry.ts                 # Agent registration and configuration
+-- session-manager.ts          # Session CRUD with optimistic locking
+-- claude-client.ts            # Claude API wrapper with streaming
+-- intent-detector.ts          # Intent classification component
+-- orchestrator.ts             # Flow orchestration component
+-- engine.ts                   # Main agent execution engine
+-- token-budget.ts             # Token counting and budget enforcement

src/inngest/
+-- client.ts                   # Inngest client configuration
+-- functions/
|   +-- agent-timers.ts         # Timer-based agent workflows
+-- events.ts                   # Event type definitions

supabase/migrations/
+-- YYYYMMDD_agent_sessions.sql # agent_sessions, agent_turns, session_state
```

### Pattern 1: Agent Registry

**What:** Centralized configuration for multiple agent types
**When to use:** Registering agents with different behaviors (sales, support, etc.)
**Confidence:** HIGH - User decision in CONTEXT.md

```typescript
// Source: User decisions + standard registry pattern
interface AgentConfig {
  id: string
  name: string
  description: string

  // Claude configuration
  intentDetector: {
    model: 'claude-haiku-4-5' | 'claude-sonnet-4-5'
    systemPrompt: string
    maxTokens: number
  }
  orchestrator: {
    model: 'claude-haiku-4-5' | 'claude-sonnet-4-5'
    systemPrompt: string
    maxTokens: number
  }

  // Available tools (from Action DSL)
  tools: string[]  // e.g., ['crm.contact.create', 'whatsapp.message.send']

  // State machine
  states: string[]
  initialState: string
  validTransitions: Record<string, string[]>

  // Confidence thresholds (user decision)
  confidenceThresholds: {
    proceed: number      // >= 85 default
    reanalyze: number    // 60-84 default
    clarify: number      // 40-59 default
    handoff: number      // < 40 default
  }
}

class AgentRegistry {
  private agents = new Map<string, AgentConfig>()

  register(config: AgentConfig): void {
    this.agents.set(config.id, config)
  }

  get(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId)
  }

  list(): AgentConfig[] {
    return Array.from(this.agents.values())
  }
}

export const agentRegistry = new AgentRegistry()
```

### Pattern 2: Session Manager with Optimistic Locking

**What:** Session persistence with version-based conflict detection
**When to use:** Every agent turn to prevent concurrent writes
**Confidence:** HIGH - User decision + standard pattern

```typescript
// Source: User decisions (CONTEXT.md) + Supabase patterns
interface AgentSession {
  id: string
  agent_id: string
  conversation_id: string
  contact_id: string
  workspace_id: string

  version: number  // Optimistic locking counter
  status: 'active' | 'paused' | 'closed' | 'handed_off'
  current_mode: string

  created_at: string
  updated_at: string
  last_activity_at: string
}

interface AgentTurn {
  id: string
  session_id: string
  turn_number: number
  role: 'user' | 'assistant' | 'system'
  content: string
  intent_detected: string | null
  confidence: number | null
  tools_called: ToolCall[]
  tokens_used: number
  created_at: string
}

interface SessionState {
  intents_vistos: Array<{ intent: string; orden: number; timestamp: string }>
  templates_enviados: string[]
  datos_capturados: Record<string, string>
  pack_seleccionado: '1x' | '2x' | '3x' | null
}

class SessionManager {
  constructor(private supabase: SupabaseClient) {}

  async createSession(params: {
    agentId: string
    conversationId: string
    contactId: string
    workspaceId: string
    initialState?: Partial<SessionState>
  }): Promise<AgentSession> {
    const { data, error } = await this.supabase
      .from('agent_sessions')
      .insert({
        agent_id: params.agentId,
        conversation_id: params.conversationId,
        contact_id: params.contactId,
        workspace_id: params.workspaceId,
        version: 1,
        status: 'active',
        current_mode: 'conversacion',
      })
      .select()
      .single()

    if (error) throw new SessionError('Failed to create session', error)

    // Initialize session_state
    await this.supabase
      .from('session_state')
      .insert({
        session_id: data.id,
        intents_vistos: [],
        templates_enviados: [],
        datos_capturados: {},
        pack_seleccionado: null,
        ...params.initialState,
      })

    return data
  }

  async updateWithVersion(
    sessionId: string,
    expectedVersion: number,
    updates: Partial<AgentSession>
  ): Promise<AgentSession> {
    const { data, error } = await this.supabase
      .from('agent_sessions')
      .update({
        ...updates,
        version: expectedVersion + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('version', expectedVersion)  // Optimistic lock check
      .select()
      .single()

    if (error?.code === 'PGRST116' || !data) {
      throw new VersionConflictError(sessionId, expectedVersion)
    }
    if (error) throw new SessionError('Failed to update session', error)

    return data
  }

  async addTurn(turn: Omit<AgentTurn, 'id' | 'created_at'>): Promise<AgentTurn> {
    const { data, error } = await this.supabase
      .from('agent_turns')
      .insert(turn)
      .select()
      .single()

    if (error) throw new SessionError('Failed to add turn', error)
    return data
  }
}
```

### Pattern 3: Claude Client with Streaming and Tool Use

**What:** Wrapper around Anthropic SDK for agent-specific needs
**When to use:** All Claude API calls
**Confidence:** HIGH - Official SDK documentation

```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript
import Anthropic from '@anthropic-ai/sdk'

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
}

interface IntentResult {
  intent: string
  confidence: number  // 0-100
  alternatives?: Array<{ intent: string; confidence: number }>
  reasoning?: string
}

interface OrchestratorResult {
  action: 'proceed' | 'reanalyze' | 'clarify' | 'handoff' | 'execute_tool'
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>
  response?: string
  nextMode?: string
}

class ClaudeClient {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  async detectIntent(
    systemPrompt: string,
    conversationHistory: ClaudeMessage[],
    currentMessage: string,
    model: string = 'claude-haiku-4-5'
  ): Promise<{ result: IntentResult; tokensUsed: number }> {
    const response = await this.client.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: currentMessage },
      ],
    })

    const text = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    // Parse structured intent response
    const result = this.parseIntentResponse(text)

    return {
      result,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    }
  }

  async orchestrate(
    systemPrompt: string,
    conversationHistory: ClaudeMessage[],
    intentResult: IntentResult,
    sessionState: SessionState,
    tools: Anthropic.Tool[],
    model: string = 'claude-sonnet-4-5'
  ): Promise<{ result: OrchestratorResult; tokensUsed: number }> {
    const contextMessage = this.buildOrchestratorContext(intentResult, sessionState)

    const response = await this.client.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      tools,
      messages: [
        ...conversationHistory,
        { role: 'user', content: contextMessage },
      ],
    })

    const result = this.parseOrchestratorResponse(response)

    return {
      result,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    }
  }

  async streamResponse(
    systemPrompt: string,
    conversationHistory: ClaudeMessage[],
    model: string = 'claude-sonnet-4-5',
    onText: (text: string) => void
  ): Promise<{ fullText: string; tokensUsed: number }> {
    let fullText = ''

    const stream = this.client.messages.stream({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: conversationHistory,
    })

    stream.on('text', (text) => {
      fullText += text
      onText(text)
    })

    const finalMessage = await stream.finalMessage()

    return {
      fullText,
      tokensUsed: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
    }
  }

  buildToolDefinitions(toolNames: string[]): Anthropic.Tool[] {
    // Convert Action DSL tools to Claude tool format
    return toolNames.map((name) => {
      const tool = toolRegistry.getTool(name)
      return {
        name: name.replace(/\./g, '_'),  // Claude tools use underscores
        description: tool.metadata.description,
        input_schema: tool.schema.inputSchema,
      }
    })
  }

  private parseIntentResponse(text: string): IntentResult {
    // Parse JSON response from Intent Detector
    try {
      return JSON.parse(text)
    } catch {
      // Fallback: extract intent and confidence from free text
      return {
        intent: 'unknown',
        confidence: 0,
        reasoning: text,
      }
    }
  }

  private parseOrchestratorResponse(response: Anthropic.Message): OrchestratorResult {
    const content = response.content

    // Check for tool_use blocks
    const toolUses = content.filter((block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use'
    )

    if (toolUses.length > 0) {
      return {
        action: 'execute_tool',
        toolCalls: toolUses.map((tu) => ({
          name: tu.name.replace(/_/g, '.'),  // Convert back to Action DSL format
          input: tu.input as Record<string, unknown>,
        })),
      }
    }

    // Extract text response
    const textBlock = content.find((block): block is Anthropic.TextBlock =>
      block.type === 'text'
    )

    return {
      action: 'proceed',
      response: textBlock?.text ?? '',
    }
  }
}
```

### Pattern 4: Inngest Timer Workflows

**What:** Durable timer-based workflows for customer engagement
**When to use:** Proactive follow-ups, data collection timeouts
**Confidence:** HIGH - Official Inngest docs + user decisions

```typescript
// Source: https://www.inngest.com/docs/reference/functions/step-wait-for-event
import { Inngest } from 'inngest'

// Define event types
type AgentEvents = {
  'agent/session.started': { data: { sessionId: string; workspaceId: string; mode: string } }
  'agent/customer.message': { data: { sessionId: string; conversationId: string; messageId: string } }
  'agent/collecting_data.started': { data: { sessionId: string } }
  'agent/promos.offered': { data: { sessionId: string } }
}

export const inngest = new Inngest({ id: 'morfx-agents' })

// Timer workflow for data collection phase
export const dataCollectionTimer = inngest.createFunction(
  { id: 'data-collection-timer' },
  { event: 'agent/collecting_data.started' },
  async ({ event, step }) => {
    const { sessionId } = event.data

    // Wait for customer message or timeout after 6 minutes
    const customerMessage = await step.waitForEvent('wait-for-data', {
      event: 'agent/customer.message',
      timeout: '6m',
      match: 'data.sessionId',
    })

    if (!customerMessage) {
      // Timeout: send "quedamos pendientes" message
      await step.run('send-timeout-message', async () => {
        await sendTimeoutMessage(sessionId, 'collecting_data')
      })
      return { status: 'timeout', action: 'sent_pending_message' }
    }

    // Customer responded - check data completeness
    const dataStatus = await step.run('check-data-status', async () => {
      return await checkDataCompleteness(sessionId)
    })

    if (dataStatus.complete) {
      // Data complete - wait 2 minutes then offer promos
      await step.sleep('wait-before-promos', '2m')

      await step.run('offer-promos', async () => {
        await transitionToPromos(sessionId)
      })

      return { status: 'complete', action: 'transitioned_to_promos' }
    }

    // Data partial - ask for missing fields
    await step.run('request-missing-data', async () => {
      await requestMissingData(sessionId, dataStatus.missing)
    })

    return { status: 'partial', action: 'requested_missing_data' }
  }
)

// Timer workflow for promos phase
export const promosTimer = inngest.createFunction(
  { id: 'promos-timer' },
  { event: 'agent/promos.offered' },
  async ({ event, step }) => {
    const { sessionId } = event.data

    // Wait for customer response or timeout after 10 minutes
    const response = await step.waitForEvent('wait-for-selection', {
      event: 'agent/customer.message',
      timeout: '10m',
      match: 'data.sessionId',
    })

    if (!response) {
      // Timeout: auto-create order with default pack
      await step.run('auto-create-order', async () => {
        await autoCreateOrder(sessionId)
      })
      return { status: 'timeout', action: 'auto_created_order' }
    }

    // Customer responded - process selection
    return { status: 'responded', action: 'process_selection' }
  }
)
```

### Pattern 5: Token Budget Management

**What:** Track and enforce token limits per conversation
**When to use:** Every turn to prevent runaway costs
**Confidence:** HIGH - User decision (50K max)

```typescript
// Source: User decision + standard pattern
const MAX_TOKENS_PER_CONVERSATION = 50_000

interface TokenUsage {
  sessionId: string
  totalInputTokens: number
  totalOutputTokens: number
  turnCount: number
}

class TokenBudgetManager {
  constructor(private supabase: SupabaseClient) {}

  async getUsage(sessionId: string): Promise<TokenUsage> {
    const { data: turns } = await this.supabase
      .from('agent_turns')
      .select('tokens_used')
      .eq('session_id', sessionId)

    const totalTokens = turns?.reduce((sum, t) => sum + (t.tokens_used ?? 0), 0) ?? 0

    return {
      sessionId,
      totalInputTokens: totalTokens * 0.7,  // Estimate
      totalOutputTokens: totalTokens * 0.3, // Estimate
      turnCount: turns?.length ?? 0,
    }
  }

  async checkBudget(sessionId: string, estimatedTokens: number): Promise<{
    allowed: boolean
    remaining: number
    used: number
  }> {
    const usage = await this.getUsage(sessionId)
    const totalUsed = usage.totalInputTokens + usage.totalOutputTokens
    const remaining = MAX_TOKENS_PER_CONVERSATION - totalUsed

    return {
      allowed: remaining >= estimatedTokens,
      remaining,
      used: totalUsed,
    }
  }

  async recordUsage(sessionId: string, turnId: string, tokensUsed: number): Promise<void> {
    await this.supabase
      .from('agent_turns')
      .update({ tokens_used: tokensUsed })
      .eq('id', turnId)
  }
}
```

### Anti-Patterns to Avoid

- **Single Claude call for everything:** User explicitly decided two-component architecture (Intent Detector + Orchestrator). Don't collapse into one call.
- **Polling for events:** Use Inngest `step.waitForEvent()` instead of polling loops. User explicitly rejected n8n's polling approach.
- **Manual session locking:** Use version-based optimistic locking, not database locks. User decision: "Version simple: contador que incrementa en cada turno."
- **Ignoring confidence thresholds:** User defined specific thresholds (85/60/40) - these must be enforced in orchestrator logic.
- **Tools calling tools:** User decided "tools atomicos" in Phase 12. The orchestrator calls tools, tools don't chain.
- **Storing full conversation in session_state:** Keep session_state lean. Full conversation is in agent_turns table.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Claude API integration | Custom HTTP client | `@anthropic-ai/sdk` | Official SDK handles streaming, retries, types |
| Timer workflows | Custom cron jobs | Inngest `step.waitForEvent()` | Durable, persistent, no polling |
| Session locking | Postgres advisory locks | Version counter pattern | Simpler, no deadlock risk, user-decided |
| Tool execution | Custom executor | `executeToolFromAgent()` | Already built in Phase 12 with logging |
| JSON schema validation | Manual checks | Zod + Ajv (existing) | Already in tool registry |
| Token counting | Manual estimation | SDK `response.usage` | Accurate counts from API response |
| Event emission | Manual database triggers | Inngest `inngest.send()` | Type-safe, durable delivery |

**Key insight:** The Phase 12 Action DSL provides tool execution with logging, rate limiting, and error handling. This phase focuses on the Claude integration and session management layer that orchestrates those tools.

## Common Pitfalls

### Pitfall 1: Tool Name Format Mismatch

**What goes wrong:** Claude receives tools with underscored names but tries to call with dotted names (or vice versa).
**Why it happens:** Claude tool names cannot contain dots, but Action DSL uses dots (e.g., `crm.contact.create`).
**How to avoid:** Convert dots to underscores when sending to Claude (`crm_contact_create`), convert back when executing.
**Warning signs:** Tool not found errors, undefined tool calls.

### Pitfall 2: Version Conflict Not Handled

**What goes wrong:** Concurrent messages to same session cause data loss.
**Why it happens:** Two processes read same version, both try to write version+1, one overwrites the other.
**How to avoid:** Catch `VersionConflictError`, reload session state, re-process turn with fresh data.
**Warning signs:** Lost messages, inconsistent session state, customer confusion.

### Pitfall 3: Token Budget Exceeded Mid-Conversation

**What goes wrong:** Agent hits 50K limit and conversation terminates abruptly.
**Why it happens:** No proactive budget checking before expensive operations.
**How to avoid:** Check budget BEFORE each Claude call. If near limit, summarize history or gracefully end.
**Warning signs:** Sudden conversation ends, budget errors in logs.

### Pitfall 4: Inngest Event Race Condition

**What goes wrong:** `step.waitForEvent()` misses events sent before function starts.
**Why it happens:** Inngest documentation warns: "events sent before the function is executed will not be handled by the wait."
**How to avoid:** Emit timer-start event AFTER creating session. Use `step.run()` to save initial state before waiting.
**Warning signs:** Timers never triggering, functions hanging indefinitely.

### Pitfall 5: Intent Detector Returns Invalid JSON

**What goes wrong:** Intent parsing fails, agent can't proceed.
**Why it happens:** LLM outputs free text instead of structured JSON, or JSON is malformed.
**How to avoid:** Use strict JSON schema in system prompt. Implement fallback parsing. Consider `strict: true` in tool definition.
**Warning signs:** Parse errors, "unknown" intents, confidence always 0.

### Pitfall 6: Session Window Not Aligned with WhatsApp

**What goes wrong:** Agent thinks session is active but WhatsApp 24h window is closed.
**Why it happens:** Session tracks agent state, not WhatsApp state separately.
**How to avoid:** Always check `conversation.last_customer_message_at` before sending messages. Cross-reference with WhatsApp 24h window.
**Warning signs:** WhatsApp API errors, failed message sends.

### Pitfall 7: Orchestrator Skips Required Flow Steps

**What goes wrong:** Agent jumps from greeting to order without collecting data.
**Why it happens:** No enforcement of state machine transitions.
**How to avoid:** User decided: "Transiciones validadas por el Orquestador." Implement transition validation in orchestrator system prompt AND in code.
**Warning signs:** Orders with missing data, confused customers.

### Pitfall 8: Streaming Response Incomplete

**What goes wrong:** Customer sees partial response, then nothing.
**Why it happens:** Stream error mid-response, no recovery.
**How to avoid:** Use `stream.finalMessage()` for complete message. Implement error handling with retry. Store partial response before streaming to client.
**Warning signs:** Truncated responses, timeouts, customer complaints.

## Code Examples

### Intent Detector System Prompt

```typescript
// Source: User decisions + standard intent classification patterns
const INTENT_DETECTOR_PROMPT = `Eres un clasificador de intents para un agente de ventas de colchones.

Tu UNICA tarea es analizar el mensaje del cliente y retornar JSON con:
- intent: el intent detectado
- confidence: porcentaje de confianza (0-100)
- alternatives: array de intents alternativos si hay ambiguedad

INTENTS DISPONIBLES:
- saludo: Cliente saluda o inicia conversacion
- precio: Pregunta sobre precios o costos
- envio: Pregunta sobre envio o tiempos de entrega
- producto: Pregunta sobre caracteristicas del producto
- datos_cliente: Cliente proporciona datos personales
- seleccion_pack: Cliente selecciona un pack (1x, 2x, 3x)
- confirmar_compra: Cliente confirma que quiere comprar
- cancelar: Cliente quiere cancelar o salir
- otro: No encaja en ningun intent

RESPONDE SOLO JSON, sin texto adicional:
{
  "intent": "string",
  "confidence": number,
  "alternatives": [{"intent": "string", "confidence": number}],
  "reasoning": "breve explicacion"
}

Si el mensaje es ambiguo (ej: "ok" puede ser confirmacion o acknowledgment),
asigna confidence < 85 y proporciona alternatives.`
```

### Orchestrator System Prompt

```typescript
// Source: User decisions + orchestrator pattern
const ORCHESTRATOR_PROMPT = `Eres el orquestador de un agente de ventas de colchones Somnio.

CONTEXTO:
- Recibes: intent detectado, confianza, estado de sesion
- Decides: que accion tomar basado en confianza y flujo

REGLAS DE CONFIANZA:
- >= 85%: PROCEDER con flujo normal
- 60-84%: RE-ANALIZAR con mas contexto
- 40-59%: CLARIFICAR pidiendo al cliente mas info
- < 40%: HANDOFF a humano

FLUJO DE VENTA:
conversacion -> collecting_data -> ofrecer_promos -> resumen -> compra_confirmada

VALIDACIONES:
- NO puedes saltar a ofrecer_promos sin datos minimos (nombre, telefono, ciudad, direccion)
- NO puedes saltar a resumen sin haber ofrecido promos
- NO puedes confirmar compra sin haber enviado resumen

TOOLS DISPONIBLES:
- crm_contact_create: Crear contacto con datos del cliente
- crm_contact_update: Actualizar datos del contacto
- crm_order_create: Crear orden de compra
- whatsapp_message_send: Enviar mensaje al cliente
- whatsapp_template_send: Enviar template (fuera de ventana 24h)

RESPONDE con accion y, si aplica, tool calls.
Si la confianza es baja, responde con mensaje de clarificacion sin tools.`
```

### Agent Engine Main Loop

```typescript
// Source: Architecture patterns + user decisions
class AgentEngine {
  constructor(
    private sessionManager: SessionManager,
    private claudeClient: ClaudeClient,
    private tokenBudget: TokenBudgetManager,
    private inngest: Inngest
  ) {}

  async processMessage(params: {
    sessionId: string
    conversationId: string
    messageContent: string
    workspaceId: string
  }): Promise<AgentResponse> {
    // 1. Load session with current version
    const session = await this.sessionManager.get(params.sessionId)
    const sessionState = await this.sessionManager.getState(params.sessionId)
    const agentConfig = agentRegistry.get(session.agent_id)

    if (!agentConfig) {
      throw new AgentError('Agent not found', session.agent_id)
    }

    // 2. Check token budget
    const budget = await this.tokenBudget.checkBudget(params.sessionId, 2000)
    if (!budget.allowed) {
      return this.handleBudgetExceeded(session, budget)
    }

    // 3. Get conversation history
    const history = await this.getConversationHistory(params.sessionId)

    // 4. Detect intent (Haiku - fast, cheap)
    const { result: intentResult, tokensUsed: intentTokens } =
      await this.claudeClient.detectIntent(
        agentConfig.intentDetector.systemPrompt,
        history,
        params.messageContent,
        agentConfig.intentDetector.model
      )

    // 5. Record user turn
    const userTurn = await this.sessionManager.addTurn({
      session_id: params.sessionId,
      turn_number: history.length + 1,
      role: 'user',
      content: params.messageContent,
      intent_detected: intentResult.intent,
      confidence: intentResult.confidence,
      tools_called: [],
      tokens_used: intentTokens,
    })

    // 6. Route based on confidence
    const action = this.determineAction(intentResult, agentConfig.confidenceThresholds)

    if (action === 'handoff') {
      return this.handleHandoff(session, intentResult)
    }

    if (action === 'clarify') {
      return this.handleClarification(session, intentResult, params.messageContent)
    }

    // 7. Orchestrate (Sonnet - intelligent)
    const tools = this.claudeClient.buildToolDefinitions(agentConfig.tools)

    const { result: orchestratorResult, tokensUsed: orchestratorTokens } =
      await this.claudeClient.orchestrate(
        agentConfig.orchestrator.systemPrompt,
        history,
        intentResult,
        sessionState,
        tools,
        agentConfig.orchestrator.model
      )

    // 8. Execute tools if requested
    let toolResults: ToolResult[] = []
    if (orchestratorResult.action === 'execute_tool' && orchestratorResult.toolCalls) {
      toolResults = await this.executeTools(
        orchestratorResult.toolCalls,
        params.workspaceId,
        params.sessionId
      )
    }

    // 9. Update session state
    const newState = this.updateSessionState(sessionState, intentResult, toolResults)

    try {
      await this.sessionManager.updateWithVersion(
        params.sessionId,
        session.version,
        {
          current_mode: orchestratorResult.nextMode ?? session.current_mode,
          last_activity_at: new Date().toISOString(),
        }
      )
      await this.sessionManager.updateState(params.sessionId, newState)
    } catch (error) {
      if (error instanceof VersionConflictError) {
        // Conflict - re-process with fresh state
        return this.processMessage(params)
      }
      throw error
    }

    // 10. Record assistant turn
    await this.sessionManager.addTurn({
      session_id: params.sessionId,
      turn_number: history.length + 2,
      role: 'assistant',
      content: orchestratorResult.response ?? '',
      intent_detected: null,
      confidence: null,
      tools_called: orchestratorResult.toolCalls ?? [],
      tokens_used: orchestratorTokens,
    })

    // 11. Emit events for timers
    if (orchestratorResult.nextMode === 'collecting_data') {
      await this.inngest.send({
        name: 'agent/collecting_data.started',
        data: { sessionId: params.sessionId },
      })
    }

    return {
      response: orchestratorResult.response,
      toolResults,
      sessionUpdated: true,
    }
  }

  private async executeTools(
    toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
    workspaceId: string,
    sessionId: string
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = []

    for (const call of toolCalls) {
      const result = await executeToolFromAgent(
        call.name,
        call.input,
        workspaceId,
        sessionId
      )
      results.push(result)
    }

    return results
  }

  private determineAction(
    intent: IntentResult,
    thresholds: AgentConfig['confidenceThresholds']
  ): 'proceed' | 'reanalyze' | 'clarify' | 'handoff' {
    if (intent.confidence >= thresholds.proceed) return 'proceed'
    if (intent.confidence >= thresholds.reanalyze) return 'reanalyze'
    if (intent.confidence >= thresholds.clarify) return 'clarify'
    return 'handoff'
  }
}
```

### Database Migration for Agent Sessions

```sql
-- Migration: Agent sessions, turns, and state
-- Phase 13: Agent Engine Core

-- ============================================================================
-- AGENT_SESSIONS TABLE
-- One session per conversation per agent
-- ============================================================================

CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Optimistic locking
  version INTEGER NOT NULL DEFAULT 1,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed', 'handed_off')),
  current_mode TEXT NOT NULL DEFAULT 'conversacion',

  -- Timestamps (America/Bogota)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- One active session per conversation
  UNIQUE(conversation_id, agent_id)
);

-- ============================================================================
-- AGENT_TURNS TABLE
-- Complete audit trail of every turn
-- ============================================================================

CREATE TABLE agent_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,

  -- Message
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Intent (for user turns)
  intent_detected TEXT,
  confidence NUMERIC(5,2),

  -- Tool calls (for assistant turns)
  tools_called JSONB NOT NULL DEFAULT '[]',

  -- Token tracking
  tokens_used INTEGER NOT NULL DEFAULT 0,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  UNIQUE(session_id, turn_number)
);

-- ============================================================================
-- SESSION_STATE TABLE
-- Flexible JSONB state per session
-- ============================================================================

CREATE TABLE session_state (
  session_id UUID PRIMARY KEY REFERENCES agent_sessions(id) ON DELETE CASCADE,

  -- State fields (user decision)
  intents_vistos JSONB NOT NULL DEFAULT '[]',
  templates_enviados JSONB NOT NULL DEFAULT '[]',
  datos_capturados JSONB NOT NULL DEFAULT '{}',
  pack_seleccionado TEXT CHECK (pack_seleccionado IN ('1x', '2x', '3x') OR pack_seleccionado IS NULL),

  -- Timestamps for timers
  proactive_started_at TIMESTAMPTZ,
  first_data_at TIMESTAMPTZ,
  min_data_at TIMESTAMPTZ,
  ofrecer_promos_at TIMESTAMPTZ,

  -- Updated timestamp
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_agent_sessions_workspace ON agent_sessions(workspace_id);
CREATE INDEX idx_agent_sessions_conversation ON agent_sessions(conversation_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(workspace_id, status);
CREATE INDEX idx_agent_sessions_activity ON agent_sessions(workspace_id, last_activity_at DESC);

CREATE INDEX idx_agent_turns_session ON agent_turns(session_id, turn_number);
CREATE INDEX idx_agent_turns_created ON agent_turns(session_id, created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER session_state_updated_at
  BEFORE UPDATE ON session_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_state ENABLE ROW LEVEL SECURITY;

-- Agent sessions: workspace isolation
CREATE POLICY "agent_sessions_workspace_select"
  ON agent_sessions FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "agent_sessions_workspace_insert"
  ON agent_sessions FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "agent_sessions_workspace_update"
  ON agent_sessions FOR UPDATE
  USING (is_workspace_member(workspace_id));

-- Agent turns: access via parent session
CREATE POLICY "agent_turns_access_select"
  ON agent_turns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = agent_turns.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

CREATE POLICY "agent_turns_access_insert"
  ON agent_turns FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = agent_turns.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

-- Session state: access via parent session
CREATE POLICY "session_state_access_select"
  ON session_state FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = session_state.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

CREATE POLICY "session_state_access_all"
  ON session_state FOR ALL
  USING (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = session_state.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

-- Enable realtime for session updates
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single LLM call for everything | Multi-component (Intent + Orchestrator) | 2025 | Better accuracy, lower costs |
| Polling for timeouts (n8n) | Event-driven with waitForEvent (Inngest) | 2025 | No wasted compute, durable |
| Full history in every call | Summarization + sliding window | 2025-2026 | 30% token reduction |
| Pessimistic database locking | Optimistic locking with version | Standard | Better concurrency |
| Claude 3.5 Sonnet | Claude 4.5 series (Haiku/Sonnet) | 2025-2026 | 67% cost reduction, better performance |

**Model Selection (2026):**
- **Haiku 4.5** ($1/$5): Intent detection, classification, simple routing
- **Sonnet 4.5** ($3/$15): Orchestration, complex reasoning, tool selection
- **Opus 4.6** ($5/$25): Not needed for this use case (overkill for sales agent)

## Open Questions

### 1. Data Extractor Implementation

**What we know:** User listed Data Extractor as "Claude's Discretion" - can be code or Claude.
**What's unclear:** Whether to use Claude (more flexible) or regex/rules (cheaper, faster).
**Recommendation:** Start with Claude (Haiku) for flexibility. Profile after launch - if Data Extractor is called frequently, consider rule-based extraction for common fields (phone, email).

### 2. Inngest Table Schema

**What we know:** User mentioned "Esquema exacto de la tabla proactive_checks para Inngest" as Claude's discretion.
**What's unclear:** Whether Inngest needs its own state table or can use session_state.
**Recommendation:** Inngest manages its own state internally. Store only the timestamps in session_state (`proactive_started_at`, etc.) for debugging. Don't create a separate `proactive_checks` table.

### 3. Conversation History Truncation Strategy

**What we know:** Need to stay under 50K tokens per conversation.
**What's unclear:** Exact strategy for old turn removal.
**Recommendation:** Keep last 20 turns in full. Summarize older turns into a "conversation summary" prepended to history. Implement after basic engine works.

### 4. Error Recovery for Tool Failures

**What we know:** Tools can fail (from Phase 12 research).
**What's unclear:** How orchestrator should handle tool failures.
**Recommendation:** Send tool error result back to Claude in `tool_result` block with `is_error: true`. Let orchestrator decide retry vs alternative vs message to customer.

## Sources

### Primary (HIGH confidence)
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript) - Official SDK docs, streaming, tool use
- [Claude API Streaming](https://platform.claude.com/docs/en/api/messages-streaming) - SSE events, tool_use streaming
- [Claude Tool Use](https://platform.claude.com/docs/en/docs/build-with-claude/tool-use/overview) - Tool definitions, execution loop
- [Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) - Model specs, pricing, use cases
- [Inngest waitForEvent](https://www.inngest.com/docs/reference/functions/step-wait-for-event) - API reference
- [Inngest Steps](https://www.inngest.com/docs/learn/inngest-steps) - Step patterns, durability
- Existing codebase: `src/lib/tools/executor.ts` - executeToolFromAgent() implementation

### Secondary (MEDIUM confidence)
- [Anthropic API Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration) - Cost comparison
- [Multi-agent Architecture Patterns](https://www.solulab.com/build-a-conversational-ai-multi-agent-bot/) - Intent + orchestrator separation
- [Supabase Optimistic Locking](https://bootstrapped.app/guide/how-to-handle-concurrent-writes-in-supabase) - Version counter pattern

### Tertiary (LOW confidence)
- Token budget defaults (50K) - User decision, not externally validated
- Confidence thresholds (85/60/40) - User decision, may need tuning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official SDK docs, installed libraries verified
- Architecture patterns: HIGH - User decisions locked in CONTEXT.md, verified with official docs
- Session management: HIGH - Standard optimistic locking pattern, Supabase verified
- Inngest integration: MEDIUM - Official docs clear, but no existing setup in project
- Claude prompts: MEDIUM - Patterns documented, but will need tuning in practice
- Pitfalls: HIGH - Derived from SDK docs, user decisions, and Phase 12 learnings

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days - Claude models and Inngest are fast-moving)
