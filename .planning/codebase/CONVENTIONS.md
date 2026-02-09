# Coding Conventions

**Analysis Date:** 2026-02-09

## Naming Patterns

**Files:**
- Server Actions: `kebab-case.ts` (e.g., `src/app/actions/contacts.ts`)
- Components: `kebab-case.tsx` (e.g., `src/components/contacts/contact-form.tsx`)
- Libraries/utilities: `kebab-case.ts` (e.g., `src/lib/supabase/client.ts`)
- Types: `kebab-case.ts` (e.g., `src/lib/types/database.ts`)
- Page routes: `page.tsx` in route folders following Next.js 15 App Router conventions

**Functions:**
- camelCase for all functions: `createContact`, `getContacts`, `executeTool`
- Async operations use `async` keyword explicitly
- Server Actions exported from `'use server'` files

**Variables:**
- camelCase: `workspaceId`, `sessionId`, `toolName`
- UPPER_SNAKE_CASE for constants: `MAX_TOKENS_PER_CONVERSATION`, `TIMEOUTS`, `REQUIRED_DATA_FIELDS`
- Boolean variables prefixed with `is`, `has`, `should`: `isRetryable`, `hasPermission`, `shouldRetry`

**Types:**
- PascalCase for interfaces/types: `AgentSession`, `ToolResult`, `ExecutionContext`
- Suffix patterns:
  - `Error` for error classes: `AgentError`, `VersionConflictError`, `ToolValidationError`
  - `Record` for database types: `ToolExecutionRecord`, `ApiKeyRecord`
  - `Result` for operation outcomes: `ToolResult`, `OrchestrationResult`
  - `Params` for input parameters: `CreateSessionParams`, `AddTurnParams`
  - `Options` for configuration: `ExecutionOptions`, `BatchOptions`

**Classes:**
- PascalCase: `SessionManager`, `Orchestrator`, `AgentRegistry`
- Singleton instances: camelCase matching class name: `agentRegistry`, `toolRegistry`

## Code Style

**Formatting:**
- No Prettier config detected (relying on editor defaults)
- Indentation: 2 spaces
- Line length: Generally <100 characters, but not strictly enforced
- Semicolons: Required
- Quotes: Single quotes for strings, double quotes for JSX attributes
- Trailing commas: Used in multiline objects/arrays

**Linting:**
- ESLint with Next.js config (`eslint-config-next`)
- TypeScript strict mode enabled
- No unused variables enforced

**TypeScript:**
- Strict mode enabled (`tsconfig.json`)
- Explicit return types on public functions/methods
- Type imports use `import type` syntax
- Readonly properties used extensively: `readonly category: string`, `readonly retryable: boolean`

## Import Organization

**Order:**
1. External libraries (React, Next.js, third-party)
2. Internal path aliases (`@/lib`, `@/components`, `@/app`)
3. Type imports (using `import type`)
4. Relative imports (rare, prefer path aliases)

**Pattern:**
```typescript
// External
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

// Internal components
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

// Types
import type { Contact, Tag } from '@/lib/types/database'
```

**Path Aliases:**
- `@/*` maps to `src/*` (configured in `tsconfig.json`)
- Always use absolute imports via `@/` prefix: `@/lib/utils`, `@/components/ui/button`

## Error Handling

**Patterns:**

**Error Class Hierarchy:**
```typescript
// Base error with context
export class AgentError extends Error {
  readonly category: string = 'agent'
  readonly retryable: boolean = false
  readonly context?: Record<string, unknown>

  toJSON(): Record<string, unknown> { ... }
}

// Specialized errors extend base
export class VersionConflictError extends SessionError {
  readonly retryable = true  // Override retryability
  readonly sessionId: string
  readonly expectedVersion: number
}
```

**Retryable vs Non-Retryable:**
- Errors include `retryable: boolean` flag
- Rate limits (429), service unavailable (503): `retryable = true`
- Validation errors, not found, permissions: `retryable = false`
- Version conflicts (optimistic locking): `retryable = true`

**Server Actions:**
```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

export async function createContact(data: unknown): Promise<ActionResult<Contact>> {
  try {
    // validation, business logic
    return { success: true, data: contact }
  } catch (error) {
    return { error: 'Error message', field: 'fieldName' }
  }
}
```

**Tool Execution:**
```typescript
export type ToolResult<T> = ToolSuccess<T> | ToolError

export interface ToolError {
  success: false
  error: {
    type: ToolErrorType  // 'validation_error' | 'not_found' | 'duplicate' | etc.
    code: string  // 'PHONE_DUPLICATE'
    message: string  // Spanish for user
    suggestion?: string  // Recovery action
    retryable: boolean
  }
}
```

**Try-Catch Usage:**
- Database operations wrapped in try-catch
- Error logging before re-throw
- Specialized errors thrown for specific scenarios

## Logging

**Framework:** Pino (structured JSON logging)

**Module Logger Pattern:**
```typescript
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('module-name')

logger.info({ key: 'value' }, 'Message')
logger.error({ error: err }, 'Error occurred')
logger.debug({ sessionId }, 'Debug info')
```

**When to Log:**
- Info: State changes, session lifecycle events, tool registration
- Warn: Invalid transitions, validation failures, version conflicts
- Error: Unexpected errors, database failures, external API errors
- Debug: Detailed execution flow, token usage, performance metrics

**Structure:**
- First param: structured data object
- Second param: human-readable message
- Include relevant IDs: `sessionId`, `agentId`, `toolName`, `workspaceId`

## Comments

**When to Comment:**
- File-level JSDoc header describing purpose and phase number
- Complex business logic requiring explanation
- Public API functions and classes
- State machine transitions and validation rules
- Architectural decisions (why, not what)

**Example:**
```typescript
/**
 * Session Manager
 * Phase 13: Agent Engine Core - Plan 02
 *
 * Handles session CRUD operations with optimistic locking.
 * All database operations use admin client to bypass RLS
 * (workspace isolation enforced via explicit workspace_id filters).
 */
export class SessionManager { ... }
```

**Inline Comments:**
- Explain non-obvious business rules
- Mark sections with `// ====== Section Name ======`
- Clarify complex algorithms or data transformations
- Document workarounds with context

**Avoid:**
- Commenting obvious code
- Redundant type information (TypeScript provides this)
- Commented-out code (use version control)

## JSDoc/TSDoc

**Usage:**
- Required for public APIs, exported functions, classes
- Include `@param`, `@returns`, `@throws`, `@example`
- Type information in TypeScript signature, not JSDoc

**Pattern:**
```typescript
/**
 * Execute a tool with full logging and dry-run support
 *
 * Flow:
 * 1. Validate tool exists
 * 2. Validate inputs against JSON Schema
 * 3. Check permissions (if userRole provided)
 * 4. Execute handler (real or dry-run)
 * 5. Log execution to audit trail
 * 6. Return result
 *
 * @param toolName - The tool to execute (e.g., 'crm.contact.create')
 * @param inputs - The inputs to pass to the tool
 * @param options - Execution options including context and dryRun flag
 * @param userRole - Optional user role for permission checking
 *
 * @throws ToolValidationError if inputs fail schema validation
 * @throws PermissionError if user lacks required permissions
 * @throws ToolNotFoundError if tool doesn't exist
 *
 * @example
 * const result = await executeTool('crm.contact.create', { ... }, { ... })
 */
export async function executeTool<TOutput = unknown>( ... ) { ... }
```

## Function Design

**Size:**
- Keep focused and single-purpose
- Extract complex logic into separate functions
- Agent orchestrators can be longer (100-300 lines) due to state machine complexity

**Parameters:**
- Use object parameters for >3 params
- Required params first, optional params after
- Use discriminated unions for flexible params: `ExecutionOptions`, `UpdateSessionParams`
- Context objects bundle related data: `ExecutionContext`, `RequestContext`

**Return Values:**
- Explicit return types on all exported functions
- Use discriminated unions for success/failure: `ActionResult<T>`, `ToolResult<T>`
- Async functions return `Promise<T>`
- Avoid `void` return on Server Actions (return result object)

**Pattern for Discriminated Unions:**
```typescript
type Result<T> = { success: true; data: T } | { success: false; error: string }

// Consumer uses type guard
if (result.success) {
  // TypeScript knows result.data exists
} else {
  // TypeScript knows result.error exists
}
```

## Module Design

**Exports:**
- Named exports preferred over default exports
- Re-export from index files to create clean module boundaries
- Export types alongside implementations

**Pattern:**
```typescript
// src/lib/agents/index.ts
export { AgentRegistry, agentRegistry } from './registry'
export { SessionManager } from './session-manager'
export { Orchestrator } from './orchestrator'
export type { AgentSession, SessionState } from './types'
```

**Barrel Files:**
- Used for complex modules: `src/lib/agents/index.ts`, `src/lib/tools/index.ts`
- Group related exports by category (types, classes, functions)
- Include comments documenting exported items

**Self-Registration Pattern:**
```typescript
// src/lib/agents/somnio/index.ts
import { agentRegistry } from '../registry'
import { somnioAgentConfig } from './config'

// Register the agent when module is imported
agentRegistry.register(somnioAgentConfig)

export { somnioAgentConfig }
```

## Server Actions vs Client Components

**Server Actions:**
- Marked with `'use server'` directive at top of file
- Located in `src/app/actions/`
- Always async functions
- Use `createClient()` from `@/lib/supabase/server` (RLS-aware)
- Return `ActionResult<T>` discriminated union
- Call `revalidatePath()` after mutations

**Client Components:**
- Marked with `'use client'` directive
- Use `createClient()` from `@/lib/supabase/client` (browser client)
- React hooks: `useState`, `useEffect`, `useForm`
- Import Server Actions and call directly (no API routes needed)

**API Routes:**
- Used for webhooks, external integrations, tool endpoints
- Located in `src/app/api/`
- Use `NextRequest`, `NextResponse`
- Admin operations use `createAdminClient()` to bypass RLS

## Supabase Client Usage

**Three Client Types:**

1. **Server Client** (`createClient()` from `@/lib/supabase/server`):
   - For Server Actions and Server Components
   - RLS-aware (respects user session)
   - Uses cookies for auth

2. **Browser Client** (`createClient()` from `@/lib/supabase/client`):
   - For Client Components
   - RLS-aware
   - Uses localStorage for auth

3. **Admin Client** (`createAdminClient()`):
   - Bypasses RLS (service role key)
   - For webhooks, background jobs, system operations
   - Workspace isolation via explicit `workspace_id` filters

**Pattern:**
```typescript
// Server Action
'use server'
import { createClient } from '@/lib/supabase/server'

export async function getContacts() {
  const supabase = await createClient()  // RLS enforces workspace
  const { data } = await supabase.from('contacts').select('*')
  return data
}

// Agent Session Manager (admin)
import { createAdminClient } from '@/lib/supabase/admin'

export class SessionManager {
  private supabase = createAdminClient()  // Bypasses RLS

  async getSession(sessionId: string) {
    // Must filter by workspace_id explicitly for security
    const { data } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)  // Manual isolation
    return data
  }
}
```

## State Management Patterns

**Refs vs State for Closures:**
- Use `useRef` for values accessed in closures that shouldn't trigger re-renders
- Use `useState` for UI state that triggers re-renders
- Agent context stored in refs to avoid stale closures in timers

**Optimistic Locking:**
- Version column on `agent_sessions` table
- Read with current version → Modify → Write with version check
- Throw `VersionConflictError` on conflict (retryable)
- Caller reloads fresh data and retries

**Pattern:**
```typescript
async updateSessionWithVersion(
  sessionId: string,
  expectedVersion: number,
  updates: UpdateSessionParams
): Promise<AgentSession> {
  const { data, error } = await supabase
    .from('agent_sessions')
    .update({ ...updates, version: expectedVersion + 1 })
    .eq('id', sessionId)
    .eq('version', expectedVersion)  // Version check
    .select()
    .single()

  if (error?.code === 'PGRST116' || !data) {
    throw new VersionConflictError(sessionId, expectedVersion)
  }

  return data
}
```

## Agent Pattern

**Registry System:**
- Singleton registries: `agentRegistry`, `toolRegistry`
- Self-registration on module import
- Code-defined configs (not database-stored)

**Orchestrator Composition:**
- Intent Detector → Orchestrator → Tool Execution → Response
- Each component is a separate class with single responsibility
- Orchestrator has overall flow control and state machine validation

**Tool Execution:**
- `ToolResult<T>` discriminated union for all tool handlers
- Dry-run mode supported via `dryRun: boolean` parameter
- Full forensic logging with `tool_executions` table

## Timer Signal Patterns

**Context Provider:**
- Agent state stored in refs to avoid stale closures
- Timer signals passed to context via `lastTimerSignal` ref
- Context refreshed on each timer trigger

**Pattern:**
```typescript
// Inngest function (agent-timers.ts)
const timerSignal = { phase: 'L3', triggeredAt: Date.now() }

// Store in context provider
contextProviderRef.current = {
  lastTimerSignal: timerSignal,
  // ... other context
}

// Orchestrator checks for timer signal
if (context.lastTimerSignal?.phase === 'L3') {
  // Force progression logic
}
```

---

*Convention analysis: 2026-02-09*
