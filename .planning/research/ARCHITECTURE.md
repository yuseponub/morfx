# Agent Architecture for MorfX

**Domain:** Conversational AI Agents for CRM + WhatsApp Platform
**Researched:** 2026-02-04
**Overall Confidence:** MEDIUM-HIGH

## Executive Summary

MorfX v2 will add conversational agents that respond to WhatsApp messages, execute CRM actions via the existing Action DSL, and visualize agent behavior in a React Flow canvas. The architecture leverages existing infrastructure (Supabase Realtime, tool registry, webhook handler) while adding an agent execution layer with Claude API integration.

Key architectural decision: **Hybrid execution** with lightweight orchestration in Next.js API routes for low-latency responses, plus Supabase Edge Functions for complex multi-step agent operations. This avoids the need for external background workers while staying within Vercel's timeout limits.

---

## Execution Layer

### Where Agents Run and Why

| Scenario | Execution Environment | Rationale |
|----------|----------------------|-----------|
| WhatsApp incoming message | Next.js API Route (webhook) | Low latency needed, return 200 immediately, async process |
| Simple agent response (1-2 tool calls) | Next.js API Route | Most responses complete in <10s, within Vercel limits |
| Complex multi-step operations | Supabase Edge Functions | 150s timeout, can handle longer reasoning chains |
| Agent sandbox testing | Next.js API Route + SSE streaming | Interactive UI needs streaming responses |
| Scheduled/proactive agents | Supabase Edge Functions + pg_cron | No external worker needed for periodic tasks |

### Claude Agent SDK Integration

Based on [Claude Agent SDK documentation](https://platform.claude.com/docs/en/agent-sdk/overview), the recommended pattern is:

```typescript
// src/lib/agent/engine.ts
import { query, ClaudeAgentOptions } from "@anthropic-ai/claude-agent-sdk";

export async function* runAgent(
  prompt: string,
  workspaceId: string,
  sessionId: string,
  allowedTools: string[]
) {
  for await (const message of query({
    prompt,
    options: {
      allowedTools,
      // Custom MCP servers for MorfX tools
      mcpServers: {
        morfx: {
          command: "npx",
          args: ["@morfx/mcp-server", "--workspace", workspaceId]
        }
      },
      // Resume from session if continuing conversation
      resume: sessionId || undefined
    }
  })) {
    yield message;
  }
}
```

**Key insight from Claude Agent SDK:** The SDK handles the agentic loop automatically. We provide tools via MCP protocol, and Claude decides which to use. This eliminates the need to build custom tool-use logic.

### MCP Server for MorfX Tools

Create an MCP server that exposes existing Action DSL tools to Claude:

```typescript
// packages/mcp-server/src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server";
import { toolRegistry } from "@morfx/core";

const server = new Server({
  name: "morfx-tools",
  version: "1.0.0"
});

// Expose all registered tools as MCP tools
server.setRequestHandler("tools/list", async () => ({
  tools: toolRegistry.listTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}));

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  const result = await executeToolFromAgent(name, args, workspaceId, sessionId);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
```

### Webhook Handler Integration

The existing WhatsApp webhook handler at `src/lib/whatsapp/webhook-handler.ts` will be extended:

```
Incoming Message
      |
      v
processWebhook() (existing)
      |
      v
Insert message to DB (existing)
      |
      v
[NEW] Check agent config for conversation
      |
      +--> No agent: End
      |
      +--> Agent enabled:
            |
            v
      Create/resume agent session
            |
            v
      Run agent with message as input
            |
            v
      Stream response + tool calls
            |
            v
      Send WhatsApp replies
```

---

## Data Model

### New Tables for Agents

```sql
-- Agent definitions (the "what" an agent does)
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,

  -- Configuration
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,

  -- Tool permissions (which tools can this agent use)
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',

  -- Activation rules
  is_active BOOLEAN NOT NULL DEFAULT true,
  activation_rules JSONB DEFAULT '{}', -- When to activate (keywords, time, etc.)

  -- Canvas layout (React Flow state)
  canvas_state JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workspace_id, slug)
);

-- Agent sessions (conversation context with an agent)
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- Session state
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),

  -- Claude session (for resumption)
  claude_session_id TEXT,

  -- Context (accumulated during session)
  context JSONB DEFAULT '{}',

  -- Handoff tracking
  handed_off_at TIMESTAMPTZ,
  handed_off_to UUID REFERENCES auth.users(id),
  handoff_reason TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Agent turns (each exchange in a session)
CREATE TABLE agent_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Turn content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'tool_call', 'tool_result', 'thinking')),

  -- Tool execution (if role = 'tool')
  tool_name TEXT,
  tool_input JSONB,
  tool_output JSONB,
  tool_execution_id UUID REFERENCES tool_executions(id),

  -- Metadata
  tokens_used INTEGER,
  duration_ms INTEGER,

  -- For streaming reconstruction
  sequence_number INTEGER NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agents_workspace ON agents(workspace_id);
CREATE INDEX idx_agent_sessions_conversation ON agent_sessions(conversation_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(workspace_id, status);
CREATE INDEX idx_agent_turns_session ON agent_turns(session_id, sequence_number);

-- RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;

-- Policies (workspace isolation)
CREATE POLICY "agents_workspace_isolation" ON agents
  USING (is_workspace_member(workspace_id));

CREATE POLICY "agent_sessions_workspace_isolation" ON agent_sessions
  USING (is_workspace_member(workspace_id));

CREATE POLICY "agent_turns_workspace_isolation" ON agent_turns
  USING (is_workspace_member(workspace_id));

-- Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_turns;
```

### Relationship to Existing Tables

```
workspaces
    |
    +-- agents (NEW)
    |       |
    |       +-- agent_sessions (NEW)
    |               |
    |               +-- agent_turns (NEW)
    |               |       |
    |               |       +-- tool_executions (EXISTING)
    |               |
    |               +-- conversations (EXISTING)
    |                       |
    |                       +-- messages (EXISTING)
    |
    +-- tool_executions (EXISTING, add agent_session_id FK)
```

**Migration for existing tool_executions:**
```sql
ALTER TABLE tool_executions
ADD COLUMN agent_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_tool_executions_agent_session
ON tool_executions(agent_session_id)
WHERE agent_session_id IS NOT NULL;
```

---

## Visual Canvas Architecture

### Technology Choice: React Flow

Based on [React Flow documentation](https://reactflow.dev), this library is optimal for:
- Node-based UI with drag/drop
- Real-time updates (state changes reflect immediately)
- Performance with 100s of nodes via viewport virtualization
- Rich ecosystem (MiniMap, Controls, Background plugins)

### Canvas Data Model

```typescript
// Canvas state stored in agents.canvas_state
interface AgentCanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
}

interface CanvasNode {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'response' | 'handoff' | 'end';
  position: { x: number; y: number };
  data: {
    label: string;
    config: TriggerConfig | ConditionConfig | ActionConfig | ResponseConfig | HandoffConfig;
  };
}

// Node type configurations
interface TriggerConfig {
  type: 'message' | 'keyword' | 'schedule' | 'manual';
  keywords?: string[];
  schedule?: string; // cron
}

interface ConditionConfig {
  type: 'intent' | 'entity' | 'context' | 'custom';
  expression: string; // LLM evaluates this
}

interface ActionConfig {
  toolName: string; // e.g., 'crm.contact.create'
  inputMapping: Record<string, string>; // Map from context to tool inputs
  storeResultAs?: string; // Variable name in context
}

interface ResponseConfig {
  type: 'text' | 'template';
  content?: string; // Static or with {{variables}}
  templateId?: string; // WhatsApp template
}

interface HandoffConfig {
  reason: 'escalation' | 'completion' | 'user_request';
  assignTo?: 'team' | 'specific_user';
  teamId?: string;
  userId?: string;
}
```

### Canvas-to-Agent Execution

The canvas defines the agent's behavior visually. At runtime, we compile this into a system prompt:

```typescript
// src/lib/agent/canvas-compiler.ts
export function compileCanvasToPrompt(canvas: AgentCanvasState): string {
  const sections: string[] = [];

  // Extract triggers
  const triggers = canvas.nodes.filter(n => n.type === 'trigger');
  sections.push(`## Activation
You respond when: ${triggers.map(t => describeTrigger(t.data.config)).join(' OR ')}`);

  // Extract flow logic
  sections.push(`## Decision Flow
${describeFlow(canvas)}`);

  // Extract available tools
  const actions = canvas.nodes.filter(n => n.type === 'action');
  sections.push(`## Available Tools
${actions.map(a => `- ${a.data.config.toolName}: Use when ${a.data.label}`).join('\n')}`);

  // Extract response templates
  const responses = canvas.nodes.filter(n => n.type === 'response');
  sections.push(`## Response Guidelines
${responses.map(r => describeResponse(r.data.config)).join('\n')}`);

  return sections.join('\n\n');
}
```

### Canvas UI Components

```
/src/app/(dashboard)/agentes/
  |-- page.tsx                    # Agent list
  |-- [id]/
  |     |-- page.tsx              # Agent detail + canvas editor
  |     |-- components/
  |           |-- agent-canvas.tsx       # React Flow wrapper
  |           |-- nodes/
  |           |     |-- trigger-node.tsx
  |           |     |-- condition-node.tsx
  |           |     |-- action-node.tsx
  |           |     |-- response-node.tsx
  |           |     |-- handoff-node.tsx
  |           |-- panels/
  |           |     |-- node-config-panel.tsx  # Right sidebar for config
  |           |     |-- execution-panel.tsx    # Live execution trace
  |           |-- toolbar.tsx
  |
  |-- nuevo/
        |-- page.tsx              # New agent wizard
```

---

## Real-time Flow

### How to Show Agent Thinking/Execution in UI

The Claude Agent SDK supports [streaming output](https://platform.claude.com/docs/en/agent-sdk/streaming-output). We leverage this with Server-Sent Events (SSE):

```typescript
// src/app/api/agent/stream/route.ts
export async function POST(req: Request) {
  const { prompt, sessionId, workspaceId } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const message of runAgent(prompt, workspaceId, sessionId)) {
        // Message types from Claude Agent SDK
        const event = categorizeMessage(message);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

        // Persist turn to database for history
        await persistAgentTurn(sessionId, message);
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

function categorizeMessage(message: any) {
  if (message.type === 'assistant' && message.content) {
    return { type: 'thinking', content: extractThinking(message) };
  }
  if (message.type === 'tool_use') {
    return { type: 'tool_call', tool: message.name, input: message.input };
  }
  if (message.type === 'tool_result') {
    return { type: 'tool_result', tool: message.tool_use_id, output: message.content };
  }
  if (message.result) {
    return { type: 'response', content: message.result };
  }
  return { type: 'unknown', raw: message };
}
```

### React Client for Streaming

```typescript
// src/hooks/use-agent-stream.ts
import { useCallback, useState } from 'react';

export function useAgentStream() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'complete'>('idle');

  const runAgent = useCallback(async (prompt: string, sessionId: string) => {
    setStatus('running');
    setEvents([]);

    const response = await fetch('/api/agent/stream', {
      method: 'POST',
      body: JSON.stringify({ prompt, sessionId })
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const event = JSON.parse(line.slice(6));
          setEvents(prev => [...prev, event]);
        }
      }
    }

    setStatus('complete');
  }, []);

  return { events, status, runAgent };
}
```

### Supabase Realtime for Multi-client Sync

For showing agent activity across multiple browser tabs or users:

```typescript
// Listen to agent_turns for live updates
supabase
  .channel('agent-activity')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'agent_turns' },
    (payload) => {
      // Update UI with new turn
      addTurn(payload.new);
    }
  )
  .subscribe();
```

---

## Integration with Existing Components

### Action DSL Integration

The existing tool system at `src/lib/tools/` already has:
- **Registry** (`registry.ts`): 16+ tools registered
- **Executor** (`executor.ts`): Permission checking, logging, dry-run support
- **Handlers** (`handlers/`): Placeholder implementations

**Changes needed for agent integration:**

1. **Add `executeToolFromAgent` wrapper** (already exists in executor.ts):
```typescript
// Already implemented! Just needs to be used
export async function executeToolFromAgent<TOutput = unknown>(
  toolName: string,
  inputs: unknown,
  workspaceId: string,
  sessionId: string,
  dryRun = false
): Promise<ToolExecutionResult<TOutput>>
```

2. **Implement real handlers** (Phase 14-15 scope):
Replace placeholder handlers in `handlers/crm/index.ts` and `handlers/whatsapp/index.ts` with real implementations.

3. **Add agent_session_id to execution context**:
```typescript
// Extend ExecutionContext
interface ExecutionContext {
  // ... existing fields
  agentSessionId?: string; // NEW: Link executions to agent session
}
```

### WhatsApp Integration

The existing webhook handler at `src/lib/whatsapp/webhook-handler.ts` processes incoming messages. Integration point:

```typescript
// src/lib/whatsapp/webhook-handler.ts (modified)
async function processIncomingMessage(...) {
  // ... existing message processing ...

  // NEW: Check if agent should respond
  const agentConfig = await getAgentForConversation(conversationId, workspaceId);

  if (agentConfig && agentConfig.is_active) {
    // Queue agent processing (don't block webhook response)
    queueAgentProcessing({
      conversationId,
      messageId: msg.id,
      agentId: agentConfig.id,
      workspaceId
    });
  }
}
```

### CRM Integration

Agents interact with CRM via Action DSL tools:
- `crm.contact.create` / `crm.contact.update` / `crm.contact.read`
- `crm.tag.add` / `crm.tag.remove`
- `crm.order.create` / `crm.order.updateStatus`

No additional CRM integration needed beyond implementing real handlers.

---

## Build Order Recommendation

### Dependency Graph

```
Phase 12: n8n Audit (no code changes)
    |
    v
Phase 13: Visual Canvas (React Flow)
    |
    +--> agents table schema
    +--> Canvas UI components
    +--> Canvas state persistence
    |
    v
Phase 14-15: Real Action DSL Handlers
    |
    +--> CRM handlers
    +--> WhatsApp handlers
    +--> Tests
    |
    v
Phase 16: Claude Agent Engine
    |
    +--> agent_sessions, agent_turns tables
    +--> Claude Agent SDK integration
    +--> MCP server for MorfX tools
    +--> Streaming API
    |
    v
Phase 17: Agent Sandbox
    |
    +--> /sandbox UI
    +--> Mock conversation flow
    +--> Tool execution visualization
    |
    v
Phase 18: WhatsApp Agent Integration
    |
    +--> Webhook handler modification
    +--> Handoff logic
    +--> Activation rules
```

### Phase-by-Phase Rationale

| Phase | Why This Order |
|-------|----------------|
| 12 (n8n Audit) | Information gathering, no dependencies |
| 13 (Canvas) | UI can be built without working agents; provides visualization for later phases |
| 14-15 (Real Handlers) | Required for agents to do anything useful |
| 16 (Agent Engine) | Core agent logic; needs real handlers |
| 17 (Sandbox) | Testing environment; needs working engine |
| 18 (WhatsApp) | Production integration; needs tested sandbox |

### Critical Path

Canvas (13) --> Real Handlers (14-15) --> Agent Engine (16) --> Sandbox (17) --> WhatsApp (18)

Phases 12 (n8n Audit) and 13 (Canvas) can run in parallel with early Phase 14 handler work.

---

## Architecture Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude API rate limits | Degraded service during high traffic | Implement queue with retry, per-workspace rate limiting |
| Long-running agent operations timeout | Incomplete responses | Use Supabase Edge Functions (150s) for complex operations |
| Canvas state becomes inconsistent | Broken agent behavior | Validate canvas on save, version history |
| Agent loops (calls same tool repeatedly) | Resource exhaustion | Max tool calls per session, circuit breaker |
| Handoff fails silently | Customer abandoned | Notification system, fallback rules |

---

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) - HIGH confidence
- [Claude Agent SDK Streaming](https://platform.claude.com/docs/en/agent-sdk/streaming-output) - HIGH confidence
- [React Flow Documentation](https://reactflow.dev) - HIGH confidence
- [NPC Architecture for AI Workflows](https://dev.to/araldhafeeri/npc-architecture-scaling-ai-workflows-in-serverless-nextjs-3cgh) - MEDIUM confidence
- [LangGraph + Next.js Template](https://github.com/agentailor/fullstack-langgraph-nextjs-agent) - MEDIUM confidence
- [Supabase Realtime Features](https://supabase.com/features/ai-assistant) - HIGH confidence
- [AI Agent Architecture Guide](https://www.lindy.ai/blog/ai-agent-architecture) - MEDIUM confidence
