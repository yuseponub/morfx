# Phase 3: Action DSL Core - Research

**Researched:** 2026-01-28
**Domain:** Tool Registry & Execution System with JSON Schema Validation
**Confidence:** HIGH

## Summary

This phase requires building a schema-first tool registry that enables AI agents and external systems to discover and execute operations programmatically. The research reveals that the Model Context Protocol (MCP) has established a de facto standard for tool schemas using JSON Schema 2020-12, which provides the exact structure needed for this phase.

The standard stack centers on Ajv for JSON Schema validation (it's the industry-standard validator, not Zod which is schema-first but not JSON Schema compliant), Pino for high-performance structured logging, and PostgreSQL functions (RPC) for transaction management with Supabase. Next.js middleware with Edge Runtime supports API key authentication efficiently.

The critical insight: **Don't confuse schema libraries with validation libraries.** Zod is excellent for TypeScript-first validation but generates JSON Schema as a secondary output. Since AI agents (Claude, GPT, MCP) natively understand JSON Schema, the architecture should be JSON Schema-first with Ajv for validation, not Zod-first with conversion overhead.

**Primary recommendation:** Use JSON Schema 2020-12 as the source of truth for tool definitions, validate with Ajv, generate TypeScript types with json-schema-to-typescript, log executions with Pino to Supabase, and implement transactions via PostgreSQL RPC functions.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ajv | 8.17+ | JSON Schema validation | Fastest validator, supports JSON Schema 2020-12, provides JSONSchemaType<T> for TypeScript, industry standard with 250M+ downloads/month |
| json-schema-to-typescript | 15.0+ | Generate TypeScript types from JSON Schema | Official tooling for Schema → TS conversion, maintains single source of truth, prevents drift |
| pino | 9.5+ | Structured logging | 50,000+ logs/sec with 2-4% CPU, JSON-first output, de facto standard for Node.js high-performance logging |
| jose | 5.9+ | JWT/API key validation (Edge Runtime) | Web Crypto API compatible, works in Edge Runtime (unlike jsonwebtoken), recommended by Next.js team |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ajv-formats | 3.0+ | JSON Schema format validators | When validating email, uri, date-time formats in schemas |
| pino-http | 10.3+ | HTTP request logging | For logging Server Actions and API routes with request context |
| @supabase/supabase-js | 2.48+ | Database client with RLS | For storing tool_executions with workspace isolation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Ajv | Zod | Zod is TypeScript-first, generates JSON Schema poorly, AI agents prefer native JSON Schema |
| Pino | Winston | Winston is slower (10k logs/sec vs 50k), higher CPU usage, but more transports built-in |
| jose | jsonwebtoken | jsonwebtoken doesn't work in Edge Runtime, jose does |
| PostgreSQL RPC | Prisma transactions | Prisma works but bypasses RLS, RPC functions respect RLS policies |

**Installation:**
```bash
npm install ajv ajv-formats json-schema-to-typescript pino pino-http jose @supabase/supabase-js
npm install --save-dev @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
morfx/src/
├── lib/
│   ├── tools/
│   │   ├── registry.ts          # Tool registry singleton
│   │   ├── executor.ts          # Tool execution engine with dry-run
│   │   ├── schemas/             # JSON Schema definitions
│   │   │   ├── crm.tools.json   # CRM tool schemas
│   │   │   └── whatsapp.tools.json
│   │   ├── types/               # Generated TypeScript types
│   │   │   ├── crm.tools.d.ts   # Auto-generated from schemas
│   │   │   └── whatsapp.tools.d.ts
│   │   └── handlers/            # Tool implementation handlers
│   │       ├── crm/
│   │       └── whatsapp/
│   ├── audit/
│   │   ├── logger.ts            # Pino logger instance
│   │   └── tool-logger.ts       # Tool execution logging
│   └── auth/
│       └── api-key.ts           # API key validation
└── app/
    └── api/
        └── v1/
            └── tools/
                └── [toolName]/
                    └── route.ts  # Dynamic tool invocation endpoint
```

### Pattern 1: Schema-First Tool Definition (MCP-Compatible)
**What:** Define tools as JSON Schema 2020-12 objects following MCP specification
**When to use:** For every tool in the system
**Example:**
```typescript
// Source: https://modelcontextprotocol.io/specification/draft/server/tools
// lib/tools/schemas/crm.tools.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "tools": [
    {
      "name": "crm.contact.create",
      "description": "Create a new contact in the active workspace CRM",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Full name of contact" },
          "phone": {
            "type": "string",
            "pattern": "^\\+[1-9]\\d{1,14}$",
            "description": "Phone with country code (+57...)"
          },
          "email": { "type": "string", "format": "email" },
          "tags": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "required": ["name", "phone"],
        "additionalProperties": false
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "contactId": { "type": "string" },
          "created": { "type": "boolean" }
        },
        "required": ["contactId", "created"]
      },
      "metadata": {
        "module": "crm",
        "entity": "contact",
        "action": "create",
        "reversible": false,
        "requiresApproval": false,
        "sideEffects": ["creates_record"],
        "permissions": ["contacts:write"]
      }
    }
  ]
}
```

### Pattern 2: Type-Safe Tool Registry
**What:** Singleton registry that validates and executes tools
**When to use:** Central orchestration point for all tool operations
**Example:**
```typescript
// Source: Verified pattern combining MCP spec + Ajv docs
// lib/tools/registry.ts
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { ToolSchema, ToolExecution } from './types'

class ToolRegistry {
  private ajv: Ajv
  private tools: Map<string, ToolSchema>

  constructor() {
    this.ajv = new Ajv({
      strict: true,
      allErrors: true,
      useDefaults: true
    })
    addFormats(this.ajv)
    this.tools = new Map()
  }

  register(schema: ToolSchema): void {
    // Compile validator for performance
    const validator = this.ajv.compile(schema.inputSchema)
    this.tools.set(schema.name, {
      ...schema,
      _validator: validator
    })
  }

  async execute<T>(
    toolName: string,
    inputs: unknown,
    options: { dryRun?: boolean; context: ExecutionContext }
  ): Promise<ToolExecution<T>> {
    const tool = this.tools.get(toolName)
    if (!tool) throw new Error(`Unknown tool: ${toolName}`)

    // Validate inputs
    if (!tool._validator(inputs)) {
      throw new ValidationError(tool._validator.errors)
    }

    // Execute or dry-run
    const result = options.dryRun
      ? await this.simulateExecution(tool, inputs)
      : await this.realExecution(tool, inputs, options.context)

    // Log execution
    await logToolExecution({
      tool_name: toolName,
      inputs,
      outputs: result,
      status: options.dryRun ? 'dry_run' : 'success',
      ...options.context
    })

    return result
  }

  listTools(): ToolSchema[] {
    return Array.from(this.tools.values())
  }
}

export const toolRegistry = new ToolRegistry()
```

### Pattern 3: Dry-Run Instruction Separation
**What:** Separate planning (dry-run) from execution to avoid conditional soup
**When to use:** Every tool handler must support dry-run mode
**Example:**
```typescript
// Source: https://www.gresearch.com/news/in-praise-of-dry-run/
// lib/tools/handlers/crm/create-contact.ts

type Instruction = {
  type: 'create_contact'
  data: ContactInput
}

// Step 1: Generate instructions (dry-run safe)
function planCreateContact(input: ContactInput): Instruction[] {
  return [
    { type: 'create_contact', data: input }
  ]
}

// Step 2: Execute instructions (dry-run aware)
async function executeInstructions(
  instructions: Instruction[],
  dryRun: boolean
): Promise<ContactOutput> {
  if (dryRun) {
    // Validation only, return preview
    return {
      contactId: 'dry_run_preview',
      created: true
    }
  }

  // Real execution
  const result = await supabase
    .from('contacts')
    .insert(instructions[0].data)
    .select()

  return {
    contactId: result.data[0].id,
    created: true
  }
}

// Handler combines both
export async function handleCreateContact(
  input: ContactInput,
  dryRun: boolean
): Promise<ContactOutput> {
  const instructions = planCreateContact(input)
  return executeInstructions(instructions, dryRun)
}
```

### Pattern 4: Forensic Audit Logging
**What:** Structured logs with complete execution context for compliance and debugging
**When to use:** Every tool execution without exception
**Example:**
```typescript
// Source: https://signoz.io/guides/pino-logger/ + Audit logging best practices
// lib/audit/tool-logger.ts
import pino from 'pino'

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label })
  },
  redact: {
    paths: ['*.password', '*.token', '*.apiKey'],
    remove: true
  }
})

interface ToolExecutionLog {
  tool_name: string
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  status: 'success' | 'error' | 'dry_run'
  error_message?: string
  error_stack?: string
  started_at: string
  completed_at: string
  duration_ms: number
  user_id: string
  workspace_id: string
  session_id?: string
  request_context: {
    ip?: string
    user_agent?: string
    source: 'ui' | 'api' | 'agent' | 'webhook'
  }
  snapshot_before?: Record<string, unknown>
  snapshot_after?: Record<string, unknown>
}

export async function logToolExecution(log: ToolExecutionLog) {
  const startTime = Date.now()

  // Log to console (structured JSON)
  logger.info({
    event: 'tool_execution',
    ...log
  })

  // Persist to Supabase (forensic audit)
  await supabase.from('tool_executions').insert({
    id: crypto.randomUUID(),
    ...log,
    created_at: new Date().toISOString()
  })

  const endTime = Date.now()
  logger.debug({
    event: 'log_persisted',
    duration_ms: endTime - startTime
  })
}
```

### Pattern 5: Supabase RPC for Transactions
**What:** Use PostgreSQL functions for atomic operations with RLS enforcement
**When to use:** Batch executions or operations requiring rollback capability
**Example:**
```typescript
// Source: https://supabase.com/docs + https://github.com/orgs/supabase/discussions/4562
// Database: Create PostgreSQL function
/*
CREATE OR REPLACE FUNCTION execute_contact_batch(
  p_workspace_id uuid,
  p_contacts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- RLS is enforced automatically
  -- Transaction is implicit

  INSERT INTO contacts (workspace_id, name, phone, email)
  SELECT
    p_workspace_id,
    (contact->>'name')::text,
    (contact->>'phone')::text,
    (contact->>'email')::text
  FROM jsonb_array_elements(p_contacts) AS contact
  RETURNING jsonb_agg(
    jsonb_build_object('id', id, 'name', name)
  ) INTO v_result;

  -- If any error, entire transaction rolls back
  RETURN v_result;
END;
$$;
*/

// TypeScript: Invoke RPC
import { createClient } from '@supabase/supabase-js'

export async function executeBatch(contacts: ContactInput[]) {
  const { data, error } = await supabase.rpc('execute_contact_batch', {
    p_workspace_id: getCurrentWorkspace(),
    p_contacts: contacts
  })

  if (error) throw error
  return data
}
```

### Pattern 6: API Key Authentication in Edge Middleware
**What:** Validate API keys in Next.js middleware for external tool invocations
**When to use:** Protecting /api/v1/tools/* routes
**Example:**
```typescript
// Source: https://medium.com/@shuhan.chan08/authentication-in-next-js-middleware-edge-runtime-limitations-solutions-7692a44f47ab
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  // Only run on API routes
  if (!request.nextUrl.pathname.startsWith('/api/v1/tools')) {
    return NextResponse.next()
  }

  // Extract API key
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing API key' },
      { status: 401 }
    )
  }

  const apiKey = authHeader.substring(7)

  // Validate against Supabase (edge-compatible)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('api_keys')
    .select('workspace_id, permissions')
    .eq('key_hash', hashApiKey(apiKey))
    .eq('revoked', false)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 401 }
    )
  }

  // Add workspace context to headers
  const response = NextResponse.next()
  response.headers.set('x-workspace-id', data.workspace_id)
  response.headers.set('x-permissions', JSON.stringify(data.permissions))

  return response
}

export const config = {
  matcher: '/api/v1/tools/:path*'
}
```

### Anti-Patterns to Avoid
- **Zod-first schemas:** AI agents understand JSON Schema natively, converting from Zod adds overhead and loses precision
- **Inline validation:** Always use compiled validators from Ajv for performance (10x faster than runtime compilation)
- **Text-based logging:** Use structured JSON logging exclusively for machine readability
- **Client-side transactions:** Supabase-js doesn't support transactions, use RPC functions instead
- **Node.js JWT in middleware:** Edge Runtime doesn't support it, use jose library
- **Conditional dry-run soup:** Separate instruction generation from execution to avoid if/else complexity

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema validation | Custom validator with if/else | Ajv with compiled validators | JSON Schema has 100+ edge cases (allOf conflicts, pattern validation, format validators), Ajv handles all specs correctly |
| TypeScript type generation | Manual interfaces from schemas | json-schema-to-typescript | Manual types drift from schemas, generator ensures synchronization, supports $ref resolution |
| Structured logging | console.log with JSON.stringify | Pino with pino-http | Manual logging misses context (PID, hostname), has performance overhead, lacks redaction for secrets |
| Transaction management | Try/catch with manual rollback | PostgreSQL RPC functions | Custom rollback logic misses edge cases (connection failures, partial commits), RPC enforces atomicity |
| API key hashing | crypto.createHash('sha256') | bcrypt or argon2 for production | SHA-256 is too fast (vulnerable to brute force), use proper password hashing with salt |
| JWT validation in Edge | jsonwebtoken library | jose library | jsonwebtoken uses Node.js crypto, Edge Runtime only supports Web Crypto API |
| Tool discovery | Custom registry scanning | MCP-compatible listTools() | MCP is industry standard, AI agents expect MCP format, custom formats require client-side adaptation |

**Key insight:** Schema validation is deceptively complex. JSON Schema 2020-12 supports conditional schemas (`if/then/else`), dynamic references (`$dynamicRef`), and vocabulary extension. Ajv's compiled validators pre-compute validation logic for 10x performance. Don't hand-roll what took years to standardize.

## Common Pitfalls

### Pitfall 1: Schema and Type Drift
**What goes wrong:** JSON Schema and TypeScript types get out of sync, runtime validation passes but TypeScript compilation fails (or vice versa)
**Why it happens:** Manually maintaining both schema and type definitions
**How to avoid:** Use json-schema-to-typescript to generate types from schemas as a build step, make schemas the single source of truth
**Warning signs:** Type errors at runtime despite TypeScript compilation passing, validation errors for "valid" TypeScript objects

### Pitfall 2: Union Type Limitations in JSONSchemaType
**What goes wrong:** TypeScript JSONSchemaType can't verify all union members are present in anyOf/oneOf
**Why it happens:** TypeScript type system limitation, can't enumerate union members at compile time
**How to avoid:** Use manual type assertions for complex unions OR generate types with json-schema-to-typescript which handles unions correctly
**Warning signs:** Missing union cases that pass TypeScript checks but fail at runtime

### Pitfall 3: Edge Runtime API Limitations
**What goes wrong:** Code works locally (Node.js runtime) but fails in production (Edge Runtime)
**Why it happens:** Edge Runtime doesn't support all Node.js APIs (fs, path, crypto with certain algorithms)
**How to avoid:** Use Edge-compatible libraries (jose not jsonwebtoken, Web Crypto API), test with `next dev` which simulates Edge Runtime
**Warning signs:** "Module not found" errors in production, crypto errors in middleware

### Pitfall 4: RLS Bypass with Direct Queries
**What goes wrong:** Tool executions bypass workspace isolation, users access other workspaces' data
**Why it happens:** Using service role key for direct queries instead of RPC functions
**How to avoid:** Always use PostgreSQL RPC functions with SECURITY DEFINER, functions inherit RLS policies, verify workspace_id in function logic
**Warning signs:** Users seeing data from other workspaces, audit logs showing cross-workspace access

### Pitfall 5: Logging Sensitive Data
**What goes wrong:** Passwords, API keys, tokens appear in logs, compliance violation
**Why it happens:** Logging entire request/response objects without redaction
**How to avoid:** Use Pino's redact configuration to remove sensitive paths, never log raw credentials
**Warning signs:** Audit finding credentials in logs, GDPR/SOC2 compliance failures

### Pitfall 6: Synchronous Logging Performance
**What goes wrong:** Tool execution slows down as logging volume increases
**Why it happens:** Blocking on database writes for each log entry
**How to avoid:** Use Pino's async mode, batch log writes, use pino-http for automatic request logging
**Warning signs:** Tool execution time increases with log size, high P99 latency

### Pitfall 7: additionalProperties: false Conflicts
**What goes wrong:** Schema validation fails with "additionalProperties" error despite valid data
**Why it happens:** Using allOf with additionalProperties:false in multiple subschemas that define different properties
**How to avoid:** Define additionalProperties at root level only, OR use unevaluatedProperties in JSON Schema 2020-12
**Warning signs:** Validation errors for schemas that look correct, allOf schemas rejecting valid inputs

## Code Examples

Verified patterns from official sources:

### Tool Schema Generation Script
```typescript
// Source: https://github.com/bcherny/json-schema-to-typescript
// scripts/generate-tool-types.ts
import { compile } from 'json-schema-to-typescript'
import { readFileSync, writeFileSync } from 'fs'
import { glob } from 'glob'

async function generateTypes() {
  const schemaFiles = await glob('src/lib/tools/schemas/*.json')

  for (const schemaFile of schemaFiles) {
    const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
    const typeName = schemaFile
      .split('/')
      .pop()!
      .replace('.json', '')
      .replace(/\./g, '_')
      .toUpperCase() + '_SCHEMA'

    const ts = await compile(schema, typeName, {
      bannerComment: `/* Auto-generated from ${schemaFile} - DO NOT EDIT */`,
      style: {
        singleQuote: true,
        semi: false
      }
    })

    const outFile = schemaFile.replace('.json', '.d.ts')
    writeFileSync(outFile, ts)
    console.log(`Generated ${outFile}`)
  }
}

generateTypes().catch(console.error)
```

### Dynamic Tool API Route
```typescript
// Source: Next.js App Router patterns + MCP spec
// app/api/v1/tools/[toolName]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { toolRegistry } from '@/lib/tools/registry'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ toolName: string }> }
) {
  try {
    const { toolName } = await params
    const body = await request.json()

    // Extract context from middleware headers
    const workspaceId = request.headers.get('x-workspace-id')
    const permissions = JSON.parse(
      request.headers.get('x-permissions') || '[]'
    )

    // Execute tool
    const result = await toolRegistry.execute(toolName, body.inputs, {
      dryRun: body.dry_run ?? false,
      context: {
        user_id: 'api_user', // API users don't have user_id
        workspace_id: workspaceId!,
        request_context: {
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          user_agent: request.headers.get('user-agent') || 'unknown',
          source: 'api'
        }
      }
    })

    return NextResponse.json({
      execution_id: result.id,
      status: result.status,
      outputs: result.outputs,
      duration_ms: result.duration_ms
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: 'Invalid inputs', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod for everything | JSON Schema for AI-facing APIs, Zod for internal validation | 2024-2025 (MCP adoption) | AI agents understand JSON Schema natively, better tool discovery |
| Winston logging | Pino logging | 2023+ | 5x performance improvement, lower CPU usage, JSON-first output |
| Prisma transactions | PostgreSQL RPC functions with Supabase | 2024+ (Supabase RLS maturity) | RLS enforcement in transactions, workspace isolation guaranteed |
| jsonwebtoken everywhere | jose for Edge Runtime | 2023+ (Next.js 13+ Edge) | Edge Runtime compatibility, Web Crypto API standard |
| Manual type definitions | Generated types from JSON Schema | 2022+ (tooling maturity) | Single source of truth, no drift between schema and types |

**Deprecated/outdated:**
- **Joi validation:** Superseded by Ajv for JSON Schema, Zod for TypeScript-first. Joi lacks JSON Schema support.
- **Bunyan logging:** Abandoned (last release 2018), use Pino instead (same JSON-first philosophy, active development)
- **JSON Schema Draft-04/07:** Use Draft 2020-12 for modern features (unevaluatedProperties, $dynamicRef)

## Open Questions

Things that couldn't be fully resolved:

1. **Batch execution rollback granularity**
   - What we know: PostgreSQL RPC functions provide atomic transactions
   - What's unclear: How to partially rollback a batch (e.g., skip failed items, continue with rest)
   - Recommendation: Start with all-or-nothing atomicity, add savepoint-based partial rollback in Phase 10 if needed

2. **Tool versioning strategy**
   - What we know: MCP spec doesn't mandate versioning, tools are identified by name only
   - What's unclear: How to handle breaking changes to tool schemas without breaking existing AI agent integrations
   - Recommendation: Defer versioning to post-MVP, use semver in tool names if needed (crm.contact.create.v2)

3. **Performance at scale**
   - What we know: Pino handles 50k+ logs/sec, Ajv compiled validators are fast
   - What's unclear: Supabase write throughput for tool_executions table with 1000+ tools/minute
   - Recommendation: Start with direct Supabase writes, monitor performance, consider batching or separate audit database if needed

## Sources

### Primary (HIGH confidence)
- [Model Context Protocol - Tools Specification](https://modelcontextprotocol.io/specification/draft/server/tools) - Official MCP spec for tool schemas
- [Ajv JSON Schema Validator - TypeScript Guide](https://ajv.js.org/guide/typescript.html) - Official Ajv TypeScript documentation
- [Zod Official Documentation](https://zod.dev/) - Zod 4 features and limitations
- [Pino Logger Guide 2026](https://signoz.io/guides/pino-logger/) - Performance characteristics and best practices
- [Supabase TypeScript Support](https://supabase.com/docs/reference/javascript/typescript-support) - Type generation and RLS
- [json-schema-to-typescript GitHub](https://github.com/bcherny/json-schema-to-typescript) - Type generation tooling

### Secondary (MEDIUM confidence)
- [TypeBox vs Zod Comparison](https://betterstack.com/community/guides/scaling-nodejs/typebox-vs-zod/) - Verified with official docs
- [Node.js Logging Best Practices 2026](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/) - Industry standards
- [Next.js Middleware Edge Runtime Limitations](https://medium.com/@shuhan.chan08/authentication-in-next-js-middleware-edge-runtime-limitations-solutions-7692a44f47ab) - Verified with Next.js docs
- [Supabase Database Transactions](https://github.com/orgs/supabase/discussions/4562) - Official Supabase team guidance
- [MCP Tool Schema Practical Guide](https://www.merge.dev/blog/mcp-tool-schema) - Real-world examples
- [Audit Logging Best Practices](https://www.sonarsource.com/resources/library/audit-logging/) - Security industry standards
- [Dry-Run Pattern Best Practices](https://www.gresearch.com/news/in-praise-of-dry-run/) - G-Research engineering blog

### Tertiary (LOW confidence - marked for validation)
- [TypeScript JSON Schema Validation Pitfalls](https://ajv.js.org/guide/typescript.html#limitations) - WebSearch verified with Ajv docs
- [Command Pattern in TypeScript](https://refactoring.guru/design-patterns/command/typescript/example) - General pattern, needs context-specific validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified with official docs and version numbers confirmed
- Architecture: HIGH - MCP spec is authoritative, patterns verified with multiple sources
- Pitfalls: MEDIUM-HIGH - Based on community experience and official limitation docs, some are projected

**Research date:** 2026-01-28
**Valid until:** 2026-03-28 (60 days - relatively stable domain, JSON Schema and MCP specs are stable)

---

## Research Notes

**Key discoveries:**
1. MCP has become the de facto standard for AI tool schemas (adopted by Anthropic, OpenAI, Microsoft)
2. JSON Schema 2020-12 is the lingua franca between AI agents and tool registries
3. Supabase RPC functions are the ONLY way to get transactions with RLS enforcement
4. Edge Runtime requires completely different auth libraries (jose vs jsonwebtoken)
5. Pino's performance advantage is massive (5x Winston), critical for high-volume logging

**What makes this phase unique:**
- Schema-first (not type-first) because AI agents are the primary consumer
- Forensic logging is non-negotiable (compliance, debugging, reversal)
- Dry-run must be first-class, not an afterthought (separation of concerns pattern)
- Transaction semantics are complex with RLS (PostgreSQL functions are the solution)

**Implementation risks:**
- LOW: JSON Schema validation (well-understood, mature tooling)
- LOW: Structured logging (Pino is battle-tested)
- MEDIUM: Batch transactions with RLS (requires PostgreSQL expertise)
- MEDIUM: Dry-run implementation (requires discipline to avoid conditional soup)
