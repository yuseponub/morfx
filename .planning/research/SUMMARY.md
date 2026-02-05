# Project Research Summary

**Project:** MorfX MVP v2.0 - Agentes Conversacionales
**Domain:** Conversational AI agents integrated with CRM and WhatsApp
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

MorfX v2 transforms the current n8n-based agent system into code-controlled conversational agents with visual canvas management. This migration targets the core architectural limitations that prevent true autonomy in n8n: statelessness, lack of programmatic control, and poor observability. The recommended approach leverages **Vercel AI SDK 6** (not raw Anthropic SDK or Claude Agent SDK) as the primary Claude integration layer, paired with **@xyflow/react** for visual canvas management. This hybrid strategy gives users visual simplicity for basic flows while enabling code-level control for complex logic—the key differentiator over pure n8n or pure code solutions.

The critical architectural decision is **hybrid execution**: lightweight orchestration in Next.js API routes for fast responses (<10s), with fallback to Supabase Edge Functions for complex multi-step operations (up to 150s). This avoids introducing external workers while staying within Vercel's timeout limits. The existing MorfX infrastructure (Action DSL with 16+ tools, WhatsApp webhook handler, CRM data model) becomes the foundation—agents simply become intelligent callers of existing tools.

Key risks center on **context window management** (WhatsApp conversations span days, easily exhausting 200K tokens), **cost explosion from agentic loops** (uncontrolled tool retries consuming thousands of tokens), and **parallel system conflicts** (n8n and new agents both responding to same messages during migration). Mitigation requires token budgets from day one, circuit breakers on tool failures, and clear routing boundaries between systems.

## Key Findings

### Recommended Stack

The stack leverages AI SDK 6's agent loop management, streaming support, and tool execution approval to avoid reinventing well-solved problems. The key insight: AI SDK 6 provides the abstraction layer needed for production agent systems, while raw `@anthropic-ai/sdk` forces manual implementation of retry logic, streaming SSE parsing, and multi-step coordination.

**Core technologies:**
- **Vercel AI SDK 6** (`ai` ^6.0.69): Agent loop management, streaming, tool approval hooks — eliminates boilerplate for multi-step agent flows with built-in DevTools for debugging
- **@ai-sdk/anthropic** (^3.0.36): Claude provider integration — clean abstraction over raw Anthropic API with unified tool calling + structured output in single call
- **@xyflow/react** (^12.10.0): Visual canvas for agent workflows — industry standard (used by Stripe, Typeform) with DOM-based nodes allowing custom React components inside
- **Zustand** (^5.0.0): Agent state management — minimal boilerplate, works with React 19 concurrent features, supports immer middleware for immutable updates

**Why NOT alternatives:**
- **Claude Agent SDK**: Designed for autonomous coding agents with file system access, not conversational CRM agents (71MB vs 3MB for AI SDK)
- **LangChain/LangGraph**: Heavy dependency graph adds complexity without clear benefit for this use case
- **Custom canvas**: Months of work to match @xyflow/react's zoom/pan/selection edge cases

### Expected Features

Based on WhatsApp 2026 AI policy, competitor analysis (n8n, LangGraph), and production agent systems, the feature landscape divides into table stakes, differentiators, and anti-features to deliberately avoid.

**Must have (table stakes):**
- **Conversation context management** — agents remember previous exchanges (63% of users abandon after one bad experience without memory)
- **Human handoff with context** — WhatsApp 2026 policy requires easy escalation, must include summary to avoid "amnesia problem"
- **Tool/function calling** — agents execute CRM actions via existing Action DSL
- **Error handling & fallbacks** — graceful degradation when tools fail (should fall back to templates, not silence)
- **Message queueing** — handle concurrent conversations without losing messages in burst traffic
- **Rate limiting** — prevent runaway API costs from loops (n8n users report agents "hallucinating after few interactions")

**Should have (competitive differentiators):**
- **Code-controlled logic with visual escape hatches** — hybrid approach: visual for simple, code for complex (n8n is visual-only, LangGraph is code-only)
- **Persistent memory across sessions** — agent remembers customer history (n8n's "stateless architecture" is biggest complaint)
- **Unified CRM+Agent context** — agent knows full customer history without separate integration
- **Multi-agent orchestration** — specialized agents (Sales, Support, Logistics) working together, mirrors current n8n setup
- **Agent observability dashboard** — see exactly what agents are doing, why (LangSmith-like tracing but built-in)

**Defer (v2+):**
- **Visual canvas advanced features** — defer minimap, undo/redo, collaborative editing until core agent works
- **Real-time learning from conversations** — compliance nightmare, train offline instead
- **Multi-agent orchestration** — wait for single-agent to stabilize first

**Anti-features (deliberately avoid):**
- **General-purpose chatbot** — WhatsApp 2026 policy bans this, build purpose-specific agents instead
- **Unlimited context stuffing** — causes errors and exploding costs, implement sliding window + summarization
- **Auto-approval for destructive actions** — require human approval for deletes, large orders

### Architecture Approach

The architecture extends existing MorfX infrastructure rather than replacing it. The webhook handler at `src/lib/whatsapp/webhook-handler.ts` gains an agent check: if conversation has active agent, queue processing. The tool registry at `src/lib/tools/registry.ts` exposes 16+ existing tools to agents via an adapter that converts MorfX schemas to AI SDK format. Supabase Realtime (already in use) handles cross-tab synchronization of agent state.

**Major components:**

1. **Agent Engine** — Claude API integration via AI SDK 6's `streamText` with automatic agent loop (20 steps default), tool approval hooks via `onToolCall`, and SSE streaming for real-time UI updates

2. **Data Model** — Three new tables: `agents` (definition + canvas state), `agent_sessions` (conversation context with resumption), `agent_turns` (each exchange for audit/replay). Links to existing `conversations`, `messages`, `tool_executions` tables

3. **Visual Canvas** — React Flow nodes represent agent states (trigger, condition, action, response, handoff). Canvas compiles to system prompt at runtime. Custom node types use existing shadcn/ui components for consistency

4. **Tool Integration Bridge** — Adapter converts MorfX tool schemas (JSON Schema) to AI SDK format (Zod), routes through existing `executeToolFromAgent` for permission checks and forensic logging

5. **Execution Layer** — Hybrid approach: Next.js API routes for simple responses (<10s), Supabase Edge Functions for complex multi-step (up to 150s), no external workers needed

### Critical Pitfalls

Based on official Claude API documentation, WhatsApp 2026 policy, and production agent system failures:

1. **Context window exhaustion** — WhatsApp conversations span days, accumulating tokens until 200K limit errors out. Mitigation: implement summarization before 150K tokens, use Memory Tool for facts outside context, track token usage before sending.

2. **Cost explosion from agentic loops** — Agent enters retry loop, consuming thousands of tokens in minutes ($50 instead of $0.50). Mitigation: hard token budget per conversation (50K max), limit max turns (20), monitor in real-time with alerts at 50%/75%/90%.

3. **n8n + code agents responding in parallel** — During migration, both systems respond to same message creating duplicates, conflicting actions. Mitigation: route by conversation metadata ("owned by n8n" vs "owned by code agent"), never test on production WhatsApp numbers, implement traffic controller.

4. **Tool failures cascading into dead conversations** — Tool fails, agent loops or fabricates response. Mitigation: wrap ALL tool calls with exponential backoff, circuit breaker after 3 failures, explicit failure responses ("let me connect you with a human").

5. **Human handoff loses context** — Customer repeats everything to human agent. Mitigation: ALWAYS generate structured handoff summary (intent, attempted solutions, sentiment, key details), display AI conversation history prominently in human interface.

6. **Prompt caching implementation failures** — Cache hit rate <10% despite expecting 90% savings. Mitigation: cache system prompt + tool definitions (static content), place `cache_control` after static/before dynamic, verify 1024+ token threshold met, monitor cache_read vs cache_creation tokens.

7. **WhatsApp rate limits during burst traffic** — Marketing campaign sends 10K users, webhook overwhelmed, messages lost. Mitigation: queue ALL incoming messages (Redis/Bull) before processing, return 200 immediately, process async at controlled rate.

## Implications for Roadmap

Based on architecture dependencies, feature priorities, and pitfall prevention, the suggested phase structure addresses n8n migration while building on existing MorfX infrastructure.

### Phase 12: Auditoría de Agentes Actuales
**Rationale:** Information gathering before architecture decisions. Understand current n8n agent behavior (Carolina v3, State Analyzer, Historial v3, Order Manager, Proactive Timer) to preserve critical business logic during migration.

**Delivers:** Documentation of existing agent triggers, decision logic, tools used, state transitions, handoff criteria. No code changes.

**Addresses:** Avoids pitfall #3 (parallel system conflicts) by understanding what must be replicated and what can be improved.

**Research needs:** None (documentation exercise).

### Phase 13: Canvas Visual de Agentes
**Rationale:** Build UI layer first while backend patterns stabilize. Canvas provides visualization for Phase 15-16 implementation and testing. Can develop in parallel with Phase 14 tool work.

**Delivers:**
- `agents` table schema with `canvas_state` JSONB
- React Flow canvas UI at `/agentes/[id]`
- Custom node types (trigger, condition, action, response, handoff)
- Node configuration panel
- Canvas-to-prompt compiler (converts visual flow to system prompt)

**Uses:** @xyflow/react from STACK.md, existing shadcn/ui components for node internals.

**Avoids:** Pitfall #6 (over-engineering canvas) by strict MVP scope: nodes + edges + basic drag/drop only, defer minimap/undo/collaborative editing.

**Research needs:** Minimal (React Flow is well-documented, standard patterns).

### Phase 14: Action DSL → Funciones Reales
**Rationale:** Agents are only useful if tools do real work. Replace placeholder handlers with actual implementations. Foundational for Phase 15-16 agent execution.

**Delivers:**
- Real CRM handlers: `crm.contact.create/update/read`, `crm.tag.add/remove`, `crm.order.create/updateStatus`
- Real WhatsApp handlers: `whatsapp.message.send`, `whatsapp.template.send`
- Retry logic + circuit breakers on all handlers
- Structured error responses (not just exceptions)

**Addresses:**
- **Feature:** Tool/function calling (table stakes)
- **Pitfall #4:** Tool failures cascading (exponential backoff, circuit breaker)

**Research needs:** Phase-specific research for CRM integration patterns, WhatsApp Business API edge cases.

### Phase 15: Motor de Agente Claude
**Rationale:** Core agent execution layer. Depends on real tools (Phase 14) to be testable. Canvas (Phase 13) provides visualization.

**Delivers:**
- `agent_sessions` and `agent_turns` tables
- AI SDK 6 integration with `streamText` and agent loop
- Tool adapter (MorfX schemas → AI SDK format)
- Streaming API at `/api/agent/stream`
- Token budget enforcement (50K max per conversation)
- Context management (summarization at 150K tokens)
- Prompt caching (system prompt + tool definitions cached)

**Uses:**
- **Stack:** Vercel AI SDK 6, @ai-sdk/anthropic
- **Architecture:** Agent Engine component, Tool Integration Bridge

**Addresses:**
- **Features:** Conversation context, response generation, intent recognition
- **Pitfall #1:** Context exhaustion (summarization before 150K)
- **Pitfall #2:** Cost explosion (token budgets, max turns)
- **Pitfall #7:** Prompt caching failures (correct cache_control placement)

**Research needs:** Phase-specific research for Claude API advanced features (extended thinking configuration, structured output edge cases).

### Phase 16: Agent Sandbox
**Rationale:** Testing environment before production WhatsApp integration. Needs working agent engine (Phase 15).

**Delivers:**
- `/sandbox` UI for testing agents
- Mock conversation flows
- Tool execution visualization
- SSE streaming for real-time "thinking" display
- Dry-run mode (executes tools without side effects)

**Uses:**
- **Architecture:** Streaming API from Phase 15
- **Existing:** Tool executor dry-run support (already built)

**Addresses:**
- **Feature:** Agent observability dashboard
- **Validates:** All pitfall mitigations before production

**Research needs:** None (uses existing patterns).

### Phase 17: WhatsApp Agent Integration
**Rationale:** Production integration only after sandbox testing proves stability. Final phase to avoid production incidents.

**Delivers:**
- Webhook handler extension (check agent config for conversation)
- Message queue (Redis/Bull) for burst traffic
- Agent activation rules (keywords, schedule, manual)
- Human handoff logic with context summary
- n8n/code-agent routing ("traffic controller")
- WhatsApp 2026 policy compliance (purpose-specific agents)

**Uses:**
- **Existing:** WhatsApp webhook handler, conversations table, teams/assignment
- **New:** Agent engine from Phase 15

**Addresses:**
- **Features:** Human handoff, message queueing, rate limiting
- **Pitfall #3:** Parallel system conflicts (routing rules)
- **Pitfall #5:** Handoff loses context (structured summary)
- **Pitfall #8:** WhatsApp rate limits (queue architecture)
- **Pitfall #13:** WhatsApp 2026 policy (purpose-specific design)

**Research needs:** Phase-specific research for WhatsApp Business API rate limits, Meta policy compliance requirements.

### Phase Ordering Rationale

- **Phases 12-13 can run in parallel**: Audit is documentation, canvas is UI-only
- **Phase 14 must complete before 15**: Agents need real tools to be meaningful
- **Phase 15 is critical path**: Core agent engine blocks sandbox and production
- **Phase 16 before 17**: Never ship agents to production without sandbox testing
- **Phase 17 last**: Production integration after all pieces validated

**Dependency chain:** Audit (12) → Real Tools (14) → Agent Engine (15) → Sandbox (16) → Production (17)

**Parallel work:** Canvas (13) develops alongside Phases 14-15, provides visualization once agent engine ready

### Research Flags

**Phases likely needing `/gsd:research-phase` during planning:**

- **Phase 14 (Action DSL Real Handlers):** CRM integration patterns, WhatsApp Business API edge cases, error recovery strategies for external APIs
- **Phase 15 (Motor de Agente):** Claude API advanced features (extended thinking budget tuning, structured output constraints), prompt engineering patterns for CRM agents
- **Phase 17 (WhatsApp Integration):** WhatsApp Business API rate limits and throttling, Meta 2026 AI policy compliance requirements

**Phases with standard patterns (skip research-phase):**

- **Phase 12 (Auditoría):** Pure documentation, no technical research needed
- **Phase 13 (Canvas Visual):** React Flow is well-documented with established patterns
- **Phase 16 (Sandbox):** Reuses patterns from Phase 15, standard testing UI

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified on npm with official docs, versions confirmed compatible with Next.js 15 + React 19 |
| Features | HIGH | Based on official WhatsApp 2026 policy, competitor analysis (n8n limitations documented by users), production agent best practices |
| Architecture | MEDIUM-HIGH | Execution layer (hybrid Next.js/Supabase Edge) is novel but proven components. Data model extends existing patterns successfully |
| Pitfalls | HIGH | Sourced from official Claude API docs, WhatsApp policy docs, and verified production failures in community |

**Overall confidence:** HIGH

### Gaps to Address

Areas where research was inconclusive or needs validation during implementation:

- **Context summarization strategy:** Claude API docs explain context windows but don't prescribe exact summarization patterns. Will need experimentation in Phase 15 to find optimal "checkpoint" timing and summary format that preserves critical customer context.

- **n8n to code-agent migration path:** Clear that parallel systems create conflicts, but specific routing logic depends on actual n8n workflows discovered in Phase 12 audit. Traffic controller design must wait for audit results.

- **Optimal token budgets:** Research shows budgets are critical, but exact limits (50K per conversation, 20 max turns) are starting points. Production usage in Phase 16 sandbox will reveal if adjustments needed before Phase 17.

- **Extended thinking configuration:** Claude API supports extended thinking with `budget_tokens`, but optimal settings for CRM use cases (vs coding agents) needs experimentation. Phase 15 should test thinking budgets from 1K-10K to find cost/quality balance.

- **WhatsApp Business API rate limits:** Documentation exists but real-world limits during burst traffic (marketing campaigns) may differ. Phase 17 should include load testing with gradual rollout.

## Sources

### Primary (HIGH confidence)
- [AI SDK npm package](https://www.npmjs.com/package/ai) - v6.0.69
- [AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
- [AI SDK Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) - v3.0.36
- [Claude API Context Windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [Claude API Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Claude API Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [WhatsApp 2026 AI Policy Explained](https://learn.turn.io/l/en/article/khmn56xu3a-whats-app-s-2026-ai-policy-explained)
- [@xyflow/react npm](https://www.npmjs.com/package/@xyflow/react) - v12.10.0
- [React Flow Documentation](https://reactflow.dev)

### Secondary (MEDIUM confidence)
- [n8n AI Agent Limitations](https://community.n8n.io/t/when-n8n-is-not-the-right-choice-for-ai-automation/187135) - Community frustrations
- [Why I decided against n8n AI Agent node](https://community.latenode.com/t/why-i-decided-against-using-the-ai-agent-node-in-n8n/23415) - User problems
- [LangGraph vs n8n Comparison](https://www.zenml.io/blog/langgraph-vs-n8n) - Feature comparison
- [Tool Calling Explained: AI Agents Guide](https://composio.dev/blog/ai-agent-tool-calling-guide)
- [Escalation Design: AI Handoff Failures](https://www.bucher-suter.com/escalation-design-why-ai-fails-at-the-handoff-not-the-automation/)
- [AI Agent Observability Platforms](https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide)

### Existing MorfX Code (verified in codebase)
- `/src/lib/tools/registry.ts` - Tool registration system
- `/src/lib/tools/executor.ts` - Tool execution with `executeToolFromAgent`
- `/src/lib/tools/types.ts` - MCP-compatible tool types
- `/src/lib/whatsapp/webhook-handler.ts` - WhatsApp message processing
- `.planning/phases/03-action-dsl-core/03-RESEARCH.md` - Action DSL design

---
*Research completed: 2026-02-04*
*Ready for roadmap: yes*
