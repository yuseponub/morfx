# Feature Landscape: Conversational Agents for CRM+WhatsApp

**Domain:** Conversational AI Agents integrated with CRM and WhatsApp
**Researched:** 2026-02-04
**Overall confidence:** HIGH (well-established domain with clear patterns)

## Agent System Features

### Table Stakes

Features users expect in any production conversational agent system. Missing = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Dependency on Existing MorfX | Notes |
|---------|--------------|------------|------------------------------|-------|
| **Conversation Context Management** | Agents must remember what was said earlier in conversation | Medium | WhatsApp messaging (Phase 7-8) | Without context, agents repeat questions and frustrate users |
| **Human Handoff** | WhatsApp 2026 policy requires easy escalation to humans | Medium | Teams + Assignment (Phase 8) | 63% of users abandon after one bad bot experience without human escape |
| **Tool/Function Calling** | Agents need to execute actions (create order, update contact) | Low | Action DSL (Phase 3) already built | Core capability already exists in MorfX |
| **Response Generation** | Claude API integration for LLM responses | Medium | None (new integration) | Primary value proposition - intelligent responses |
| **Conversation History Storage** | Store all agent conversations for audit, training | Low | Messages table (Phase 7) | Already storing WhatsApp messages |
| **Intent Recognition** | Understand what user wants from their message | Medium | None | Can leverage Claude's native understanding |
| **Error Handling & Fallbacks** | Graceful degradation when agent fails | Medium | Quick Replies (Phase 8) | Should fall back to templates, not silence |
| **Message Queueing** | Handle concurrent conversations without losing messages | High | WhatsApp webhook (Phase 7) | Critical for production reliability |
| **Agent Enable/Disable per Conversation** | Turn agent on/off for specific conversations | Low | Conversations table (Phase 7) | Simple flag, critical for human takeover |
| **Basic Agent Configuration** | Set agent personality, knowledge scope | Low | Settings infrastructure (Phase 8.1) | UI for agent settings |
| **Rate Limiting** | Prevent runaway API costs from loops | Medium | API key system (Phase 3) | n8n users report agents "hallucinating after few interactions" |
| **Execution Logging** | Track what agents do for debugging | Low | Tool execution logs (Phase 3) | Already built in Action DSL |

### Differentiators

Features that set MorfX agents apart from n8n, Langchain, and other platforms. These are the reasons users would choose MorfX over alternatives.

| Feature | Value Proposition | Complexity | Dependency | Notes |
|---------|-------------------|------------|------------|-------|
| **Code-Controlled Agent Logic** | Full programmatic control vs n8n's visual-only | High | Action DSL (Phase 3) | n8n users frustrated by "lack of true autonomy" - code gives more control |
| **Visual Canvas WITH Code Escape Hatches** | Best of both worlds - visual for simple, code for complex | Very High | New infrastructure | n8n is visual-only, LangGraph is code-only - hybrid is rare |
| **Persistent Memory Across Sessions** | Agent remembers customer across conversations | High | Contacts table (Phase 4) | n8n's "stateless architecture" is biggest complaint |
| **Unified CRM+Agent Context** | Agent knows full customer history (orders, notes, pipeline stage) | Medium | All CRM phases | Competitors require separate CRM integration |
| **Deep WhatsApp Integration** | Native WhatsApp support, not bolted on | Low | WhatsApp phases (7-8) | Already built, just needs agent integration |
| **Multi-Agent Orchestration** | Specialized agents working together (Sales, Support, Logistics) | Very High | New infrastructure | Mirrors current n8n setup, enables gradual migration |
| **Agent Observability Dashboard** | See exactly what agents are doing, why | High | New infrastructure | LangSmith-like tracing but built-in |
| **Checkpoint/Resume** | Save agent state, resume after failure | High | New infrastructure | LangGraph has this, n8n doesn't |
| **Context Window Management** | Intelligent summarization when conversation too long | High | New infrastructure | Critical for long customer journeys |
| **Agent Version Control** | Track agent config changes, rollback if needed | Medium | New infrastructure | Team collaboration feature |
| **Cost Tracking Per Agent** | See API costs by agent, customer, conversation | Medium | New infrastructure | n8n doesn't provide token monitoring |
| **Proactive Messaging** | Agent initiates conversations based on triggers | High | Current n8n Proactive Timer | Already working in production via n8n |
| **State Machine Enforcement** | Enforce conversation flows, prevent invalid transitions | High | New infrastructure | More control than pure LLM responses |

### Anti-Features

Things to deliberately NOT build in v2. Common mistakes in agent platforms.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **General-Purpose Chatbot** | WhatsApp 2026 policy bans general-purpose bots | Build purpose-specific agents (Sales, Support, Logistics) with clear service scope |
| **Unlimited Context Stuffing** | Causes errors, exploding costs | Implement sliding window + summarization |
| **Agent-Only (No Human Path)** | Kills customer trust | Always provide easy human escalation |
| **Real-Time Learning from Conversations** | Compliance nightmare, unpredictable behavior | Train offline, deploy frozen versions |
| **Hidden Agent Actions** | Users don't trust what they can't see | Full audit trail, observable execution |
| **Complex Visual Programming** | n8n's UI "becomes painfully slow" with complexity | Keep visual simple, push complexity to code |
| **Unlimited Tool Access** | Security risk, unexpected costs | Explicit tool permissions per agent |
| **Auto-Approval for Destructive Actions** | Customer-facing mistakes | Require human approval for deletes, large orders |
| **Synchronous Everything** | WhatsApp expects instant responses | Queue-based async architecture |
| **Over-Engineering Memory** | Premature optimization | Start with PostgreSQL, add Redis only when profiled |

## Agent Audit Scope

What to document from existing n8n agents before migration.

### Sales Agents (Agentes de Venta)

| Agent | What to Document | Priority |
|-------|------------------|----------|
| **Historial v3** | How it retrieves/formats customer history | High |
| **State Analyzer** | State machine logic, transition rules | Critical |
| **Data Extractor** | What data it extracts, how it structures it | High |
| **Carolina v3** | Personality prompt, response patterns, escalation triggers | Critical |
| **Order Manager** | Order creation workflow, validation rules | High |
| **Proactive Timer** | Trigger conditions, timing logic, message templates | Medium |

### Logistics Robots (Robots Logistica)

| Agent | What to Document | Priority |
|-------|------------------|----------|
| **robot-coordinadora** | Coordination logic, routing rules | Medium |
| **robot-inter-envia** | Inter-company communication patterns | Medium |
| **ocr-guias-bot** | OCR integration, document parsing rules | Low (can defer) |

### Audit Deliverables

For each agent, document:

1. **Trigger Conditions** - What starts this agent?
2. **Input Sources** - What data does it need?
3. **Decision Logic** - How does it decide what to do?
4. **Tools Used** - What actions can it take?
5. **Output Format** - How does it respond?
6. **State Transitions** - What states exist, how to transition?
7. **Failure Modes** - What happens when it fails?
8. **Human Handoff Criteria** - When does it escalate?

## Visual Canvas Features

Expected capabilities for the agent builder visualization.

### Core Canvas Features (Table Stakes)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Node-Based Workflow** | Drag-and-drop nodes representing agent steps | High |
| **Connection Lines** | Visual flows between nodes | Medium |
| **Node Configuration Panel** | Click node to edit settings | Medium |
| **Zoom/Pan** | Navigate large workflows | Low |
| **Undo/Redo** | Recover from mistakes | Medium |
| **Save/Load** | Persist workflows to database | Low |
| **Preview/Test Mode** | Dry-run workflow without real messages | High |

### Canvas Differentiators

| Feature | Why Different | Complexity |
|---------|---------------|------------|
| **Code Node** | Write custom TypeScript/JavaScript in visual flow | High |
| **Action DSL Integration** | Nodes map directly to MorfX tools | Medium |
| **Live Conversation Preview** | See how agent would respond to test message | High |
| **Conditional Branching UI** | Visual if/else with expression editor | High |
| **Variable Inspector** | See all variables in current execution context | Medium |
| **Execution Replay** | Replay past conversation through workflow | Very High |
| **Collaborative Editing** | Multiple users edit same workflow | Very High |

### Canvas Technology Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **React Flow** | Most popular, well-documented, used by n8n | Bundle size, learning curve | Recommended - battle-tested |
| **XYFlow** | Same as React Flow (renamed) | - | Same recommendation |
| **Xylem** | Lightweight | Less ecosystem | Only if React Flow too heavy |
| **Custom Canvas** | Full control | Massive effort | Not recommended |

## Feature Dependencies

```
Existing MorfX Features (already built):
  - Action DSL (Phase 3) --> Agent Tool Calling
  - WhatsApp Messaging (Phase 7-8) --> Agent Conversations
  - Contacts/CRM (Phase 4-5) --> Agent Context
  - Teams/Assignment (Phase 8) --> Human Handoff
  - Templates (Phase 8) --> Fallback Responses
  - Tool Execution Logs (Phase 3) --> Agent Observability

New Agent Features:
  Claude API Integration
       |
       v
  Agent Engine (conversation loop)
       |
       +---> Memory Management
       |
       +---> State Machine
       |
       v
  Visual Canvas (optional, later)
       |
       v
  Multi-Agent Orchestration (advanced)
```

## MVP Recommendation

For MVP agent milestone, prioritize:

### Phase 1: Core Agent Engine
1. Claude API integration with tool calling
2. Single-agent conversation loop
3. Human handoff trigger (explicit + automatic)
4. Conversation context (current session only)
5. Integration with existing Action DSL tools

### Phase 2: Memory & State
1. Persistent memory (link to contact record)
2. Basic state machine (configurable states)
3. Context window management (summarization)

### Phase 3: Observability
1. Agent execution dashboard
2. Cost tracking
3. Conversation replay

### Defer to Post-MVP
- Visual canvas (high complexity, code-first is faster to ship)
- Multi-agent orchestration (wait for single-agent to stabilize)
- Collaborative editing (team features after core works)
- Real-time learning (compliance concerns)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table Stakes | HIGH | Well-established patterns across platforms |
| Differentiators | HIGH | Clear gaps in n8n/LangChain based on user complaints |
| Anti-Features | HIGH | WhatsApp 2026 policy is explicit, community mistakes documented |
| Audit Scope | MEDIUM | Depends on access to actual n8n workflows |
| Visual Canvas | MEDIUM | Technology clear, scope uncertain |

## Sources

### High Confidence
- [WhatsApp's 2026 AI Policy Explained](https://learn.turn.io/l/en/article/khmn56xu3a-whats-app-s-2026-ai-policy-explained) - Official policy on AI agents
- [Not All Chatbots Are Banned: WhatsApp's 2026 AI Policy](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban) - Policy clarification
- [n8n AI Agent Limitations](https://community.n8n.io/t/when-n8n-is-not-the-right-choice-for-ai-automation/187135) - Community frustrations
- [Why I decided against n8n AI Agent node](https://community.latenode.com/t/why-i-decided-against-using-the-ai-agent-node-in-n8n/23415) - Real user problems
- [LangGraph vs n8n Comparison](https://www.zenml.io/blog/langgraph-vs-n8n) - Feature comparison
- [Claude API Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) - Official documentation
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) - Official SDK docs

### Medium Confidence
- [State Management Patterns for AI Agents](https://dev.to/inboryn_99399f96579fcd705/state-management-patterns-for-long-running-ai-agents-redis-vs-statefulsets-vs-external-databases-39c5) - Architecture patterns
- [Context Window Management](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) - Technical strategies
- [Top 5 AI Agent Observability Platforms](https://o-mega.ai/articles/top-5-ai-agent-observability-platforms-the-ultimate-2026-guide) - Observability features
- [Chatbot to Human Handoff Guide](https://www.spurnow.com/en/blogs/chatbot-to-human-handoff) - Best practices

### Existing MorfX Documentation
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/phases/03-action-dsl-core/03-RESEARCH.md` - Action DSL design
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/tools/registry.ts` - Tool registry implementation
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/tools/types.ts` - Tool type definitions
