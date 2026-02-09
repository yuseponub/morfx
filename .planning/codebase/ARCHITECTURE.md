# Architecture

**Analysis Date:** 2026-02-09

## Pattern Overview

**Overall:** Layered Hexagonal Architecture with Domain-Driven Design

**Key Characteristics:**
- Multi-tenant SaaS with workspace isolation at all layers
- Event-driven agent system with orchestrated tool execution
- Clear separation between conversational agents (Somnio) and domain agents (CRM)
- Pluggable timer system for state-driven workflow automation
- Forensic logging for all tool executions and agent interactions

## Layers

**Presentation Layer (Next.js App Router):**
- Purpose: User interface and API endpoints for external systems
- Location: `src/app/`
- Contains: React Server Components, Server Actions, API routes (webhooks, agent endpoints)
- Depends on: Domain layer (agents, tools), Infrastructure layer (Supabase)
- Used by: End users, WhatsApp webhooks, Shopify webhooks, external API clients

**Domain Layer (Business Logic):**
- Purpose: Core business logic for agents, CRM operations, and sales workflows
- Location: `src/lib/agents/`, `src/lib/tools/`, `src/lib/sandbox/`
- Contains: Agent engines, orchestrators, tool registry, execution logic
- Depends on: Infrastructure layer for persistence and external integrations
- Used by: Presentation layer, background jobs (Inngest)

**Infrastructure Layer (External Systems):**
- Purpose: Database access, external APIs, authentication, messaging
- Location: `src/lib/supabase/`, `src/lib/whatsapp/`, `src/lib/shopify/`
- Contains: Supabase clients, WhatsApp API wrappers, Shopify integration
- Depends on: External services (Supabase, 360dialog, Shopify)
- Used by: Domain layer for data persistence and external communication

**Sandbox Layer (In-Memory Testing):**
- Purpose: Agent testing without database writes or external API calls
- Location: `src/lib/sandbox/`, `src/app/(dashboard)/sandbox/`
- Contains: SandboxEngine, SandboxSession, IngestTimerSimulator
- Depends on: Domain layer components (reused with mocked persistence)
- Used by: Development and testing workflows

## Data Flow

**Incoming WhatsApp Message Flow:**

1. 360dialog webhook → `POST /api/webhooks/whatsapp`
2. Webhook handler validates payload and extracts message
3. Creates/retrieves conversation and contact records in Supabase
4. Routes to SomnioEngine if agent-enabled conversation
5. SomnioEngine processes message through orchestration pipeline:
   - IntentDetector classifies message (Claude Haiku)
   - IngestManager handles data collection in collecting_data mode
   - SomnioOrchestrator selects templates and determines next mode
   - TemplateManager processes variable substitution
   - Tool execution via Action DSL (CRM updates, WhatsApp sends)
6. Response messages queued and sent via 360dialog API
7. Session state persisted to `agent_sessions` and `agent_turns` tables

**Agent Processing Pipeline (SomnioEngine):**

1. Load or create session from `agent_sessions` table
2. Build conversation history from `agent_turns` table
3. **Intent Detection** (Fast path with Claude Haiku):
   - Classify message into predefined intents
   - Calculate confidence score
   - Determine action (proceed/clarify/handoff/reanalyze)
4. **Ingest Handling** (if mode=collecting_data):
   - MessageClassifier determines if message contains data
   - DataExtractor pulls structured fields from message
   - IngestManager merges with existing data, tracks timeline
   - Emits timer events for follow-up automation
5. **Orchestration** (Decision-making with Claude Sonnet):
   - TransitionValidator checks if intent is allowed in current mode
   - SomnioOrchestrator selects templates based on intent history
   - Determines mode transition based on business rules
   - Builds tool calls for CRM operations
6. **Tool Execution** (Action DSL):
   - ToolRegistry validates inputs against JSON schemas
   - ToolExecutor runs handlers with dry-run support
   - Forensic logging to `tool_executions` table
   - Returns results to agent for context
7. **Order Creation** (CRM Orchestrator):
   - SomnioOrchestrator signals order creation on compra_confirmada
   - Routes to CrmOrchestrator with create_order command
   - OrderManager agent handles product lookup and line items
   - Creates order with stage tracking and CRM integration
8. **Response Sequencing**:
   - MessageSequencer queues templates in order
   - Variable substitution for personalization
   - Delay simulation between messages (real flow only)
   - Send via WhatsApp API or sandbox mock

**State Management:**

- Session state stored in `agent_sessions.state` JSONB column
- Includes: `intents_vistos`, `templates_enviados`, `datos_capturados`, `pack_seleccionado`
- Optimistic locking via `version` column prevents concurrent update conflicts
- State transitions validated by TransitionValidator using state machine rules

## Key Abstractions

**AgentEngine:**
- Purpose: Main entry point for conversational agent message processing
- Examples: `src/lib/agents/engine.ts`
- Pattern: Coordinator that delegates to IntentDetector, Orchestrator, SessionManager
- Responsibilities: Session lifecycle, intent detection, tool execution, state updates

**SomnioEngine:**
- Purpose: Specialized engine for Somnio sales agent with ingest workflow
- Examples: `src/lib/agents/somnio/somnio-engine.ts`
- Pattern: Extension of AgentEngine with Somnio-specific flow (IngestManager, OrderCreator)
- Responsibilities: Ingest mode handling, pack selection, order creation signaling

**Orchestrator:**
- Purpose: Decides what actions to take based on intent, confidence, and session state
- Examples: `src/lib/agents/orchestrator.ts`, `src/lib/agents/somnio/somnio-orchestrator.ts`
- Pattern: Strategy pattern - different orchestrators for different agent types
- Responsibilities: State transition validation, template selection, tool call generation

**CrmOrchestrator:**
- Purpose: Routes domain commands (create_order) to specialized CRM agents
- Examples: `src/lib/agents/crm/crm-orchestrator.ts`, `src/lib/agents/crm/order-manager/agent.ts`
- Pattern: Command pattern with agent registry for handler lookup
- Responsibilities: Command routing, agent execution, token tracking

**ToolRegistry:**
- Purpose: Central registry for all executable tools with JSON Schema validation
- Examples: `src/lib/tools/registry.ts`, `src/lib/tools/schemas/crm.tools.ts`
- Pattern: Registry pattern with compiled Ajv validators for performance
- Responsibilities: Tool registration, input validation, schema discovery

**SessionManager:**
- Purpose: Manages agent session CRUD with optimistic locking
- Examples: `src/lib/agents/session-manager.ts`
- Pattern: Repository pattern with version control for concurrent updates
- Responsibilities: Session creation, state updates, turn recording, version conflicts

**IngestManager:**
- Purpose: Handles data collection workflow in collecting_data mode
- Examples: `src/lib/agents/somnio/ingest-manager.ts`
- Pattern: State machine with MessageClassifier, DataExtractor, TransitionValidator
- Responsibilities: Silent accumulation, completion detection, timer coordination

**IngestTimerSimulator:**
- Purpose: Pure-logic timer engine for 5-level ingest timer system
- Examples: `src/lib/sandbox/ingest-timer.ts`
- Pattern: State evaluator with pluggable configuration
- Responsibilities: Timer level evaluation, action building, countdown management

## Entry Points

**WhatsApp Webhook Handler:**
- Location: `src/app/api/webhooks/whatsapp/route.ts`
- Triggers: Incoming WhatsApp messages via 360dialog webhook
- Responsibilities: Webhook verification, payload processing, conversation routing to SomnioEngine

**Somnio Agent API:**
- Location: `src/app/api/agents/somnio/route.ts`
- Triggers: Direct API calls for testing or external integrations
- Responsibilities: Message processing through SomnioEngine, response formatting

**Sandbox Processor:**
- Location: `src/app/api/sandbox/process/route.ts`
- Triggers: Sandbox UI message submission
- Responsibilities: In-memory message processing via SandboxEngine (no DB writes)

**Shopify Webhook Handler:**
- Location: `src/app/api/webhooks/shopify/route.ts`
- Triggers: Shopify order events (orders/create, orders/updated)
- Responsibilities: HMAC validation, order import, contact matching, CRM sync

**Dashboard Pages:**
- Location: `src/app/(dashboard)/*/page.tsx`
- Triggers: User navigation in authenticated dashboard
- Responsibilities: Server-side data fetching, component rendering, workspace context

**Root Layout:**
- Location: `src/app/page.tsx`
- Triggers: Direct site access
- Responsibilities: Auth check, redirect to /crm (authenticated) or /login (guest)

## Error Handling

**Strategy:** Typed errors with specific handling at each layer

**Patterns:**
- **Agent Layer Errors**: `AgentError`, `BudgetExceededError`, `VersionConflictError`, `AgentNotFoundError`
  - Retries for version conflicts (optimistic locking)
  - Budget checks before expensive Claude calls
  - Session-level error recovery
- **Tool Execution Errors**: `ToolValidationError`, `PermissionError`, `TimeoutError`, `RateLimitError`
  - Input validation before execution (fail fast)
  - Permission checks against user role
  - Domain-specific timeouts (5s CRM, 15s WhatsApp)
  - Rate limiting per workspace per module
- **Webhook Errors**: Return 200 OK to prevent retries, log errors for investigation
  - Webhooks always return success to avoid infinite retries
  - Actual errors logged to Pino with structured context
- **Forensic Logging**: All tool executions logged to `tool_executions` table regardless of success/failure
  - Includes: inputs, outputs, duration, error stack traces
  - Enables post-mortem debugging and audit trails

## Cross-Cutting Concerns

**Logging:**
- Framework: Pino for structured JSON logging
- Locations: `src/lib/audit/logger.ts` (module loggers), `src/lib/audit/tool-logger.ts` (tool-specific)
- Levels: debug, info, warn, error
- Context: All logs include module name, operation type, relevant IDs (sessionId, workspaceId)

**Validation:**
- Schema: JSON Schema (Ajv) for tool inputs, Zod for API route inputs
- Compiled validators for performance (10x faster)
- Strict mode enforced (no coercion, all errors returned)
- Locations: `src/lib/tools/registry.ts` (tool validation), API route handlers (request validation)

**Authentication:**
- Provider: Supabase Auth (email/password, magic links)
- Middleware: `src/lib/supabase/middleware.ts` (session refresh)
- Server-side: `src/lib/supabase/server.ts` (createClient with cookie management)
- Client-side: `src/lib/supabase/client.ts` (browser client for real-time)
- Row-Level Security (RLS): Enforced on all Supabase tables with workspace_id filtering

**Multi-Tenancy:**
- Isolation: workspace_id column on all tables with RLS policies
- Context: WorkspaceProvider (`src/components/providers/workspace-provider.tsx`) provides workspace context to React tree
- Storage: Selected workspace stored in cookie (`morfx_workspace`)
- Enforcement: All tool executions require workspaceId in ExecutionContext

**Rate Limiting:**
- Scope: Per workspace, per module (crm, whatsapp, system)
- Implementation: `src/lib/tools/rate-limiter.ts` with in-memory token bucket
- Limits: CRM 100/min, WhatsApp 30/min, System 50/min
- Errors: RateLimitError with resetMs for retry-after signaling

**Token Budget Tracking:**
- Purpose: Prevent runaway Claude API costs per agent session
- Implementation: `src/lib/agents/token-budget.ts` with budget limits per session
- Storage: `agent_sessions` table tracks total tokens used
- Models tracked: Per-model token usage in `agent_turns.tokens_used`

**Timer System Integration:**
- Phase 15.7 pluggable timer with 5 levels (sin datos, datos parciales, datos minimos, promos sin respuesta, pack sin confirmar)
- Signal types: start, cancel, reevaluate
- Integration points:
  - IngestManager emits timer signals on first data arrival
  - SomnioEngine emits on mode transitions
  - SandboxEngine propagates timer signals to client for UI countdown
  - Timer actions trigger forced intent processing (e.g., auto-transition to ofrecer_promos)

---

*Architecture analysis: 2026-02-09*

**Critical Integration Points for Phase 16 (WhatsApp Connection):**

1. **Message Ingestion**: Webhook handler (`src/app/api/webhooks/whatsapp/route.ts`) already receives 360dialog webhooks, creates conversations, and routes to SomnioEngine. Phase 16 will enable agent mode toggle per conversation.

2. **Message Output**: MessageSequencer (`src/lib/agents/somnio/message-sequencer.ts`) already handles template queueing and delay simulation. Phase 16 will wire to real 360dialog API calls instead of mock delays.

3. **Session Continuity**: SessionManager (`src/lib/agents/session-manager.ts`) already persists agent sessions with state. Existing sessions will seamlessly continue when agent mode is enabled.

4. **Order Creation**: CrmOrchestrator (`src/lib/agents/crm/crm-orchestrator.ts`) already handles order creation commands from SomnioEngine. Phase 16 needs no changes to order flow.

5. **Template Dispatch**: TemplateManager (`src/lib/agents/somnio/template-manager.ts`) selects templates based on intent history. Phase 16 will add skip logic to prevent re-sending templates already dispatched to real WhatsApp.

6. **Timer Automation**: Inngest workflows will receive timer events from SomnioEngine. Phase 16 will connect Inngest functions to trigger forced intents (e.g., auto-offer promos after 2min of minimum data).
