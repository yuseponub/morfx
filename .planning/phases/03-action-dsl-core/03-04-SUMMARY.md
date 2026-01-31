---
phase: 03-action-dsl-core
plan: 04
subsystem: api
tags: [api-key, sha256, middleware, rest-api, mcp, tool-invocation]

# Dependency graph
requires:
  - phase: 03-action-dsl-core/03-02
    provides: Tool registry and executor
  - phase: 03-action-dsl-core/03-03
    provides: 16 registered tools (9 CRM + 7 WhatsApp)
provides:
  - API key validation utility with SHA-256 hashing
  - Middleware integration for /api/v1/tools routes
  - GET /api/v1/tools (tool discovery endpoint)
  - POST /api/v1/tools/{name} (tool execution endpoint)
affects: [04-crm-contacts, 06-whatsapp-integration, ai-agents, n8n-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "API key format: mfx_{32-char-hex}"
    - "SHA-256 for API key hashing (fast, secure for random keys)"
    - "Middleware passes context via x-workspace-id/x-permissions headers"
    - "MCP-compatible tool discovery"

key-files:
  created:
    - src/lib/auth/api-key.ts
    - src/app/api/v1/tools/route.ts
    - src/app/api/v1/tools/[toolName]/route.ts
  modified:
    - middleware.ts

key-decisions:
  - "SHA-256 for API keys (not bcrypt) - fast comparison, keys are random"
  - "Middleware header passing for workspace context"
  - "MCP-compatible discovery endpoint format"

patterns-established:
  - "API key format: mfx_{random-32-hex}"
  - "Tool API: /api/v1/tools for discovery, /api/v1/tools/{name} for execution"
  - "Context via headers: x-workspace-id, x-permissions, x-api-key-prefix"

# Metrics
duration: 10min
completed: 2026-01-28
---

# Phase 3 Plan 4: Tool API Endpoints Summary

**External API layer for tool invocation with SHA-256 API key auth and MCP-compatible discovery endpoint**

## Performance

- **Duration:** 10 min
- **Started:** 2026-01-28T23:50:23Z
- **Completed:** 2026-01-29T00:00:XX
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- API key validation utility with SHA-256 hashing (Edge Runtime compatible)
- Middleware updated to validate API keys for /api/v1/tools routes
- Tool discovery endpoint (GET /api/v1/tools) with module/permission filtering
- Tool execution endpoint (POST /api/v1/tools/{name}) with dry-run support
- Proper error responses (401 Unauthorized, 400 Validation, 404 Unknown Tool)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API Key Validation Utility** - `64cd687` (feat)
2. **Task 2: Update Middleware for API Key Auth** - `7a23490` (feat)
3. **Task 3: Create Tool API Endpoints** - `de2a0c7` (feat)

## Files Created/Modified
- `src/lib/auth/api-key.ts` - API key validation, hashing, generation utilities
- `middleware.ts` - Added API key auth for /api/v1/tools/* routes
- `src/app/api/v1/tools/route.ts` - Tool discovery (list all tools)
- `src/app/api/v1/tools/[toolName]/route.ts` - Tool execution and schema

## Decisions Made

1. **SHA-256 for API keys** - API keys are random (no dictionary attacks), need fast comparison, 36+ chars makes brute force impractical. bcrypt would add unnecessary latency per request.

2. **Header-based context passing** - Middleware sets x-workspace-id and x-permissions headers, route handlers read them. Clean separation of auth and business logic.

3. **MCP-compatible discovery** - Tool schema format matches MCP specification for AI agent compatibility.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Minor:** TypeScript error with `.then().catch()` on Supabase promise - fixed by using `void` prefix instead.

## User Setup Required

**API keys require manual creation for external API access.**

To use the API:
1. Generate an API key using `generateApiKey()` from `src/lib/auth/api-key.ts`
2. Hash it using `hashApiKey()`
3. Insert into `api_keys` table with workspace_id
4. Use the original key in `Authorization: Bearer mfx_...` header

*Phase 10 (Settings UI) will provide a UI for this.*

## Next Phase Readiness

Phase 3 complete - Action DSL Core fully implemented:
- Tool registry with 16 tools
- Tool executor with dry-run and logging
- External API with authentication

Ready for:
- Phase 4: CRM Contacts (implement real handlers)
- Phase 6: WhatsApp Integration (implement real handlers)
- AI agent integration via MCP-compatible API

---
*Phase: 03-action-dsl-core*
*Completed: 2026-01-28*
