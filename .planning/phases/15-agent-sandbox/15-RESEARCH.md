# Phase 15: Agent Sandbox - Research

**Researched:** 2026-02-06
**Domain:** React chat UI, debugging tools, session persistence
**Confidence:** HIGH

## Summary

This phase implements a sandbox testing UI for agent conversations. The research covers three main domains: (1) resizable split-pane layouts for the chat/debug panel, (2) JSON viewer/editor for session state inspection, and (3) typing indicator animations to simulate real agent response delays.

The codebase already has established patterns for chat UIs (WhatsApp inbox), localStorage persistence, tabs (Radix UI), and the SomnioEngine that can be directly invoked for sandbox testing. The key additions are:

1. **Split pane library** - Allotment for VS Code-style resizable panels
2. **JSON viewer/editor** - @uiw/react-json-view with edit mode for session state manipulation
3. **Typing indicator** - Custom CSS animation matching the inbox pattern

**Primary recommendation:** Leverage existing codebase patterns (message bubbles, tabs, localStorage) and add only two new dependencies: `allotment` for resizable panels and `@uiw/react-json-view` for JSON debugging.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| allotment | ^1.20.x | Resizable split panels | VS Code-derived, React-first, accessible, TypeScript support |
| @uiw/react-json-view | ^2.x | JSON viewer/editor with dark theme | Lightweight, editable mode, multiple themes, actively maintained |

### Supporting (Already in codebase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-tabs | ^1.1.13 | Debug panel tabs | Already in project - use for Tools/Estado/Intent/Tokens tabs |
| date-fns | ^4.1.0 | Timestamp formatting | Already in project - use for HH:MM:SS display |
| lucide-react | ^0.563.0 | Icons | Already in project - use for toolbar actions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| allotment | react-resplit | react-resplit is more modern but allotment has better docs and VS Code pedigree |
| @uiw/react-json-view | json-edit-react | json-edit-react has more edit options but larger bundle size |
| localStorage | IndexedDB | IndexedDB better for large data but overkill for sandbox sessions (~5-10KB each) |

**Installation:**
```bash
npm install allotment @uiw/react-json-view
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(dashboard)/sandbox/
│   ├── page.tsx                    # Main sandbox page
│   ├── layout.tsx                  # Sandbox-specific layout (if needed)
│   └── components/
│       ├── sandbox-layout.tsx      # Allotment split pane wrapper
│       ├── sandbox-chat.tsx        # Chat panel with inverted theme
│       ├── sandbox-header.tsx      # Toolbar with agent selector, controls
│       ├── sandbox-message-bubble.tsx # Message bubble (inverted theme)
│       ├── sandbox-input.tsx       # Message input at bottom
│       ├── typing-indicator.tsx    # Animated "typing..." dots
│       └── debug-panel/
│           ├── debug-tabs.tsx      # Tab container
│           ├── tools-tab.tsx       # Tool executions list
│           ├── state-tab.tsx       # JSON viewer/editor for state
│           ├── intent-tab.tsx      # Intent + confidence display
│           └── tokens-tab.tsx      # Token counter
├── lib/sandbox/
│   ├── sandbox-session.ts          # Session state management (localStorage)
│   ├── sandbox-engine.ts           # Wrapper around SomnioEngine for sandbox mode
│   └── types.ts                    # Sandbox-specific types
```

### Pattern 1: Allotment Split Pane Layout
**What:** Resizable horizontal split with chat (60%) and debug panel (40%)
**When to use:** Main sandbox page layout
**Example:**
```typescript
// Source: https://github.com/johnwalley/allotment
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'

export function SandboxLayout() {
  return (
    <Allotment defaultSizes={[60, 40]} minSize={300}>
      <Allotment.Pane>
        <SandboxChat />
      </Allotment.Pane>
      <Allotment.Pane>
        <DebugPanel />
      </Allotment.Pane>
    </Allotment>
  )
}
```

### Pattern 2: JSON Viewer with Edit Mode
**What:** Collapsible JSON tree with inline editing capability
**When to use:** Session state debugging (Estado tab)
**Example:**
```typescript
// Source: https://github.com/uiwjs/react-json-view
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'

export function StateTab({ state, onStateChange }) {
  return (
    <JsonView
      value={state}
      style={darkTheme}
      displayDataTypes={false}
      collapsed={2}
      editable={{
        add: true,
        edit: true,
        delete: true,
      }}
      onEdit={({ newValue, keyPath }) => {
        onStateChange(keyPath, newValue)
      }}
    />
  )
}
```

### Pattern 3: Inverted Theme Chat
**What:** Chat bubbles with inverted color scheme to distinguish from real inbox
**When to use:** Sandbox chat messages
**Example:**
```typescript
// Invert the existing MessageBubble colors
// Own messages (agent) -> muted background (normally customer)
// Customer messages (sandbox user) -> primary background (normally agent)
<div className={cn(
  'relative max-w-[70%] rounded-lg px-3 py-2 shadow-sm',
  isAgent
    ? 'bg-muted rounded-br-none'  // Agent = left/muted (inverted)
    : 'bg-primary text-primary-foreground rounded-bl-none'  // User = right/primary (inverted)
)} />
```

### Pattern 4: Simulated Response Delays
**What:** Real 2-6 second delays between agent response messages
**When to use:** Message sequencing to match production behavior
**Example:**
```typescript
async function sendAgentMessages(messages: string[]): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    setIsTyping(true)
    const delay = 2000 + Math.random() * 4000  // 2-6 seconds
    await new Promise(resolve => setTimeout(resolve, delay))
    setIsTyping(false)
    addMessage(messages[i])
  }
}
```

### Pattern 5: localStorage Session Persistence
**What:** Save/load sandbox sessions with custom names
**When to use:** Session management (toolbar controls)
**Example:**
```typescript
// Following existing codebase pattern from pipeline-tabs.tsx
const STORAGE_KEY = 'morfx:sandbox:sessions'
const LAST_AGENT_KEY = 'morfx:sandbox:last-agent'

interface SavedSession {
  id: string
  name: string
  agentId: string
  messages: SandboxMessage[]
  state: SessionState
  createdAt: string
  updatedAt: string
}

function saveSessions(sessions: SavedSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // Ignore localStorage errors (quota, private browsing)
  }
}
```

### Anti-Patterns to Avoid
- **Direct SomnioEngine database writes in sandbox:** Create a sandbox-specific engine that simulates without persisting to real sessions table
- **Blocking UI during API calls:** Always use loading states and async patterns
- **Uncontrolled JSON editing:** Validate edited state before applying to prevent crashes
- **Missing confirmation dialogs:** CONTEXT.md requires confirmation before reset/new session

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resizable panels | CSS resize handle | allotment | Touch support, keyboard a11y, snap behavior, min/max sizes |
| JSON viewer/editor | Recursive tree renderer | @uiw/react-json-view | Collapse/expand, type coloring, edit validation, large object performance |
| Typing indicator animation | Custom JS interval | CSS keyframes | Smoother animation, no React re-renders |
| Timestamp formatting | Manual string concat | date-fns format() | Locale support, timezone handling, already in project |
| Tab state management | useState + conditionals | Radix Tabs | Keyboard navigation, ARIA, focus management |

**Key insight:** The sandbox is UI-heavy with multiple interactive panels. Each "simple" feature (resize, JSON display, animations) has accessibility, performance, and edge case considerations that libraries handle better than custom code.

## Common Pitfalls

### Pitfall 1: Mixing Sandbox and Real Data
**What goes wrong:** Sandbox session writes to real agent_sessions table, polluting production data
**Why it happens:** Reusing SomnioEngine directly instead of wrapping it
**How to avoid:** Create SandboxEngine that intercepts all DB writes and stores in memory/localStorage
**Warning signs:** Seeing sandbox conversations in real inbox, orders created from sandbox tests

### Pitfall 2: Stale State After JSON Edit
**What goes wrong:** User edits JSON state but next agent response uses old cached state
**Why it happens:** React state not synced with edited values
**How to avoid:** Use controlled component pattern - edits immediately update state used by engine
**Warning signs:** Agent responses don't reflect manually edited state values

### Pitfall 3: Memory Leak in Typing Animation
**What goes wrong:** setInterval or setTimeout not cleaned up on unmount
**Why it happens:** Missing useEffect cleanup
**How to avoid:** Always return cleanup function from useEffect, use CSS animations when possible
**Warning signs:** Console warnings about state updates on unmounted components

### Pitfall 4: Split Panel Height Calculation
**What goes wrong:** Allotment doesn't fill container height, panels have wrong size
**Why it happens:** Parent container doesn't have explicit height
**How to avoid:** Ensure parent has `height: 100%` or `flex-1` with flex container
**Warning signs:** Panels collapsed or showing scrollbars unexpectedly

### Pitfall 5: localStorage Quota Exceeded
**What goes wrong:** Session save fails silently, user loses work
**Why it happens:** Too many saved sessions or large state objects (images, long conversations)
**How to avoid:** Wrap in try/catch, show toast on failure, implement session pruning (keep last N sessions)
**Warning signs:** Sessions not appearing after refresh, browser dev tools showing quota errors

## Code Examples

Verified patterns from official sources:

### Typing Indicator CSS Animation
```css
/* Source: https://dev.to/3mustard/create-a-typing-animation-in-react-17o0 */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: hsl(var(--muted));
  border-radius: 12px;
  width: fit-content;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground));
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
.typing-indicator span:nth-child(3) { animation-delay: 0s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}
```

### Allotment with Controlled Sizes
```typescript
// Source: https://github.com/johnwalley/allotment
import { Allotment, AllotmentHandle } from 'allotment'
import { useRef } from 'react'

export function ControlledSplit() {
  const ref = useRef<AllotmentHandle>(null)

  const resetSizes = () => {
    ref.current?.reset()  // Reset to defaultSizes
  }

  return (
    <Allotment ref={ref} defaultSizes={[60, 40]}>
      <Allotment.Pane minSize={300}>
        <ChatPanel />
      </Allotment.Pane>
      <Allotment.Pane minSize={250} snap>
        <DebugPanel />
      </Allotment.Pane>
    </Allotment>
  )
}
```

### JSON View with Custom Theme Integration
```typescript
// Source: https://github.com/uiwjs/react-json-view
import JsonView from '@uiw/react-json-view'
import { lightTheme } from '@uiw/react-json-view/light'
import { darkTheme } from '@uiw/react-json-view/dark'
import { useTheme } from 'next-themes'

export function ThemedJsonView({ value, onEdit }) {
  const { theme } = useTheme()

  return (
    <JsonView
      value={value}
      style={theme === 'dark' ? darkTheme : lightTheme}
      shortenTextAfterLength={50}
      collapsed={2}
      enableClipboard={true}
      editable={{ add: true, edit: true, delete: true }}
      onEdit={onEdit}
    />
  )
}
```

### Tool Execution Display
```typescript
// Based on existing ToolCallRecord type in codebase
interface ToolExecutionItemProps {
  tool: {
    name: string
    input: Record<string, unknown>
    result?: {
      success: boolean
      data?: unknown
      error?: { code: string; message: string }
    }
  }
}

export function ToolExecutionItem({ tool }: ToolExecutionItemProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border rounded-lg p-2">
      <button
        className="flex items-center gap-2 w-full"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-mono text-sm">{tool.name}</span>
        <Badge variant={tool.result?.success ? 'success' : 'destructive'}>
          {tool.result?.success ? 'OK' : 'Error'}
        </Badge>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          <div>
            <span className="text-xs text-muted-foreground">Input:</span>
            <JsonView value={tool.input} collapsed={1} />
          </div>
          {tool.result && (
            <div>
              <span className="text-xs text-muted-foreground">Output:</span>
              <JsonView value={tool.result} collapsed={1} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-split-pane | allotment / react-resplit | 2023+ | react-split-pane unmaintained, modern libs use CSS Grid |
| Custom JSON trees | @uiw/react-json-view v2 | 2024 | v2 has completely new API, better customization |
| Vanilla localStorage | Still standard for small data | N/A | IndexedDB for large data, localStorage fine for <5MB |

**Deprecated/outdated:**
- `react-split-pane`: Last published 2020, has issues with React 18+
- `react-json-view` (mac-s-g): Abandoned, use @uiw/react-json-view instead

## Open Questions

Things that couldn't be fully resolved:

1. **Sandbox API route isolation**
   - What we know: SomnioEngine writes to real DB tables
   - What's unclear: Best approach to intercept - mock SessionManager or create SandboxEngine wrapper?
   - Recommendation: Create SandboxEngine that uses in-memory state, only call Claude for real AI responses

2. **Session export format**
   - What we know: Sessions need to be saveable/loadable
   - What's unclear: Should support sharing between users? Import/export to file?
   - Recommendation: Start with localStorage only, defer file export to future enhancement

## Sources

### Primary (HIGH confidence)
- Existing codebase patterns (message-bubble.tsx, inbox-layout.tsx, pipeline-tabs.tsx)
- @radix-ui/react-tabs (already in package.json)
- SomnioEngine and agent types (src/lib/agents/)

### Secondary (MEDIUM confidence)
- [allotment GitHub](https://github.com/johnwalley/allotment) - VS Code-derived, well documented
- [@uiw/react-json-view npm](https://www.npmjs.com/package/@uiw/react-json-view) - Active development, v2 stable
- [Typing animation tutorial](https://dev.to/3mustard/create-a-typing-animation-in-react-17o0) - Standard CSS approach

### Tertiary (LOW confidence)
- WebSearch results for React sandbox patterns - general guidance only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - allotment and @uiw/react-json-view are well-established with good docs
- Architecture: HIGH - patterns derived from existing codebase and official library examples
- Pitfalls: MEDIUM - based on experience with similar UIs, not all verified in this specific context

**Research date:** 2026-02-06
**Valid until:** 30 days (stable domain, no fast-moving APIs)
