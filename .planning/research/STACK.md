# Technology Stack for MVP v2: Conversational Agents

**Project:** MorfX - Conversational Agents
**Researched:** 2026-02-04
**Confidence:** HIGH (verified with npm/official sources)

## Executive Summary

MVP v2 adds conversational agents to the existing MorfX platform. The recommended stack leverages **Vercel AI SDK 6** as the primary integration layer for Claude, with **@xyflow/react** for the visual canvas. This approach maximizes integration with the existing Next.js 15 stack while avoiding heavy dependencies.

**Key Decision:** Use AI SDK 6 instead of raw `@anthropic-ai/sdk` because:
1. Built-in agent loop management eliminates boilerplate
2. Native streaming support with React hooks (`useChat`, `streamText`)
3. Tool execution approval (human-in-the-loop) built-in
4. DevTools for debugging multi-step agent flows
5. Future-proof: works with multiple providers if needed

---

## Stack Additions for MVP v2

### 1. Claude API Integration

#### Primary: Vercel AI SDK 6 + Anthropic Provider

| Package | Version | Purpose |
|---------|---------|---------|
| `ai` | ^6.0.69 | Core AI SDK with agent loop, streaming, tool management |
| `@ai-sdk/anthropic` | ^3.0.36 | Claude provider for AI SDK |

**Why AI SDK 6 over raw `@anthropic-ai/sdk`:**

| Feature | AI SDK 6 | Raw SDK |
|---------|----------|---------|
| Agent loop | Managed automatically (20 steps default) | Manual implementation |
| Streaming | `useChat`, `streamText` hooks | Manual SSE parsing |
| Tool approval | Built-in `onToolCall` callback | Custom implementation |
| DevTools | Included for debugging | None |
| Tool calling + structured output | Unified in single call | Requires chaining |
| MCP support | Full (stable in @ai-sdk/mcp) | Not built-in |

**Installation:**
```bash
pnpm add ai @ai-sdk/anthropic
```

**Basic Integration Pattern:**
```typescript
// app/api/agent/route.ts
import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'

export async function POST(req: Request) {
  const { messages, tools } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    messages,
    tools, // MorfX tool definitions
    maxSteps: 10,
    onToolCall: async ({ toolCall }) => {
      // Human-in-the-loop approval hook
    }
  })

  return result.toDataStreamResponse()
}
```

**Confidence:** HIGH - Verified via [npm](https://www.npmjs.com/package/ai), [AI SDK docs](https://ai-sdk.dev/docs/introduction), [Anthropic provider docs](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)

---

### 2. Visual Canvas for Agent Management

#### Recommended: @xyflow/react (React Flow 12)

| Package | Version | Purpose |
|---------|---------|---------|
| `@xyflow/react` | ^12.10.0 | Node-based UI for agent workflow visualization |

**Why @xyflow/react:**
- Industry standard for visual node editors (used by Stripe, Typeform)
- Seamless zooming/panning, multi-selection, keyboard shortcuts
- Only re-renders changed nodes (performance)
- DOM-based nodes (not Canvas) - allows custom React components inside nodes
- MIT licensed, actively maintained
- 365+ projects in npm registry using it

**Key Features for Agent Canvas:**
- Custom node types for agent states (thinking, tool calling, responding)
- Custom edges for conversation flow
- MiniMap and Controls plugins included
- TypeScript support

**Installation:**
```bash
pnpm add @xyflow/react
```

**Basic Pattern:**
```typescript
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// Custom node types for agents
const nodeTypes = {
  agentNode: AgentStateNode,
  toolNode: ToolExecutionNode,
  responseNode: ResponseNode,
}

function AgentCanvas({ nodes, edges }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  )
}
```

**Alternatives Considered:**

| Library | Why Not |
|---------|---------|
| JsPlumb | Overkill for our use case, larger bundle |
| Cytoscape.js | Canvas-based (limits custom React components) |
| D3.js | Too low-level, more work required |
| vis.js | Less React-friendly, older API |

**Confidence:** HIGH - Verified via [npm](https://www.npmjs.com/package/@xyflow/react), [React Flow docs](https://reactflow.dev), [GitHub](https://github.com/xyflow/xyflow)

---

### 3. Agent State Management

#### Recommended: Zustand (already familiar pattern) + React Query for server state

**No new packages needed.** Use existing patterns with enhancements:

| Concern | Approach |
|---------|----------|
| Agent session state | Zustand store (`agentStore`) |
| Conversation history | Supabase + React hooks (existing pattern) |
| Tool execution queue | Zustand with immer middleware |
| Real-time updates | Supabase Realtime (existing) |

**Why Zustand for agent state:**
- Already used pattern in the codebase (implicit via React state)
- Simple API, minimal boilerplate
- Supports middleware (immer for immutable updates)
- Works well with React 19 concurrent features
- ~1KB bundle size

**Agent State Structure:**
```typescript
interface AgentStore {
  // Session state
  sessionId: string | null
  status: 'idle' | 'thinking' | 'tool_calling' | 'responding' | 'error'

  // Conversation
  messages: Message[]
  pendingToolCalls: ToolCall[]

  // Execution tracking
  currentStep: number
  maxSteps: number

  // Actions
  startSession: () => void
  addMessage: (msg: Message) => void
  setStatus: (status: AgentStatus) => void
  approveToolCall: (toolCallId: string) => void
  rejectToolCall: (toolCallId: string) => void
}
```

**Installation (if not present):**
```bash
pnpm add zustand
```

**Confidence:** HIGH - Zustand is well-documented, [comparison docs](https://zustand.docs.pmnd.rs/getting-started/comparison)

---

### 4. Real-time Agent Execution Visualization

#### Recommended: AI SDK streaming + Supabase Realtime (existing)

**No new packages needed.** Leverage existing infrastructure:

| Layer | Technology | Purpose |
|-------|------------|---------|
| Client streaming | AI SDK `useChat` hook | Token-by-token response streaming |
| Agent events | AI SDK streaming events | Tool calls, thinking, completion |
| Persistence | Supabase Realtime | Cross-tab/cross-user sync |
| Canvas updates | React state + @xyflow/react | Visual node updates |

**Streaming Event Types (AI SDK 6):**
```typescript
// These events arrive automatically via streamText
- 'text-delta'     // Token streaming
- 'tool-call'      // Tool invocation started
- 'tool-result'    // Tool execution completed
- 'step-finish'    // Agent step completed
- 'finish'         // Agent loop completed
```

**Visual Update Pattern:**
```typescript
const { messages, isLoading } = useChat({
  api: '/api/agent',
  onToolCall: async ({ toolCall }) => {
    // Update canvas node to show tool execution
    updateNode(toolCall.toolCallId, { status: 'executing' })

    // Execute via existing MorfX tool system
    const result = await executeToolFromAgent(
      toolCall.toolName,
      toolCall.args,
      workspaceId,
      sessionId
    )

    // Update canvas with result
    updateNode(toolCall.toolCallId, {
      status: 'completed',
      result
    })

    return result
  }
})
```

**Confidence:** HIGH - Based on [AI SDK streaming docs](https://platform.claude.com/docs/en/build-with-claude/streaming), existing Supabase Realtime patterns in codebase

---

### 5. Tool Integration Bridge

#### Connecting AI SDK tools to existing MorfX Tool Registry

**No new packages.** Create adapter layer:

```typescript
// lib/agents/tool-adapter.ts
import { tool } from 'ai'
import { toolRegistry } from '@/lib/tools/registry'
import { z } from 'zod'

/**
 * Convert MorfX tool schemas to AI SDK tool format
 */
export function convertMorfXToolsToAISDK() {
  const morfxTools = toolRegistry.listTools()

  return morfxTools.reduce((acc, t) => {
    acc[t.name] = tool({
      description: t.description,
      parameters: jsonSchemaToZod(t.inputSchema),
      execute: async (args) => {
        // Route through existing executor
        return executeToolFromAgent(
          t.name,
          args,
          workspaceId,
          sessionId
        )
      }
    })
    return acc
  }, {} as Record<string, ReturnType<typeof tool>>)
}
```

**Why this approach:**
- Reuses all 16 existing registered tools
- Maintains forensic logging
- Preserves permission checks
- Single source of truth for tool definitions

**Confidence:** HIGH - AI SDK tool format is [well documented](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)

---

## NOT Recommended

### 1. Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

**Why NOT:**
- Designed for autonomous coding agents (file system, bash execution)
- Overkill for conversational CRM agents
- Proprietary license (not MIT)
- Built-in tools not relevant (file read/write, grep, glob)
- 71MB package size vs ~3MB for AI SDK

**When it WOULD be appropriate:**
- Building a coding assistant
- Need autonomous file system access
- Want Claude Code-like capabilities

### 2. Raw `@anthropic-ai/sdk`

**Why NOT for this project:**
- Requires manual agent loop implementation
- No built-in streaming helpers for React
- More code to maintain
- AI SDK 6 provides better abstractions

**When it WOULD be appropriate:**
- Need lowest-level control
- Non-React environments
- Very custom streaming requirements

### 3. LangChain / LangGraph

**Why NOT:**
- Heavy dependency graph
- Abstractions add complexity without clear benefit
- AI SDK 6 provides sufficient agent capabilities
- Would add learning curve for team

### 4. Custom Canvas Implementation

**Why NOT:**
- @xyflow/react solves the problem well
- Building from scratch = months of work
- Edge cases (zoom, pan, selection) are hard
- No performance optimization built-in

### 5. AG-UI Protocol

**Why NOT (yet):**
- Still emerging standard
- AI SDK streaming events are sufficient
- Could adopt later if needed
- Adds complexity without clear benefit now

---

## Integration Points with Existing Stack

### Existing (DO NOT CHANGE)

| Technology | How New Stack Integrates |
|------------|--------------------------|
| Next.js 15 | AI SDK route handlers in `app/api/agent/` |
| React 19 | AI SDK hooks (`useChat`) work with React 19 |
| TypeScript | AI SDK is fully typed |
| Supabase Auth | Pass user context to agent sessions |
| Supabase DB | Store agent sessions, conversation history |
| Supabase Realtime | Sync agent state across tabs (existing pattern) |
| Tool Registry | Adapter converts to AI SDK format |
| Tool Executor | `executeToolFromAgent` already exists |
| Shadcn/UI | Canvas nodes use existing UI components |
| Tailwind CSS | Style canvas nodes with Tailwind |

### New Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React 19)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   Agent Chat    │  │  Agent Canvas   │  │ Tool Panel  │ │
│  │   (useChat)     │  │ (@xyflow/react) │  │ (existing)  │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│           └────────────────────┼───────────────────┘        │
│                                │                             │
│                    ┌───────────▼───────────┐                │
│                    │    Zustand Store      │                │
│                    │   (Agent State)       │                │
│                    └───────────┬───────────┘                │
└────────────────────────────────┼────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────┐
│                      API Routes (Next.js)                    │
│                                │                             │
│                    ┌───────────▼───────────┐                │
│                    │   /api/agent/chat     │                │
│                    │   (AI SDK streamText) │                │
│                    └───────────┬───────────┘                │
│                                │                             │
│              ┌─────────────────┼─────────────────┐          │
│              │                 │                 │          │
│    ┌─────────▼────────┐ ┌─────▼─────┐ ┌────────▼────────┐  │
│    │  Tool Adapter    │ │  Anthropic │ │  Session Store  │  │
│    │ (MorfX → AI SDK) │ │  Provider  │ │  (Supabase)     │  │
│    └─────────┬────────┘ └───────────┘ └─────────────────┘  │
│              │                                               │
│    ┌─────────▼────────┐                                     │
│    │  Tool Executor   │ ◄── Existing MorfX system           │
│    │  (existing)      │                                     │
│    └──────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation Summary

```bash
# New packages for MVP v2
pnpm add ai @ai-sdk/anthropic @xyflow/react zustand

# Optional: DevTools for AI SDK debugging
pnpm add -D @ai-sdk/devtools
```

**Total new dependencies:** 4 packages
**Estimated bundle impact:** ~50KB gzipped

---

## Environment Variables

```bash
# Add to .env.local
ANTHROPIC_API_KEY=sk-ant-...

# Optional: AI SDK telemetry
AI_SDK_TELEMETRY_DISABLED=true
```

---

## Version Compatibility Matrix

| Package | Version | Requires | Status |
|---------|---------|----------|--------|
| ai | ^6.0.69 | Node 18+, React 18+ | Verified |
| @ai-sdk/anthropic | ^3.0.36 | ai ^6.0 | Verified |
| @xyflow/react | ^12.10.0 | React 17+ | Verified |
| zustand | ^5.0.0 | React 18+ | Verified |

All compatible with existing Next.js 15 + React 19 stack.

---

## Sources

### Primary (HIGH confidence)
- [AI SDK npm package](https://www.npmjs.com/package/ai) - v6.0.69
- [AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
- [AI SDK Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) - v3.0.36
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)
- [@xyflow/react npm](https://www.npmjs.com/package/@xyflow/react) - v12.10.0
- [React Flow Documentation](https://reactflow.dev)
- [Zustand Comparison](https://zustand.docs.pmnd.rs/getting-started/comparison)

### Secondary (MEDIUM confidence)
- [Claude API Streaming Docs](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [AG-UI Protocol Overview](https://www.datacamp.com/tutorial/ag-ui)
- [SSE with React Patterns](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view)

### Existing MorfX Code (verified in codebase)
- `/src/lib/tools/registry.ts` - Tool registration system
- `/src/lib/tools/executor.ts` - Tool execution with `executeToolFromAgent`
- `/src/lib/tools/types.ts` - MCP-compatible tool types
- `/package.json` - Current dependencies
