# Domain Pitfalls: Conversational Agents for MorfX CRM+WhatsApp

**Domain:** Adding AI agents with visual canvas to existing CRM+WhatsApp platform
**Researched:** 2026-02-04
**Confidence:** HIGH (verified with official Claude API docs and multiple credible sources)

---

## Critical Pitfalls

Mistakes that cause rewrites, production failures, or significant rework.

---

### Pitfall 1: Context Window Exhaustion in Long Conversations

**What goes wrong:** WhatsApp conversations can span days or weeks. Without context management, the agent accumulates tokens until it hits the 200K limit, then either errors out or loses critical customer context mid-conversation.

**Why it happens:**
- Claude's context window is finite (200K standard, up to 1M for enterprise)
- Every message, tool call, and tool result accumulates in context
- WhatsApp conversations don't have natural "session" boundaries like web chat
- Extended thinking tokens from previous turns automatically stripped, but conversation history is not

**Consequences:**
- Agent suddenly "forgets" customer name, order details, or previous agreement
- Validation errors when prompt + expected output exceeds context window
- Unexpected cost spikes when crossing 200K threshold ($3 -> $6 per MTok)

**Prevention:**
1. Implement conversation summarization before approaching 150K tokens
2. Use the Memory Tool to persist critical facts outside context window
3. Store structured customer data in Supabase, inject only what's needed per turn
4. Track token usage per conversation with token counting API before sending
5. Design "conversation checkpoints" that summarize and reset context

**Detection (warning signs):**
- Token count approaching 150K in a single conversation
- Agent repeating questions it already asked
- Sudden 2x cost increase on individual conversations
- `validation_error` responses from API

**Phase to address:** Phase 1 (Agent Core) - Build context management from day one

**Sources:**
- [Context Windows - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [Managing context on the Claude Developer Platform](https://claude.com/blog/context-management)

---

### Pitfall 2: Running n8n and Code Agents in Parallel Without Clear Boundaries

**What goes wrong:** During migration, both n8n agents and new code agents respond to the same WhatsApp messages, creating duplicate responses, conflicting actions, or race conditions.

**Why it happens:**
- "Gradual migration" without clear routing rules
- Shared webhook endpoints receiving all WhatsApp messages
- No clear handoff protocol between systems
- Testing new agents on production WhatsApp numbers

**Consequences:**
- Customer receives duplicate/conflicting responses
- Order created twice, appointment booked twice
- Customer confusion erodes trust in the system
- Data inconsistency between n8n and Supabase

**Prevention:**
1. Route by intent/keyword BEFORE reaching any agent system
2. Use conversation metadata to mark "owned by n8n" vs "owned by code agent"
3. Never test new agents on production WhatsApp numbers
4. Implement a "traffic controller" that ensures exactly one system handles each conversation
5. Define explicit migration phases: n8n-only -> pilot conversations -> gradual rollout -> full migration

**Detection (warning signs):**
- Customer complaints about "talking to two different people"
- Duplicate webhook logs
- Same conversation_id appearing in both n8n and new system logs
- Race condition errors in database

**Phase to address:** Phase 1 (Agent Core) - Routing architecture must be designed first

---

### Pitfall 3: Tool Calling Failures Cascading into Dead Conversations

**What goes wrong:** Agent calls a tool (check inventory, book appointment, send email), the tool fails, and the agent either loops indefinitely, gives up silently, or tells the customer something incorrect.

**Why it happens:**
- LLMs don't inherently understand transient vs permanent failures
- No retry logic implemented for tool execution
- No circuit breaker for repeatedly failing tools
- Agent trained to "be helpful" may fabricate a response rather than admit failure

**Consequences:**
- Agent tells customer "your order is confirmed" when API actually failed
- Infinite retry loops consuming tokens
- Customer waiting for callback that was never scheduled
- Trust destroyed when fabricated information is discovered

**Prevention:**
1. Wrap ALL tool calls with structured retry logic (exponential backoff)
2. Implement circuit breaker: after 3 failures, mark tool as "unavailable"
3. Define explicit failure responses: "I couldn't complete that action, let me connect you with a human"
4. Validate tool outputs before incorporating into response
5. Log every tool call with success/failure for observability
6. Design tools to return structured errors, not just throw exceptions

**Detection (warning signs):**
- High token consumption on conversations with tool calls
- Gap between "tool called" and "response sent" logs
- Customer complaints about promised actions not happening
- Tool error rates >5%

**Phase to address:** Phase 2 (Tool System) - Build robust tool framework with error handling

**Sources:**
- [Tool Calling Explained: The Core of AI Agents (2026 Guide)](https://composio.dev/blog/ai-agent-tool-calling-guide)
- [Error Recovery and Fallback Strategies in AI Agent Development](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development)

---

### Pitfall 4: Human Handoff That Loses Context ("Amnesia Problem")

**What goes wrong:** Customer spends 10 minutes explaining their problem to the agent. Agent determines handoff is needed. Human agent receives the conversation with no context, forcing customer to repeat everything.

**Why it happens:**
- Handoff implemented as "route to human queue" without context transfer
- Agent's internal understanding not persisted in transferable format
- Human agent tools don't display AI conversation history
- Summarization not performed before handoff

**Consequences:**
- Customer frustration ("I already explained this!")
- Longer human resolution time
- Customer perceives AI as useless
- Human agents develop distrust of AI system

**Prevention:**
1. ALWAYS generate a structured handoff summary before transfer
2. Include: customer intent, attempted solutions, customer sentiment, key details
3. Display AI conversation history prominently in human agent interface
4. Allow human agent to "ask the AI" for context about the conversation
5. Log handoff reasons to improve agent training

**Detection (warning signs):**
- Human agents asking customers to "start from the beginning"
- Low customer satisfaction scores on escalated conversations
- Human agents bypassing AI context summary
- Handoff-to-resolution time same as non-AI conversations

**Phase to address:** Phase 3 (WhatsApp Integration) - Design handoff protocol with human agents in mind

**Sources:**
- [Escalation Design: Why AI Fails at the Handoff](https://www.bucher-suter.com/escalation-design-why-ai-fails-at-the-handoff-not-the-automation/)
- [AI Chatbot with Human Handoff: Guide (2026)](https://www.socialintents.com/blog/ai-chatbot-with-human-handoff/)

---

### Pitfall 5: Cost Explosion from Agentic Loops

**What goes wrong:** Agent enters a loop (tool fails, retries, fails again, or recursive self-correction), consuming thousands of tokens in minutes. Single conversation costs $50+ instead of $0.50.

**Why it happens:**
- No token budget per conversation
- No maximum turns per conversation
- Agent "tries harder" when it fails, compounding the problem
- Extended thinking enabled without limits
- Tool that returns large payloads (entire database tables, large files)

**Consequences:**
- API bill 10x-100x expected
- Single malicious user can drain monthly budget
- Development team unaware until invoice arrives
- Context window exhausted, forcing expensive context management

**Prevention:**
1. Set hard token budget per conversation (e.g., 50K tokens max)
2. Limit maximum turns per conversation (e.g., 20 turns)
3. Monitor token usage in real-time with alerts at 50%, 75%, 90%
4. Implement cost caps at organization level in Anthropic console
5. Design tools to return summaries, not raw data
6. Use streaming to detect runaway responses early
7. Set `budget_tokens` for extended thinking

**Detection (warning signs):**
- Single conversation exceeding 10K tokens
- Turn count >10 in single session
- Tool returning >5K tokens
- Conversation duration >30 minutes with AI

**Phase to address:** Phase 1 (Agent Core) - Budget enforcement from day one

**Sources:**
- [Claude API Quota Tiers and Limits Explained](https://www.aifreeapi.com/en/posts/claude-api-quota-tiers-limits)
- [Claude Code: Rate limits, pricing, and alternatives](https://northflank.com/blog/claude-rate-limits-claude-code-pricing-cost)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

---

### Pitfall 6: Over-Engineering the Visual Canvas

**What goes wrong:** Building a full n8n clone with every feature imaginable, delaying MVP by months while chasing feature parity with tools that have 5+ years of development.

**Why it happens:**
- "We need feature parity with n8n" mindset
- Infinite canvas, zoom, minimap, undo/redo, keyboard shortcuts all seem essential
- Engineers love building complex UIs
- No clear definition of "minimum viable canvas"

**Consequences:**
- MVP delayed by 3-6 months
- Complex codebase before core agent logic is proven
- Performance issues from premature optimization
- User testing reveals different priorities than assumed

**Prevention:**
1. Define MVP canvas: nodes + edges + basic drag/drop. Period.
2. Use React Flow (proven, performant) instead of building from scratch
3. Ship canvas v1 before adding: minimap, undo/redo, keyboard shortcuts
4. User test with static mock before building interactivity
5. Remember goal: MORE CONTROL than n8n, not "prettier n8n"

**Detection (warning signs):**
- Canvas development exceeding 2 weeks without usable agent
- Discussion of "nice to have" canvas features before core works
- Performance optimization before 10+ nodes tested
- Comparing to Figma/Miro instead of solving agent problem

**Phase to address:** Phase 4 (Visual Canvas) - Define strict MVP scope

**Sources:**
- [React Flow - Node-Based UIs in React](https://reactflow.dev)
- [The 2026 Guide to AI Agent Builders](https://composio.dev/blog/best-ai-agent-builders-and-integrations)

---

### Pitfall 7: Prompt Caching Implementation Failures

**What goes wrong:** Team implements prompt caching expecting 90% cost savings, but cache hit rate is <10% due to incorrect implementation.

**Why it happens:**
- Cache breakpoints placed incorrectly
- Conversation content varies slightly each turn, busting cache
- Minimum token threshold (1024 for Sonnet, 2048 for Haiku) not met
- TTL misunderstood (5 min default, must be accessed to stay alive)
- Workspace isolation (Feb 2026) not understood

**Consequences:**
- No cost savings, but added complexity
- False confidence in cost projections
- "Cache write" charges without corresponding "cache read" benefits

**Prevention:**
1. Cache system prompt + tool definitions (rarely change)
2. Place cache_control after static content, before dynamic content
3. Verify minimum token threshold is met
4. For multi-turn, cache up to second-to-last turn
5. Monitor cache_creation_input_tokens vs cache_read_input_tokens
6. Use 1-hour TTL for system prompts, 5-min for conversation history

**Detection (warning signs):**
- cache_read_input_tokens consistently 0
- cache_creation_input_tokens on every request
- Cost not decreasing despite "implementing caching"
- TTL expiring between customer messages (>5 min gaps)

**Phase to address:** Phase 1 (Agent Core) - Implement caching correctly from start

**Sources:**
- [Prompt caching - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [How to Use Prompt Caching in Claude API: Complete 2026 Guide](https://www.aifreeapi.com/en/posts/claude-api-prompt-caching-guide)

---

### Pitfall 8: Structured Output Schema Complexity

**What goes wrong:** Define complex nested schemas for tool outputs, then hit "schema too complex" errors or get inconsistent outputs that break downstream code.

**Why it happens:**
- JSON Schema features not fully supported (recursive schemas forbidden)
- Numerical constraints (min/max) not enforced at generation time
- Schema complexity has undocumented limits
- Mixing strict tools with non-strict tools in same request

**Consequences:**
- 400 errors in production
- Type mismatches despite strict mode (edge cases)
- Post-processing code fails on edge cases
- Non-deterministic output wrapping (known bug)

**Prevention:**
1. Keep schemas flat - no deeply nested objects (max 2-3 levels)
2. No recursive schemas - flatten or limit nesting
3. Use additionalProperties: false for strict validation
4. Add post-response validation for numerical constraints
5. Test schema with edge cases before production
6. Monitor stop_reason for truncations and refusals

**Detection (warning signs):**
- Intermittent 400 errors with schema messages
- Type mismatches in runtime despite strict mode
- `stop_reason: "max_tokens"` truncating structured output
- Output wrapped in unexpected `{"output": {...}}` structure

**Phase to address:** Phase 2 (Tool System) - Define simple, tested schemas

**Sources:**
- [Structured outputs - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Tool use with Claude - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)

---

### Pitfall 9: WhatsApp Rate Limits and Webhook Reliability

**What goes wrong:** Marketing campaign sends 10K users to WhatsApp. Webhook receives burst traffic. Agent system overwhelmed. Messages lost or delayed.

**Why it happens:**
- WhatsApp webhook delivers messages as they arrive, no rate limiting
- Agent system designed for steady traffic, not bursts
- No queue between webhook and agent processing
- WhatsApp has its own rate limits that can throttle responses

**Consequences:**
- Dropped messages during peak times
- Customers waiting minutes for agent response
- WhatsApp marking webhook as unhealthy
- Rate limit errors when sending responses

**Prevention:**
1. Queue ALL incoming messages (Redis/Bull) before agent processing
2. Process queue at controlled rate regardless of incoming burst
3. Return 200 to webhook immediately, process async
4. Implement backpressure: if queue depth >100, respond with "we're busy"
5. Monitor WhatsApp API rate limits, implement sending queue

**Detection (warning signs):**
- Webhook response times >3 seconds
- Message processing delays during marketing campaigns
- WhatsApp 429 errors on outgoing messages
- Gap between webhook received and agent response

**Phase to address:** Phase 3 (WhatsApp Integration) - Design queue-based architecture

---

### Pitfall 10: Agent State Not Surviving Process Restarts

**What goes wrong:** Server restarts (deployment, crash, scaling). In-memory conversation state lost. Customer returns to conversation, agent has no memory of previous exchange.

**Why it happens:**
- Conversation state stored in memory (fast but volatile)
- Assumption that conversations complete in single server lifetime
- WhatsApp conversations can span days
- No persistence strategy defined

**Consequences:**
- Customer frustration ("I already told you this")
- Agent asking for order number again
- Inconsistent behavior between restarts
- Data loss during deployments

**Prevention:**
1. Persist conversation state to Supabase after every turn
2. Load state on first message of "continued" conversation
3. Design state schema: messages[], context{}, metadata{}
4. Implement state versioning for schema migrations
5. Test: restart server mid-conversation, verify recovery

**Detection (warning signs):**
- Agent treating returning customers as new
- Post-deployment customer complaints
- Inconsistent agent behavior across server instances
- Missing conversation history after restarts

**Phase to address:** Phase 1 (Agent Core) - State persistence is foundational

---

## Minor Pitfalls

Mistakes that cause annoyance but are recoverable.

---

### Pitfall 11: Tool Naming Confusion

**What goes wrong:** Agent selects wrong tool because names are similar (send-notification-user vs send-notification-channel, get-order vs get-orders).

**Why it happens:**
- Tools named from developer perspective, not semantic distinction
- Too many similar tools without clear differentiation
- Descriptions don't clarify when to use each

**Prevention:**
1. Use clear, distinct tool names (notification_to_customer vs broadcast_to_channel)
2. Write descriptions that start with "Use when..."
3. Include negative cases: "Do NOT use for bulk notifications"
4. Test tool selection with ambiguous prompts
5. Limit total tools to <10 per agent

**Detection:** Agent calling wrong tool, tool selection logs showing confusion

**Phase to address:** Phase 2 (Tool System)

---

### Pitfall 12: Canvas Performance with Many Nodes

**What goes wrong:** Agent workflow grows to 50+ nodes. Canvas becomes sluggish. Drag operations lag. Browser memory climbs.

**Why it happens:**
- React re-rendering entire canvas on every change
- No virtualization for off-screen nodes
- Edge calculations expensive with many connections
- Local storage bloated with large workflow JSON

**Prevention:**
1. Use React Flow with built-in virtualization
2. Implement React.memo for node components
3. Debounce canvas state saves
4. Warn users at 30 nodes, hard limit at 50
5. Design agents to be composable (sub-agents) not monolithic

**Detection:** Canvas operations >100ms, browser devtools showing high memory

**Phase to address:** Phase 4 (Visual Canvas)

**Sources:**
- [Flowscape Canvas React - High-performance](https://github.com/Flowscape-UI/canvas-react)
- [dnd-kit performance](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)

---

### Pitfall 13: Ignoring WhatsApp 2026 AI Policy

**What goes wrong:** Build general-purpose "ask me anything" AI assistant on WhatsApp. Meta bans the account for policy violation.

**Why it happens:**
- Policy changed January 2026
- General-purpose AI chatbots (ChatGPT-style) now banned
- Business-specific AI (support, sales, booking) still allowed
- Policy nuance not understood

**Consequences:**
- WhatsApp Business account suspended
- Production system down
- Customer communication disrupted

**Prevention:**
1. Design agents for specific business purposes (support, sales, booking)
2. Keep AI in "supporting role" - routing, FAQ, draft responses
3. Don't advertise as "AI assistant that can answer anything"
4. Review Meta's policy before deploying new agent types

**Detection:** WhatsApp policy warning emails, account review notices

**Phase to address:** Phase 3 (WhatsApp Integration) - Design compliant agent types

**Sources:**
- [Not All Chatbots Are Banned: WhatsApp's 2026 AI Policy Explained](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)
- [WhatsApp's 2026 AI Policy Explained - Turn.io](https://learn.turn.io/l/en/article/khmn56xu3a-whats-app-s-2026-ai-policy-explained)

---

### Pitfall 14: Extended Thinking Without Budget Limits

**What goes wrong:** Enable extended thinking for complex decisions. Agent "thinks" for 30 seconds, consuming 10K+ thinking tokens per response.

**Why it happens:**
- Extended thinking enabled globally instead of selectively
- No budget_tokens limit set
- Used for simple responses that don't need deep reasoning
- Thinking makes responses slower AND more expensive

**Consequences:**
- Response latency >10 seconds
- Cost 5x higher than necessary
- Customer waiting too long for simple answers

**Prevention:**
1. Enable extended thinking only for complex decisions (routing, escalation)
2. Set budget_tokens limit (e.g., 5000)
3. Disable for simple FAQ responses
4. Monitor thinking_tokens per response

**Detection:** High latency on simple queries, elevated token costs

**Phase to address:** Phase 1 (Agent Core)

---

## Phase-Specific Warnings Summary

| Phase | Likely Pitfall | Priority | Mitigation |
|-------|---------------|----------|------------|
| Phase 1: Agent Core | Context exhaustion, Cost explosion, State persistence | CRITICAL | Token budgets, state in Supabase, caching from start |
| Phase 2: Tool System | Tool failures cascading, Schema complexity, Tool naming | HIGH | Retry logic, simple schemas, clear naming |
| Phase 3: WhatsApp | Handoff amnesia, Rate limits, 2026 policy | HIGH | Context transfer, queues, policy compliance |
| Phase 4: Visual Canvas | Over-engineering, Performance | MEDIUM | Strict MVP scope, React Flow |
| Migration | Parallel system conflicts | CRITICAL | Clear routing, traffic controller |

---

## Pre-Implementation Checklist

Before building any agent feature, verify:

- [ ] Token budget defined for conversations
- [ ] State persistence strategy chosen
- [ ] Tool error handling pattern defined
- [ ] Handoff context format specified
- [ ] n8n/code-agent routing rules clear
- [ ] WhatsApp 2026 policy reviewed
- [ ] Cost monitoring in place
- [ ] Canvas MVP scope documented

---

## Sources Summary

### Official Documentation (HIGH confidence)
- [Claude API Context Windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [Claude API Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Claude API Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Claude API Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### Industry Analysis (MEDIUM confidence)
- [Outgrowing Zapier, Make, and n8n for AI Agents](https://composio.dev/blog/outgrowing-make-zapier-n8n-ai-agents)
- [Tool Calling Explained: The Core of AI Agents](https://composio.dev/blog/ai-agent-tool-calling-guide)
- [Escalation Design: Why AI Fails at the Handoff](https://www.bucher-suter.com/escalation-design-why-ai-fails-at-the-handoff-not-the-automation/)
- [WhatsApp 2026 AI Policy Explained](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)
- [15 best practices for deploying AI agents in production - n8n](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/)
