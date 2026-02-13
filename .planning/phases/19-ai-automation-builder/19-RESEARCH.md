# Phase 19: AI Automation Builder - Research

**Researched:** 2026-02-13
**Domain:** AI agent chat UI + flowchart rendering + automation CRUD via natural language
**Confidence:** HIGH (codebase verified, libraries verified via official docs)

## Summary

Phase 19 builds a meta-agent that creates and configures CRM automations through natural language conversation. The user describes what they want in a dedicated chat at `/automatizaciones/builder`, the agent interprets the request, validates workspace resources (pipelines, stages, tags, templates), generates a visual flowchart preview inline in the chat, and upon user approval creates the automation via existing CRUD server actions.

The codebase already has a mature automations engine (Phase 17) with 10 trigger types, 11 action types, 12 condition operators, and a full CRUD layer. It also has a rich agent infrastructure (Phase 13) with ClaudeClient, SessionManager, AgentEngine, and an existing sandbox chat UI (Phase 15) that provides a proven pattern for chat-based agent interaction.

**Primary recommendation:** Use AI SDK 6 (`ai` + `@ai-sdk/anthropic`) for the builder chat with `useChat` hook and `streamText` for streaming, React Flow (`@xyflow/react`) for read-only flowchart rendering inline in chat messages, and the existing automation CRUD server actions for persistence. The builder agent gets its own dedicated set of server-side tools for resource lookup and automation CRUD.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | ^6.x | AI SDK Core - streamText, tool calling | Unified streaming + tool calling for Next.js App Router. Prior project decision. |
| `@ai-sdk/anthropic` | ^2.x | Anthropic provider for AI SDK | Prior project decision. Replaces raw `@anthropic-ai/sdk` for this feature. |
| `@xyflow/react` | ^12.x | React Flow - flowchart rendering | Most popular React flowchart library (35K+ stars, 4.5M+ weekly installs). React 19 compatible. MIT license. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.x | Schema validation for tools | Already installed. Define tool input schemas. |
| `@radix-ui/react-scroll-area` | ^1.x | Chat scroll container | Already installed. Same pattern as sandbox. |
| `lucide-react` | ^0.563 | Icons for flowchart nodes | Already installed. |
| `sonner` | ^2.x | Toast notifications | Already installed. Success/error feedback. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Flow | Mermaid.js | Mermaid renders from text, no custom node components. React Flow allows full React component nodes with custom styling (red borders for invalid resources). |
| React Flow | Custom SVG | Hand-rolling flowchart layout is complex (node positioning, edge routing). React Flow handles this with dagre auto-layout. |
| AI SDK | Raw `@anthropic-ai/sdk` | The project already uses raw SDK for Somnio agent. AI SDK provides `useChat` hook with built-in streaming, message state, tool call rendering via `parts`. Much less boilerplate for chat UIs. |
| AI SDK useChat | Custom fetch + useState | Would replicate what useChat already provides. No benefit. |

**Installation:**
```bash
npm install ai @ai-sdk/anthropic @xyflow/react
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(dashboard)/automatizaciones/
│   ├── builder/
│   │   ├── page.tsx                    # Builder page (server component)
│   │   └── components/
│   │       ├── builder-layout.tsx      # Main layout with chat
│   │       ├── builder-chat.tsx        # Chat UI using useChat
│   │       ├── builder-message.tsx     # Message bubble with parts rendering
│   │       ├── automation-preview.tsx  # React Flow diagram component
│   │       ├── preview-nodes.tsx       # Custom node types (trigger, condition, action)
│   │       ├── preview-edges.tsx       # Custom edge styles
│   │       ├── confirmation-buttons.tsx # "Crear" / "Modificar" buttons
│   │       └── session-history.tsx     # Past builder sessions list
│   ├── page.tsx                        # Existing automation list (unchanged)
│   ├── nueva/page.tsx                  # Existing wizard (unchanged)
│   └── [id]/editar/page.tsx            # Existing edit wizard (unchanged)
├── app/api/
│   └── builder/
│       └── chat/
│           └── route.ts                # AI SDK streaming endpoint
├── lib/
│   └── builder/
│       ├── types.ts                    # Builder-specific types
│       ├── tools.ts                    # Tool definitions for the agent
│       ├── system-prompt.ts            # System prompt with catalog knowledge
│       ├── diagram-generator.ts        # Convert automation → React Flow nodes/edges
│       ├── validation.ts               # Resource validation + cycle detection
│       └── session-store.ts            # Builder session persistence
```

### Pattern 1: AI SDK Chat with Server-Side Tools
**What:** Use `useChat` on the client with `streamText` on the server. All tools execute server-side via `execute` function.
**When to use:** When the agent needs to query the database (resource lookup) and create automations.
**Example:**
```typescript
// app/api/builder/chat/route.ts
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { BUILDER_SYSTEM_PROMPT } from '@/lib/builder/system-prompt'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250514'),
    system: BUILDER_SYSTEM_PROMPT,
    messages,
    tools: {
      listPipelines: {
        description: 'List all pipelines and their stages in the workspace',
        parameters: z.object({}),
        execute: async () => { /* query DB */ },
      },
      listTags: {
        description: 'List all tags in the workspace',
        parameters: z.object({}),
        execute: async () => { /* query DB */ },
      },
      listTemplates: {
        description: 'List WhatsApp templates and their approval status',
        parameters: z.object({}),
        execute: async () => { /* query DB */ },
      },
      listAutomations: {
        description: 'List existing automations in the workspace',
        parameters: z.object({}),
        execute: async () => { /* query DB */ },
      },
      generatePreview: {
        description: 'Generate a visual preview of the automation being built',
        parameters: z.object({
          name: z.string(),
          trigger: z.object({ type: z.string(), config: z.record(z.unknown()) }),
          conditions: z.any().nullable(),
          actions: z.array(z.object({ type: z.string(), params: z.record(z.unknown()) })),
        }),
        execute: async (params) => {
          // Validate resources, detect cycles, return diagram data
        },
      },
      createAutomation: {
        description: 'Create the automation after user confirms the preview',
        parameters: z.object({
          name: z.string(),
          description: z.string().optional(),
          trigger_type: z.string(),
          trigger_config: z.record(z.unknown()),
          conditions: z.any().nullable(),
          actions: z.array(z.object({ type: z.string(), params: z.record(z.unknown()) })),
        }),
        execute: async (params) => {
          // Call existing createAutomation server action
        },
      },
      updateAutomation: {
        description: 'Update an existing automation after user confirms changes',
        parameters: z.object({
          automationId: z.string(),
          // ... same fields as create
        }),
        execute: async (params) => {
          // Call existing updateAutomation server action
        },
      },
      getAutomation: {
        description: 'Get details of an existing automation by ID or name',
        parameters: z.object({
          automationId: z.string().optional(),
          name: z.string().optional(),
        }),
        execute: async (params) => {
          // Query and return automation details
        },
      },
    },
    maxSteps: 5, // Allow multi-step tool calls
  })

  return result.toDataStreamResponse()
}
```

### Pattern 2: Custom Message Parts for Diagram Rendering
**What:** Use AI SDK message parts to render React Flow diagrams inline in chat.
**When to use:** When the `generatePreview` tool returns diagram data, render it as a React Flow component.
**Example:**
```typescript
// builder-message.tsx
{message.parts.map((part, i) => {
  if (part.type === 'text') {
    return <p key={i}>{part.text}</p>
  }
  if (part.type === 'tool-generatePreview' && part.state === 'output-available') {
    return (
      <AutomationPreview
        key={i}
        diagram={part.output}
        onConfirm={() => { /* trigger createAutomation */ }}
        onModify={() => { /* let user type changes */ }}
      />
    )
  }
  return null
})}
```

### Pattern 3: Read-Only React Flow Diagram
**What:** Configure React Flow for display-only mode (no dragging, connecting, or editing).
**When to use:** For the automation preview inside chat messages.
**Example:**
```typescript
// automation-preview.tsx
import { ReactFlow, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export function AutomationPreview({ diagram, onConfirm, onModify }) {
  return (
    <div className="w-full h-64 border rounded-lg overflow-hidden">
      <ReactFlow
        nodes={diagram.nodes}
        edges={diagram.edges}
        nodeTypes={customNodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      >
        <Background />
      </ReactFlow>
      <div className="flex gap-2 p-2 border-t">
        <Button onClick={onConfirm}>Crear automatizacion</Button>
        <Button variant="outline" onClick={onModify}>Modificar</Button>
      </div>
    </div>
  )
}
```

### Pattern 4: Automation to Diagram Conversion
**What:** Convert an `AutomationFormData` object into React Flow nodes and edges with proper layout.
**When to use:** Every time `generatePreview` runs or when loading an existing automation.
**Example:**
```typescript
// diagram-generator.ts
import type { Node, Edge } from '@xyflow/react'
import type { AutomationFormData } from '@/lib/automations/types'

interface DiagramData {
  nodes: Node[]
  edges: Edge[]
  validationErrors: { nodeId: string; message: string }[]
}

export function automationToDiagram(
  automation: AutomationFormData,
  validationResults: ValidationResult[]
): DiagramData {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 1. Trigger node (always first)
  nodes.push({
    id: 'trigger',
    type: 'triggerNode',
    position: { x: 250, y: 0 },
    data: {
      triggerType: automation.trigger_type,
      config: automation.trigger_config,
      label: getTriggerLabel(automation.trigger_type),
      hasError: validationResults.some(v => v.nodeId === 'trigger' && !v.valid),
    },
  })

  // 2. Condition nodes (if conditions exist)
  let lastNodeId = 'trigger'
  let yOffset = 120

  if (automation.conditions) {
    const conditionId = 'conditions'
    nodes.push({
      id: conditionId,
      type: 'conditionNode',
      position: { x: 250, y: yOffset },
      data: {
        conditions: automation.conditions,
        label: 'Condiciones',
      },
    })
    edges.push({
      id: `${lastNodeId}-${conditionId}`,
      source: lastNodeId,
      target: conditionId,
    })
    lastNodeId = conditionId
    yOffset += 120
  }

  // 3. Action nodes (sequential)
  automation.actions.forEach((action, index) => {
    const actionId = `action-${index}`
    nodes.push({
      id: actionId,
      type: 'actionNode',
      position: { x: 250, y: yOffset },
      data: {
        actionType: action.type,
        params: action.params,
        delay: action.delay,
        label: getActionLabel(action.type),
        hasError: validationResults.some(v => v.nodeId === actionId && !v.valid),
      },
    })
    edges.push({
      id: `${lastNodeId}-${actionId}`,
      source: lastNodeId,
      target: actionId,
    })
    lastNodeId = actionId
    yOffset += 120
  })

  return { nodes, edges, validationErrors: [] }
}
```

### Pattern 5: Builder Session Persistence
**What:** Store builder chat sessions in a DB table for history browsing.
**When to use:** To allow users to revisit past builder conversations.
**Example:**
```sql
CREATE TABLE builder_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT, -- Auto-generated or first message summary
  messages JSONB NOT NULL DEFAULT '[]',
  automations_created UUID[] DEFAULT '{}', -- IDs of automations created in this session
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
```

### Anti-Patterns to Avoid
- **Preloading all workspace resources:** Don't fetch all pipelines, tags, templates at chat init. The agent should call lookup tools only when needed (lazy loading).
- **Client-side tool execution:** All tools must execute server-side. The builder agent needs DB access for resource validation.
- **Bypassing existing CRUD:** Don't write direct Supabase inserts. Use the existing `createAutomation`/`updateAutomation` server actions, or at minimum the same validation logic.
- **Interactive diagram editing:** The context explicitly says the diagram is read-only. Changes happen only through chat. Don't add click handlers on nodes.
- **Auto-creating missing resources:** The context explicitly defers resource creation. The agent only warns about missing resources, never creates them.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat streaming UI | Manual fetch + SSE parsing | AI SDK `useChat` hook | Handles streaming, message state, tool parts, reconnection |
| Flowchart layout | Manual node positioning | React Flow with `fitView` | Handles edge routing, viewport, responsive sizing |
| Automation validation | Custom validation | Existing `automationSchema` (Zod) in `src/app/actions/automations.ts` | Already validates name, trigger_type, actions array, conditions groups |
| Resource lookup | Custom queries per resource | Parameterized Supabase queries via tool functions | Consistent workspace isolation pattern |
| Cycle detection | Graph traversal from scratch | Build adjacency list from automation trigger→action pairs | Small graph (<50 automations per workspace), DFS sufficient |
| Message persistence | Custom message format | AI SDK message format with `messages` array | Compatible with `useChat` state management |

**Key insight:** The builder is primarily an orchestration layer. It uses AI SDK for the chat, existing automation CRUD for persistence, existing type system for validation, and React Flow for visualization. The novel work is the system prompt, tool definitions, diagram generation, and resource validation.

## Common Pitfalls

### Pitfall 1: AI SDK vs Raw Anthropic SDK Confusion
**What goes wrong:** The codebase uses `@anthropic-ai/sdk` directly for the existing Somnio agent (ClaudeClient). The builder uses AI SDK (`ai` + `@ai-sdk/anthropic`). Mixing them causes confusion.
**Why it happens:** Two different Claude integrations coexist in the same project.
**How to avoid:** Keep them clearly separated. The builder uses AI SDK exclusively. The existing agent engine uses raw SDK. They don't share code.
**Warning signs:** Importing from `@anthropic-ai/sdk` in builder files, or importing from `ai` in agent engine files.

### Pitfall 2: Tool Call Streaming and Diagram Rendering Timing
**What goes wrong:** The diagram renders before the tool call finishes, showing loading state or empty diagram.
**Why it happens:** AI SDK streams tool calls progressively. The `part.state` goes through `input-streaming` -> `input-available` -> `output-available`.
**How to avoid:** Only render the diagram when `part.state === 'output-available'`. Show a skeleton/loading state for `input-streaming` and `input-available`.
**Warning signs:** Flash of empty diagram, error rendering incomplete data.

### Pitfall 3: Workspace ID Missing in API Route
**What goes wrong:** Builder agent tools query the DB without workspace isolation, returning data from other workspaces.
**Why it happens:** The API route needs to extract workspace_id from cookies and pass it to every tool.
**How to avoid:** Read workspace_id from cookies at the top of the route handler. Pass it as context to every tool's `execute` function.
**Warning signs:** Resource lists showing items from other workspaces, security audit failures.

### Pitfall 4: React Flow CSS Not Loading
**What goes wrong:** Flowchart renders as unstyled divs or invisible nodes.
**Why it happens:** React Flow requires its CSS stylesheet to be imported. Missing import causes layout issues.
**How to avoid:** Import `@xyflow/react/dist/style.css` in the component or layout file that uses React Flow.
**Warning signs:** Nodes visible but no edges, nodes stacked on top of each other, no background grid.

### Pitfall 5: Multi-Step Tool Calls Exceeding Context
**What goes wrong:** The agent calls many tools in a single turn (list pipelines, list tags, list templates, generate preview), consuming excessive tokens.
**Why it happens:** Claude may try to gather all information at once.
**How to avoid:** Set `maxSteps` to a reasonable limit (5). Design the system prompt to encourage asking the user what they want before looking up resources.
**Warning signs:** Single turns using 10K+ tokens, many sequential tool calls.

### Pitfall 6: Automation Duplication Detection False Positives
**What goes wrong:** The agent flags automations as duplicates when they're actually different.
**Why it happens:** Comparing trigger types alone without considering trigger config and conditions.
**How to avoid:** Compare trigger_type + trigger_config + first action type as the duplicate key. Allow same trigger type with different configs.
**Warning signs:** Agent refusing to create valid automations.

### Pitfall 7: Dynamic Imports for React Flow (SSR)
**What goes wrong:** React Flow crashes during server-side rendering.
**Why it happens:** React Flow uses browser APIs (canvas, resize observer) that don't exist on the server.
**How to avoid:** Use `next/dynamic` with `{ ssr: false }` to lazy-load the diagram component. The codebase already does this for Allotment in the sandbox.
**Warning signs:** `ReferenceError: window is not defined` during build or SSR.

### Pitfall 8: Stale Tool Results After Modification
**What goes wrong:** After updating an automation, the agent shows the old version in the next preview.
**Why it happens:** Tool results are cached in the message history. The agent needs to re-fetch after modifications.
**How to avoid:** After `updateAutomation` succeeds, always call `generatePreview` again with the updated data. Design the system prompt to enforce this.
**Warning signs:** Preview showing old data after edit.

## Code Examples

### Verified: AI SDK streamText with Tools (from AI SDK docs)
```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250514'),
    system: 'You are a helpful assistant.',
    messages,
    tools: {
      myTool: {
        description: 'Description of what the tool does',
        parameters: z.object({
          param1: z.string().describe('Description of param1'),
        }),
        execute: async ({ param1 }) => {
          return { result: 'some result' }
        },
      },
    },
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}
```

### Verified: useChat Hook with Tool Parts (from AI SDK docs)
```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
'use client'
import { useChat } from 'ai/react'

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/builder/chat',
  })

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          {message.parts.map((part, i) => {
            if (part.type === 'text') return <p key={i}>{part.text}</p>
            if (part.type === 'tool-generatePreview') {
              if (part.state === 'output-available') {
                return <DiagramPreview key={i} data={part.output} />
              }
              return <DiagramSkeleton key={i} />
            }
            return null
          })}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  )
}
```

### Verified: React Flow Read-Only Mode (from React Flow docs)
```typescript
// Source: https://reactflow.dev/api-reference/react-flow
import { ReactFlow, Background, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const nodes: Node[] = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Trigger' } },
  { id: '2', position: { x: 0, y: 100 }, data: { label: 'Action' } },
]
const edges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
]

function ReadOnlyDiagram() {
  return (
    <div style={{ height: 300 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
      >
        <Background />
      </ReactFlow>
    </div>
  )
}
```

### Existing Pattern: Automation CRUD (from codebase)
```typescript
// Source: src/app/actions/automations.ts
// The builder agent's createAutomation tool should reuse this pattern:
import { createAutomation } from '@/app/actions/automations'

const result = await createAutomation({
  name: 'Auto-created by AI Builder',
  trigger_type: 'order.stage_changed',
  trigger_config: { pipelineId: 'xxx', stageId: 'yyy' },
  conditions: null,
  actions: [
    { type: 'assign_tag', params: { tagName: 'VIP' } },
  ],
})
```

### Existing Pattern: Workspace Auth Context (from codebase)
```typescript
// Source: src/app/actions/automations.ts
// Builder API route needs the same auth pattern:
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function getBuilderContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  return { supabase, user, workspaceId }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw Anthropic SDK for chat | AI SDK `useChat` + `streamText` | AI SDK 5/6 (2025) | Handles streaming, tool parts, message state automatically |
| Manual flowchart SVG | React Flow (@xyflow/react) | xyflow rebrand (2024) | Mature library with React 19 support, custom nodes, auto layout |
| `reactflow` package | `@xyflow/react` package | 2024 rebrand | Same library, new package name. Old `reactflow` still works but new installs should use `@xyflow/react` |
| Content string rendering | Message parts rendering | AI SDK 5 (2025) | Tool calls, text, images as typed parts instead of raw string content |

**Deprecated/outdated:**
- `reactflow` npm package: Use `@xyflow/react` instead (same library, rebranded)
- `AnthropicStream` helper: Deprecated in AI SDK 5+. Use `streamText` with `anthropic()` provider instead.
- `useCompletion`: For non-chat use cases. Use `useChat` for conversational UIs.

## Open Questions

1. **AI SDK version compatibility with existing `@anthropic-ai/sdk`**
   - What we know: Both can coexist. AI SDK uses its own `@ai-sdk/anthropic` provider, not `@anthropic-ai/sdk`.
   - What's unclear: Whether there are peer dependency conflicts.
   - Recommendation: Install and test. They use separate API key configs and don't share code.

2. **Builder session persistence format**
   - What we know: AI SDK `useChat` manages messages in its own format with `id`, `role`, `parts`, `createdAt`.
   - What's unclear: Exact JSON size of messages with tool call parts after many turns.
   - Recommendation: Store messages as JSONB. Set a reasonable session limit (e.g., 100 messages per session) to prevent unbounded growth.

3. **Token budget for builder conversations**
   - What we know: Existing Somnio agent has 50K token budget. Builder conversations may be shorter but tool calls add up.
   - What's unclear: Average tokens per builder session.
   - Recommendation: Start with same 50K limit. Monitor and adjust. The builder should be efficient — most sessions create 1-3 automations.

4. **React Flow bundle size impact**
   - What we know: React Flow is client-side only. Dynamic import with `ssr: false` isolates it.
   - What's unclear: Exact bundle size addition.
   - Recommendation: Use dynamic import to code-split. Only loads when user visits `/automatizaciones/builder`.

## Codebase Context (Critical for Planning)

### Existing Infrastructure to Reuse

1. **Automation CRUD** (`src/app/actions/automations.ts`):
   - `createAutomation(formData)` - validates with Zod, enforces limits, creates with workspace isolation
   - `updateAutomation(id, formData)` - validates, updates, workspace ownership check
   - `getAutomation(id)` - single automation by ID
   - `getAutomations()` - all automations for workspace
   - `toggleAutomation(id)` - enable/disable
   - `duplicateAutomation(id)` - creates copy with "(copia)" suffix, disabled by default

2. **Automation Type System** (`src/lib/automations/types.ts`):
   - `TriggerType` - 10 types: order.stage_changed, tag.assigned, tag.removed, contact.created, order.created, field.changed, whatsapp.message_received, whatsapp.keyword_match, task.completed, task.overdue
   - `ActionType` - 11 types: assign_tag, remove_tag, change_stage, update_field, create_order, duplicate_order, send_whatsapp_template, send_whatsapp_text, send_whatsapp_media, create_task, webhook
   - `ConditionOperator` - 12 operators: equals, not_equals, contains, not_contains, in, not_in, gt, lt, gte, lte, exists, not_exists
   - `AutomationFormData` - the shape for create/update
   - `Automation` - full DB row type

3. **Catalogs** (`src/lib/automations/constants.ts`):
   - `TRIGGER_CATALOG` - Human-readable trigger definitions with configFields and available variables
   - `ACTION_CATALOG` - Human-readable action definitions with required params
   - `VARIABLE_CATALOG` - Available variables per trigger type with Spanish labels
   - These catalogs should be injected into the system prompt so the agent knows what's available

4. **Auth Pattern** (`src/app/actions/automations.ts`):
   - `getAuthContext()` - Returns `{ supabase, user, workspaceId }` or null
   - Uses `createClient()` from `@/lib/supabase/server`
   - Reads workspace from `morfx_workspace` cookie
   - Verifies workspace membership

5. **Sandbox Chat UI** (`src/app/(dashboard)/sandbox/`):
   - Full chat UI with message bubbles, typing indicator, input area
   - Split panel layout (chat + debug)
   - Session save/load
   - Pattern to follow: similar chat UI but simpler (no debug panel, no timers)

6. **DB Schema**:
   - `automations` table: id, workspace_id, name, description, is_enabled, trigger_type, trigger_config (JSONB), conditions (JSONB), actions (JSONB), created_by, timestamps
   - `pipelines` table: id, workspace_id, name, description, is_default
   - `pipeline_stages` table: id, pipeline_id, name, color, position, wip_limit, is_closed
   - `tags` table: id, workspace_id, name, color
   - `whatsapp_templates` table: name, workspace_id, status, components, language

### New Tables Needed

1. **`builder_sessions`**: Store chat history for revisiting past sessions
   - Columns: id, workspace_id, user_id, title, messages (JSONB), automations_created (UUID[]), created_at, updated_at

### Key Constraints from CONTEXT.md Decisions

- Chat at `/automatizaciones/builder` (NOT integrated in existing wizard)
- Multi-automation per session (user can create several in one chat)
- Agent asks when ambiguous, does NOT infer defaults
- Lazy resource loading (NOT preload at init)
- Conversation history saved (user can see past sessions)
- Agent can explain existing automations
- Agent does NOT suggest ideas proactively
- Diagram: flowchart with nodes and arrows (trigger -> condition -> action)
- Diagram: read-only, changes only through chat
- Diagram: complete regeneration each time (not diff)
- Invalid resources: red border / warning icon on nodes
- Confirmation: buttons under diagram + chat option
- Automation created DISABLED by default
- Post-creation: link to automation, user can continue in same chat
- Missing resources: warn only, NO auto-create
- Ambiguous resources: list options for user to choose
- Templates: validate existence AND Meta approval status
- Cycle detection: detect and BLOCK
- Duplicate detection: warn if conflict with existing
- Modification: partial edit, full diagram with change applied
- Every modification requires diagram approval
- NO activate/deactivate via chat (UI only)
- NO delete via chat (UI only)
- CAN clone existing as base for new

## Sources

### Primary (HIGH confidence)
- Codebase: `src/lib/automations/` - Full automation type system, catalogs, CRUD
- Codebase: `src/lib/agents/` - Agent engine, ClaudeClient, SessionManager
- Codebase: `src/app/(dashboard)/sandbox/` - Chat UI patterns
- Codebase: `src/app/actions/automations.ts` - Automation CRUD server actions
- [React Flow docs](https://reactflow.dev/) - React 19 compatibility, API reference
- [AI SDK docs](https://ai-sdk.dev/docs/introduction) - useChat, streamText, tool calling
- [AI SDK Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) - Provider config

### Secondary (MEDIUM confidence)
- [AI SDK 6 blog post](https://vercel.com/blog/ai-sdk-6) - New features, breaking changes
- [AI SDK chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage) - Tool parts rendering
- [React Flow read-only discussion](https://github.com/xyflow/xyflow/discussions/3254) - Disable interaction props

### Tertiary (LOW confidence)
- Bundle size estimates for React Flow and AI SDK (not verified with actual measurements)
- Token budget estimates for builder conversations (needs empirical data)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries verified via official docs, React 19 compatibility confirmed
- Architecture: HIGH - Based on verified AI SDK patterns and existing codebase patterns
- Pitfalls: HIGH - Based on codebase analysis and known library behaviors
- Code examples: HIGH - Verified from official docs and existing codebase

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (AI SDK and React Flow are stable, 30 days)
