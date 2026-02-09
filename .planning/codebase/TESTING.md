# Testing Patterns

**Analysis Date:** 2026-02-09

## Test Framework

**Runner:**
- No test framework detected
- No `jest.config.*`, `vitest.config.*`, or similar test configuration files

**Assertion Library:**
- None configured

**Run Commands:**
```bash
# No test commands available in package.json
# Scripts available: dev, build, start, lint
```

**Status:**
- Project does not currently have a test suite
- No test files found (no `.test.ts`, `.spec.ts`, `.test.tsx`, `.spec.tsx`)

## Test File Organization

**Location:**
- Not applicable (no tests)

**Naming:**
- Not applicable (no tests)

**Structure:**
- Not applicable (no tests)

## Test Structure

**Suite Organization:**
- No test suites currently exist

**Patterns:**
- Not established

## Mocking

**Framework:**
- No mocking library detected

**Patterns:**
- Not established

**What to Mock:**
- Recommendations for future implementation:
  - Supabase client instances (`createClient`, `createAdminClient`)
  - External API calls (360dialog WhatsApp API, Anthropic Claude API)
  - Inngest event triggers
  - Date/time functions for timer-based logic

**What NOT to Mock:**
- Pure functions (normalizers, validators, data transformers)
- Type definitions
- Constants

## Fixtures and Factories

**Test Data:**
- No fixtures currently exist

**Location:**
- Not applicable

**Recommendations for Future:**
- Create factory functions for common test entities:
  - `createMockAgentSession()` - Generate test sessions with configurable state
  - `createMockContact()` - Generate test contacts
  - `createMockToolExecution()` - Generate tool execution records
  - `createMockConversation()` - Generate WhatsApp conversations

## Coverage

**Requirements:**
- No coverage requirements currently enforced

**View Coverage:**
- Not applicable

## Test Types

**Unit Tests:**
- Not currently implemented

**Recommendations for High-Priority Unit Tests:**
1. **Error Handling Classes** (`src/lib/agents/errors.ts`):
   - Retryable vs non-retryable classification
   - Error serialization (toJSON methods)
   - Type guards

2. **Data Normalizers** (`src/lib/agents/somnio/normalizers.ts`):
   - Phone number normalization (Colombian format)
   - City/departamento inference
   - Address normalization
   - Negation detection

3. **Tool Validation** (`src/lib/tools/registry.ts`):
   - JSON Schema validation
   - Input coercion and defaults
   - Permission checking

4. **State Machine Validation** (`src/lib/agents/orchestrator.ts`):
   - Valid/invalid transitions
   - Minimum data requirements for progression
   - Terminal state handling

5. **Optimistic Locking** (`src/lib/agents/session-manager.ts`):
   - Version conflict detection
   - Retry logic

**Integration Tests:**
- Not currently implemented

**Recommendations for Future Integration Tests:**
1. **Tool Execution Flow**:
   - End-to-end tool execution with dry-run mode
   - Permission enforcement
   - Rate limiting
   - Forensic logging

2. **Agent Session Lifecycle**:
   - Session creation with initial state
   - State transitions and validation
   - Turn recording
   - Token budget tracking

3. **WhatsApp Webhook Handling**:
   - Message ingestion
   - Status update processing
   - Conversation creation/update

4. **Server Action Patterns**:
   - RLS enforcement via `createClient()`
   - Error handling and ActionResult returns
   - Revalidation after mutations

**E2E Tests:**
- Not currently implemented

**Recommendations:**
- Playwright or Cypress for UI flows
- Critical paths:
  - Contact creation and management
  - WhatsApp conversation handling
  - Order pipeline management
  - Agent-driven sales flow

## Common Patterns

**Async Testing:**
- No established pattern (no tests exist)

**Recommended Pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('executeTool', () => {
  it('should execute tool successfully in dry-run mode', async () => {
    const result = await executeTool(
      'crm.contact.create',
      { name: 'Test', phone: '+573001234567' },
      { dryRun: true, context: mockContext }
    )

    expect(result.status).toBe('dry_run')
    expect(result.outputs).toBeDefined()
  })

  it('should throw ToolValidationError for invalid inputs', async () => {
    await expect(
      executeTool('crm.contact.create', { name: '' }, { context: mockContext })
    ).rejects.toThrow(ToolValidationError)
  })
})
```

**Error Testing:**
- No established pattern (no tests exist)

**Recommended Pattern:**
```typescript
import { describe, it, expect } from 'vitest'
import {
  VersionConflictError,
  isRetryableError,
  isVersionConflictError,
} from '@/lib/agents/errors'

describe('VersionConflictError', () => {
  it('should be retryable', () => {
    const error = new VersionConflictError('session-123', 5)
    expect(error.retryable).toBe(true)
    expect(isRetryableError(error)).toBe(true)
    expect(isVersionConflictError(error)).toBe(true)
  })

  it('should serialize to JSON correctly', () => {
    const error = new VersionConflictError('session-123', 5)
    const json = error.toJSON()
    expect(json.sessionId).toBe('session-123')
    expect(json.expectedVersion).toBe(5)
  })
})
```

## Testing Infrastructure Recommendations

**Framework Choice:**
- **Vitest** - Fast, modern, ESM-first test runner
- TypeScript support out of the box
- Compatible with Next.js 15 and React 19

**Setup Steps:**
```bash
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom happy-dom
```

**Config Pattern:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Mocking Strategy:**
- Mock Supabase clients at module boundary
- Use MSW for external API mocking (360dialog, Anthropic)
- Mock Inngest client for event testing
- Create test utilities for common mock patterns

**Priority Test Areas (in order):**
1. Core error handling and type guards
2. Data normalizers and validators
3. State machine logic (transitions, validations)
4. Tool registry and execution
5. Agent session lifecycle
6. Server Actions with Supabase
7. Component rendering and user interactions

**Test Organization:**
- Co-locate tests: `src/lib/agents/__tests__/errors.test.ts`
- Or separate: `tests/unit/agents/errors.test.ts`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

---

*Testing analysis: 2026-02-09*
